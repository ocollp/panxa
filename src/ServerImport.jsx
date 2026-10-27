import React, { useEffect, useState } from "react";
import { api } from "./api.js";
import { readRecords, mergeRecords } from "./storage.js";
import { backup } from "./export.js";
export function ServerImport({ onImported }) {
  const [records, setRecords] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const read = async () => {
    const [legacy, current] = await Promise.all([
      api("/legacy/records"),
      readRecords(),
    ]);
    setRecords(
      legacy.records.filter(
        (r) => !current.some((c) => JSON.stringify(c) === JSON.stringify(r)),
      ),
    );
  };
  useEffect(() => {
    read().catch((e) => setError(e.message));
  }, []);
  if (!records.length && !error) return null;
  return (
    <section className="legacy-import">
      <h2>Recupera els registres del servidor anterior</h2>
      <p>
        Hi ha {records.length} registres anteriors pendents de traslladar al
        full. Conservarem l’arxiu local de seguretat; no se sobreescriuran dates
        amb dades diferents.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="export-buttons">
        <button
          className="secondary"
          disabled={!records.length}
          onClick={() => backup(records)}
        >
          Descarregar còpia anterior
        </button>
        <button
          className="primary"
          disabled={busy || !records.length}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const result = await mergeRecords(records);
              await read();
              await onImported();
              if (result.conflicts.length)
                setError(
                  "Hi ha dates amb dades diferents al full. Hem conservat els registres anteriors perquè els puguis revisar.",
                );
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Traslladant…" : "Traslladar a Google Sheets"}
        </button>
      </div>
    </section>
  );
}
