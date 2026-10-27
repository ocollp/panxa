import "fake-indexeddb/auto";
import test from "node:test";
import assert from "node:assert/strict";
import {
  saveRecord,
  readRecords,
  deleteRecord,
  mergeRecords,
} from "../src/legacy-storage.js";
const a = {
  date: "2026-10-02",
  food: "Prueba",
  symptoms: ["Gasos"],
  intensity: 4,
  notes: "",
  delay: "",
};
test("persistencia: CRUD, duplicados, conflictos, importación sin sobrescritura y atomicidad", async () => {
  await saveRecord(a);
  assert.deepEqual(await readRecords(), [a]);
  await assert.rejects(saveRecord(a));
  assert.equal((await readRecords()).length, 1);
  const edited = { ...a, notes: "Actualizado" };
  await saveRecord(edited, a);
  await assert.rejects(saveRecord({ ...a, intensity: 8 }, a));
  await assert.rejects(deleteRecord(a));
  const b = { ...a, date: "2026-10-03" };
  await mergeRecords([a, b]);
  assert.equal((await readRecords()).length, 2);
  assert.deepEqual(
    (await readRecords()).find((r) => r.date === a.date),
    edited,
  );
  await assert.rejects(saveRecord({ ...edited, date: b.date }, edited));
  assert.equal((await readRecords()).length, 2);
  await assert.rejects(
    mergeRecords([
      { ...a, date: "2026-10-04" },
      { ...a, intensity: 99 },
    ]),
  );
  assert.equal((await readRecords()).length, 2);
  await deleteRecord(edited);
  await deleteRecord(b);
  assert.deepEqual(await readRecords(), []);
  await mergeRecords([a, b]);
  assert.equal((await readRecords()).length, 2);
  await mergeRecords([a, b]);
  assert.equal((await readRecords()).length, 2);
});
