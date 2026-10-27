import test from "node:test";
import assert from "node:assert/strict";
import { makePDF } from "../src/export.js";
test("PDF vacío y texto largo generan documentos paginados", async () => {
  const empty = await makePDF([], "2026-10");
  assert.equal(empty.getNumberOfPages(), 1);
  const doc = await makePDF(
    [
      {
        date: "2026-10-02",
        food: "Arroz y café. ".repeat(300),
        symptoms: ["Nàusees"],
        intensity: 8,
        notes: "Nota extensa. ".repeat(300),
        delay: "2 horas",
      },
    ],
    "2026-10",
  );
  assert.ok(doc.getNumberOfPages() > 1);
  assert.ok(doc.output().startsWith("%PDF-"));
});
