export const START_DATE = "2026-10-01";
export const START_MONTH = START_DATE.slice(0, 7);
// Compatibility with records and version-1 backups created before Catalan became the app language.
const LEGACY_SYMPTOMS = new Map([
  ["Hinchazón", "Inflor"],
  ["Gases", "Gasos"],
  ["Estreñimiento", "Restrenyiment"],
  ["Náuseas", "Nàusees"],
  ["Otros", "Altres"],
]);
export function normalizeRecord(record) {
  if (!record || !Array.isArray(record.symptoms)) return record;
  return {
    ...record,
    symptoms: record.symptoms.map((s) => LEGACY_SYMPTOMS.get(s) ?? s),
  };
}
export const SYMPTOMS = [
  "Inflor",
  "Gasos",
  "Dolor",
  "Diarrea",
  "Restrenyiment",
  "Nàusees",
  "Altres",
];
export const NOTICE =
  "Només s’analitzen els dies registrats. Un dia sense registre no vol dir un dia sense símptomes. Les mencions d’aliments no demostren causalitat.";
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function validDate(s) {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s)) &&
    new Date(s).toISOString().slice(0, 10) === s &&
    s >= START_DATE &&
    s <= today()
  );
}
export function validate(r) {
  r = normalizeRecord(r);
  if (!r || !validDate(r.date))
    throw new Error(
      "Indica una data vàlida entre l’1 d’octubre de 2026 i avui.",
    );
  if (typeof r.food !== "string" || !r.food.trim() || r.food.length > 5000)
    throw new Error("Escriu què vas menjar (màxim 5.000 caràcters).");
  if (
    !Array.isArray(r.symptoms) ||
    !r.symptoms.length ||
    new Set(r.symptoms).size !== r.symptoms.length ||
    r.symptoms.some((s) => !SYMPTOMS.includes(s))
  )
    throw new Error("Selecciona almenys un símptoma vàlid.");
  if (!Number.isInteger(r.intensity) || r.intensity < 0 || r.intensity > 10)
    throw new Error("La intensitat ha de ser un enter entre 0 i 10.");
  if (typeof r.notes !== "string" || r.notes.length > 5000)
    throw new Error("Les notes admeten fins a 5.000 caràcters.");
  if (typeof r.delay !== "string" || r.delay.length > 150)
    throw new Error("El temps aproximat admet fins a 150 caràcters.");
  return {
    date: r.date,
    food: r.food.trim(),
    symptoms: r.symptoms,
    intensity: r.intensity,
    notes: r.notes.trim(),
    delay: r.delay.trim(),
  };
}
export function parseBackup(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("El fitxer no conté un JSON vàlid.");
  }
  if (
    data?.app !== "PANXA" ||
    data.version !== 1 ||
    !Array.isArray(data.records) ||
    data.records.length > 50000
  )
    throw new Error("El fitxer no és una còpia compatible amb PANXA.");
  const records = data.records.map(validate);
  if (new Set(records.map((r) => r.date)).size !== records.length)
    throw new Error("La còpia conté dates duplicades.");
  return records;
}
export function summarize(records) {
  return {
    count: records.length,
    average: records.length
      ? records.reduce((n, r) => n + r.intensity, 0) / records.length
      : null,
    max: records.length ? Math.max(...records.map((r) => r.intensity)) : null,
    symptoms: SYMPTOMS.map((name) => ({
      name,
      count: records.filter((r) => r.symptoms.includes(name)).length,
    })).sort((a, b) => b.count - a.count),
    mentions: records.map((r) => ({ date: r.date, text: r.food })),
  };
}
export function csv(records) {
  const cell = (v) =>
    '"' +
    String(/^[\s]*[=+@\-\t\r]/.test(String(v)) ? "'" + v : v).replaceAll(
      '"',
      '""',
    ) +
    '"';
  return (
    "\uFEFF" +
    [
      [
        "Data",
        "Què vaig menjar",
        "Símptomes",
        "Intensitat (0-10)",
        "Temps fins als símptomes",
        "Notes",
      ],
      ...records.map((r) => [
        r.date,
        r.food,
        r.symptoms.join(", "),
        r.intensity,
        r.delay,
        r.notes,
      ]),
    ]
      .map((row) => row.map(cell).join(";"))
      .join("\r\n")
  );
}
export function monthLabel(month) {
  return new Date(month + "-01T12:00:00").toLocaleDateString("ca-ES", {
    month: "long",
    year: "numeric",
  });
}
export function dateLabel(date) {
  return new Date(date + "T12:00:00").toLocaleDateString("ca-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
