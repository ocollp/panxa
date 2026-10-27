import test from "node:test";
import assert from "node:assert/strict";
import {
  validate,
  parseBackup,
  summarize,
  csv,
  validDate,
} from "../src/domain.js";
const sample = {
  date: "2026-10-04",
  food: "Arroz, café",
  symptoms: ["Gasos", "Dolor"],
  intensity: 6,
  notes: "",
  delay: "2 horas",
};
test("validación rechaza fechas imposibles, futuras y síntomas e intensidades inválidos", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2099-01-01"), false);
  for (const patch of [
    { intensity: 11 },
    { intensity: 1.5 },
    { symptoms: [] },
    { symptoms: ["Inventado"] },
    { food: "  " },
    { notes: null },
  ])
    assert.throws(() => validate({ ...sample, ...patch }));
  assert.deepEqual(validate(sample), sample);
});
test("copias: versión, duplicados y registros inválidos no se importan", () => {
  const pack = (records) =>
    JSON.stringify({ app: "PANXA", version: 1, records });
  assert.deepEqual(parseBackup(pack([sample])), [sample]);
  assert.throws(() => parseBackup(pack([sample, sample])));
  assert.throws(() => parseBackup('{"version":2}'));
  assert.throws(() => parseBackup(pack([{ ...sample, intensity: -1 }])));
});
test("resumen cuenta solo registros, no rellena días sin registro", () => {
  const s = summarize([
    sample,
    { ...sample, date: "2026-10-08", symptoms: ["Gasos"], intensity: 0 },
  ]);
  assert.equal(s.count, 2);
  assert.equal(s.average, 3);
  assert.equal(s.symptoms[0].count, 2);
  assert.equal(s.max, 6);
  assert.equal(s.mentions[0].text, "Arroz, café");
  assert.equal(summarize([]).average, null);
});
test("CSV conserva acentos, comillas y saltos, y neutraliza fórmulas de Excel", () => {
  const result = csv([
    { ...sample, food: '=HYPERLINK("bad")', notes: "línea 1\nlínea 2" },
  ]);
  assert.ok(result.startsWith("\uFEFF"));
  assert.ok(result.includes('"\'=HYPERLINK(""bad"")"'));
  assert.ok(result.includes('"línea 1\nlínea 2"'));
  assert.ok(result.includes(";"));
});

test("compatibilitat amb còpies anteriors: tradueix símptomes i conserva el text lliure", () => {
  const legacy = {
    ...sample,
    symptoms: ["Hinchazón", "Gases", "Estreñimiento", "Náuseas", "Otros"],
    food: "Texto original sin modificar",
    notes: "Notas originales",
  };
  const [record] = parseBackup(
    JSON.stringify({ app: "PANXA", version: 1, records: [legacy] }),
  );
  assert.deepEqual(record.symptoms, [
    "Inflor",
    "Gasos",
    "Restrenyiment",
    "Nàusees",
    "Altres",
  ]);
  assert.equal(record.food, legacy.food);
  assert.equal(record.notes, legacy.notes);
});

test("el diari comença l’1 d’octubre de 2026, també per a les importacions", () => {
  assert.equal(validDate("2026-09-30"), false);
  assert.equal(validDate("2025-10-01"), false);
  assert.equal(validDate("2026-10-01"), true);
  assert.throws(() => validate({ ...sample, date: "2026-09-30" }), /octubre/);
  assert.throws(
    () =>
      parseBackup(
        JSON.stringify({
          app: "PANXA",
          version: 1,
          records: [{ ...sample, date: "2026-09-30" }],
        }),
      ),
    /octubre/,
  );
});
