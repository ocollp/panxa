import test from "node:test";
import assert from "node:assert/strict";
import {
  createSheetsStore,
  decodeRows,
  HEADERS,
} from "../server/sheets-store.js";
const record = {
  date: "2026-10-01",
  food: "=SUM(A1:A2)",
  symptoms: ["Gasos"],
  intensity: 5,
  delay: "1 hora",
  notes: "Nota\namb salt",
};
function fixture(initial) {
  let sheet = initial
    ? { sheetId: 42, title: "PANXA", gridProperties: { rowCount: 1000 } }
    : null;
  let values = initial || [];
  const calls = [];
  const fake = async (url, options) => {
    assert.match(url, /spreadsheets\/configured-id/);
    assert.equal(options.headers.Authorization, "Bearer token");
    calls.push({ url, options });
    if (options.method === "POST") {
      const body = JSON.parse(options.body);
      for (const req of body.requests) {
        if (req.addSheet) sheet = req.addSheet.properties;
        if (req.updateCells) {
          assert.equal(req.updateCells.fields, "userEnteredValue");
          values = req.updateCells.rows.map((row) =>
            row.values.map(
              (cell) =>
                cell.userEnteredValue.stringValue ??
                cell.userEnteredValue.numberValue,
            ),
          );
        }
      }
      return { ok: true, json: async () => ({}) };
    }
    return {
      ok: true,
      json: async () =>
        url.includes("/values/")
          ? { values }
          : { sheets: sheet ? [{ properties: sheet }] : [] },
    };
  };
  return {
    store: createSheetsStore({
      spreadsheetId: "configured-id",
      getToken: () => "token",
      fetchImpl: fake,
    }),
    calls,
    get values() {
      return values;
    },
  };
}
test("Sheets: crea només PANXA i desa textos com a text, no com a fórmules", async () => {
  const f = fixture();
  assert.deepEqual(await f.store.list("session"), []);
  await f.store.save("session", record);
  assert.deepEqual(f.values[0], HEADERS);
  assert.deepEqual(await f.store.list("session"), [record]);
  const write = JSON.parse(
    f.calls.find((c) => c.options.method === "POST").options.body,
  );
  assert.equal(write.requests[0].addSheet.properties.title, "PANXA");
  assert.equal(
    write.requests[1].updateCells.rows[1].values[1].userEnteredValue
      .stringValue,
    record.food,
  );
});
test("Sheets: edició, conflictes, esborrament i darrera fila", async () => {
  const f = fixture();
  await f.store.save("s", record);
  const updated = { ...record, notes: "Actualitzat" };
  await f.store.save("s", updated, record);
  await assert.rejects(f.store.save("s", record, record), /canviat/);
  await assert.rejects(f.store.remove("s", record), /canviat/);
  await f.store.remove("s", updated);
  assert.deepEqual(await f.store.list("s"), []);
  const writes = f.calls.filter((c) => c.options.method === "POST");
  const last = JSON.parse(writes.at(-1).options.body).requests[0].updateCells;
  assert.equal(last.range.endRowIndex, 2);
  assert.equal(last.rows.length, 1);
});
test("Sheets: serialitza desats simultanis i importa sense sobreescriure", async () => {
  const f = fixture();
  await Promise.all([
    f.store.save("a", record),
    f.store.save("b", { ...record, date: "2026-10-02" }),
  ]);
  assert.equal((await f.store.list("s")).length, 2);
  const result = await f.store.merge("s", [
    { ...record, notes: "Diferent" },
    { ...record, date: "2026-10-03" },
  ]);
  assert.deepEqual(result, {
    inserted: 1,
    accepted: ["2026-10-03"],
    conflicts: ["2026-10-01"],
  });
  assert.equal((await f.store.list("s")).length, 3);
});
test("Sheets: rebutja formats incompatibles, dates duplicades i importacions invàlides abans d’escriure", async () => {
  assert.throws(() => decodeRows([["Dades alienes"]]), /format desconegut/);
  const f = fixture([["Dades alienes"]]);
  await assert.rejects(f.store.save("s", record));
  assert.equal(f.calls.filter((c) => c.options.method === "POST").length, 0);
  const empty = fixture();
  assert.throws(() =>
    empty.store.merge("s", [record, { ...record, date: "2026-09-30" }]),
  );
  assert.equal(empty.calls.length, 0);
});
test("Sheets: autorització caducada i errors de xarxa no es converteixen en desats locals", async () => {
  const store = createSheetsStore({
    spreadsheetId: "id",
    getToken: () => "bad",
    fetchImpl: async () => ({ ok: false, status: 401 }),
  });
  await assert.rejects(store.save("s", record), (e) => e.statusCode === 428);
  const network = createSheetsStore({
    spreadsheetId: "id",
    getToken: () => "token",
    fetchImpl: async () => {
      throw new Error("network");
    },
  });
  await assert.rejects(network.save("s", record), /confirmar/);
});
