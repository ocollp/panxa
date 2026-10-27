import { validate, normalizeRecord } from "./domain.js";
let connection;
function db() {
  return (connection ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("panxa", 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore("days", { keyPath: "date" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(
        new Error(
          "No es pot obrir l’emmagatzematge local. Comprova els permisos del navegador.",
        ),
      );
  }));
}
export async function readRecords() {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction("days").objectStore("days").getAll();
    req.onsuccess = () =>
      resolve(
        req.result
          .map(normalizeRecord)
          .sort((a, b) => b.date.localeCompare(a.date)),
      );
    req.onerror = () => reject(req.error);
  });
}
async function write(action) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("days", "readwrite");
    let error;
    try {
      action(tx.objectStore("days"), (e) => {
        error = e;
        tx.abort();
      });
    } catch (e) {
      error = e;
      tx.abort();
    }
    tx.oncomplete = resolve;
    tx.onerror = () =>
      reject(
        error ||
          new Error(
            "No s’ha pogut desar. Les dades anteriors continuen intactes.",
          ),
      );
    tx.onabort = () =>
      reject(
        error ||
          new Error(
            "No s’ha pogut desar. Pot ser que ja hi hagi un registre per a aquesta data.",
          ),
      );
  });
}
export async function saveRecord(record, original) {
  const r = validate(record);
  await write((store, abort) => {
    if (original) {
      const req = store.get(original.date);
      req.onsuccess = () => {
        if (
          JSON.stringify(normalizeRecord(req.result)) !==
          JSON.stringify(normalizeRecord(original))
        ) {
          abort(
            new Error(
              "Aquest dia ha canviat en una altra pestanya. Tanca el formulari i torna’l a obrir.",
            ),
          );
          return;
        }
        if (original.date !== r.date) {
          store.delete(original.date);
          store.add(r);
        } else store.put(r);
      };
    } else store.add(r);
  });
}
export async function deleteRecord(original) {
  await write((store, abort) => {
    const req = store.get(original.date);
    req.onsuccess = () => {
      if (
        JSON.stringify(normalizeRecord(req.result)) !==
        JSON.stringify(normalizeRecord(original))
      )
        return abort(
          new Error(
            "Aquest registre ha canviat. Actualitza la pàgina abans d’esborrar-lo.",
          ),
        );
      store.delete(original.date);
    };
  });
}
export async function mergeRecords(records) {
  const clean = records.map(validate);
  await write((store) => {
    for (const r of clean) {
      const req = store.get(r.date);
      req.onsuccess = () => {
        if (!req.result) store.add(r);
      };
    }
  });
}
