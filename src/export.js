import { csv, summarize, NOTICE, monthLabel, dateLabel } from "./domain.js";
export function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function exportCSV(records, month) {
  download(csv(records), `panxa-${month}.csv`, "text/csv;charset=utf-8");
}
export function backup(records) {
  download(
    JSON.stringify(
      {
        app: "PANXA",
        version: 1,
        exportedAt: new Date().toISOString(),
        records,
      },
      null,
      2,
    ),
    `panxa-copia-${new Date().toISOString().slice(0, 10)}.json`,
    "application/json",
  );
}
export async function makePDF(records, month) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF();
  let y = 24;
  const line = (text, size = 11, color = [50, 64, 55]) => {
    doc.setFontSize(size);
    doc.setTextColor(...color);
    for (const row of doc.splitTextToSize(text, 170)) {
      if (y > 274) {
        doc.addPage();
        y = 24;
      }
      doc.text(row, 20, y);
      y += size * 0.48 + 2;
    }
    y += 3;
  };
  line("PANXA", 26, [40, 91, 71]);
  line("El teu diari digestiu", 11);
  line(`Informe mensual · ${monthLabel(month)}`, 17);
  line(NOTICE, 10);
  const s = summarize(records);
  line(
    `${s.count} dies registrats · Intensitat mitjana: ${s.average === null ? "Sense dades" : s.average.toLocaleString("ca-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + " / 10"} · Màxima: ${s.max ?? "Sense dades"}`,
    12,
  );
  line("Freqüència de símptomes (dies registrats)", 14);
  s.symptoms.forEach((x) => line(`${x.name}: ${x.count}`, 10));
  line("Aliments esmentats i detall dels registres", 14);
  if (!records.length) line("No hi ha registres aquest mes.");
  records.forEach((r) => {
    line(dateLabel(r.date), 13, [40, 91, 71]);
    line(`Què vaig menjar: ${r.food}`);
    line(`Símptomes: ${r.symptoms.join(", ")} · Intensitat: ${r.intensity}/10`);
    if (r.delay) line(`Temps aproximat: ${r.delay}`);
    if (r.notes) line(`Notes: ${r.notes}`);
    y += 4;
  });
  for (let i = 1; i <= doc.getNumberOfPages(); i++) {
    doc.setPage(i);
    doc.setFontSize(9);
    doc.setTextColor(100);
    doc.text(`PANXA · ${month} | ${i} / ${doc.getNumberOfPages()}`, 20, 287);
  }
  return doc;
}
export async function exportPDF(records, month) {
  (await makePDF(records, month)).save(`panxa-${month}.pdf`);
}
