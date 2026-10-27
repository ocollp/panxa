import React, { useEffect, useState } from "react";
import { readRecords, deleteRecord } from "./legacy-storage.js";
import { mergeRecords } from "./storage.js";
import { backup } from "./export.js";
export function LegacyImport({ onImported }) {
  const [records, setRecords] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const read = async () => {
    try {
      setRecords(await readRecords());
    } catch {
      setError("No s’han pogut llegir els registres locals anteriors.");
    }
  };
  useEffect(() => {
    read();
  }, []);
  if (!records.length && !error) return null;
  return (
    <section className="legacy-import">
      <h2>Recupera el teu diari anterior</h2>
      <p>
        Hi ha {records.length} registres de la versió local en aquest navegador.
        Pots traslladar-los al teu full. Les còpies locals es retiraran només
        després de confirmar el guardat a Google Sheets; els conflictes es
        conservaran.
      </p>
      <div className="export-buttons">
        <button
          className="secondary"
          disabled={busy || !records.length}
          onClick={() => backup(records)}
        >
          Descarregar còpia local
        </button>
        <button
          className="primary"
          disabled={busy || !records.length}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await mergeRecords(records);
              for (const r of records.filter((r) =>
                result.accepted.includes(r.date),
              ))
                await deleteRecord(r);
              await read();
              await onImported();
              if (result.conflicts.length)
                setError(
                  "Algunes dates ja tenen dades diferents al compte. N’hem conservat la còpia local; descarrega-la abans de resoldre-les.",
                );
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Traslladant…" : "Traslladar al meu compte"}
        </button>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
