import React, { useState, useEffect, useRef, useId } from "react";
import { X, Check } from "lucide-react";
import { SYMPTOMS, START_DATE, today, dateLabel } from "./domain.js";
export function Modal({ title, onClose, children, className = "" }) {
  const ref = useRef();
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus();
  }, []);
  return (
    <dialog
      className={className}
      aria-labelledby={titleId}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2 id={titleId}>{title}</h2>
        <button className="icon" aria-label="Tancar" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Editor({ record, initialDate, onClose, onSave }) {
  const [data, setData] = useState(
    record || {
      date: initialDate || today(),
      food: "",
      symptoms: [],
      intensity: 5,
      delay: "",
      notes: "",
    },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key, value) => setData((d) => ({ ...d, [key]: value }));
  return (
    <Modal
      className="editor-dialog"
      title={record ? "Editar dia" : "Anotar un dia"}
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="muted">Un moment per anotar com t’has sentit.</p>
      <form
        aria-busy={busy}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSave(data, record);
          } catch (e) {
            setError(e.message);
            setBusy(false);
          }
        }}
      >
        <label>
          Data
          <input
            required
            type="date"
            min={START_DATE}
            max={today()}
            value={data.date}
            onChange={(e) => set("date", e.target.value)}
          />
        </label>
        <p className="muted small">
          Pots registrar dies a partir de l’1 d’octubre de 2026.
        </p>
        <label>
          Què vas menjar?
          <textarea
            required
            maxLength={5000}
            rows={3}
            placeholder="El que recordis d’aquell dia: aliments, begudes…"
            value={data.food}
            onChange={(e) => set("food", e.target.value)}
          />
        </label>
        <fieldset>
          <legend>Quins símptomes vas tenir?</legend>
          <div className="chips">
            {SYMPTOMS.map((s) => (
              <label
                className={
                  "choice " + (data.symptoms.includes(s) ? "selected" : "")
                }
                key={s}
              >
                <input
                  type="checkbox"
                  checked={data.symptoms.includes(s)}
                  onChange={(e) =>
                    set(
                      "symptoms",
                      e.target.checked
                        ? [...data.symptoms, s]
                        : data.symptoms.filter((x) => x !== s),
                    )
                  }
                />
                {s}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="range-label">
          Intensitat{" "}
          <strong>
            {data.intensity} <small>/ 10</small>
          </strong>
          <input
            type="range"
            min="0"
            max="10"
            value={data.intensity}
            onChange={(e) => set("intensity", Number(e.target.value))}
          />
          <span className="range-ends">
            <span>0 · Sense intensitat</span>
            <span>10 · Màxima</span>
          </span>
        </label>
        <details
          className="optional-fields"
          open={record?.delay || record?.notes ? true : undefined}
        >
          <summary>Afegir detalls opcionals</summary>
          <label>
            Temps entre l’àpat i els símptomes{" "}
            <span className="optional">Opcional</span>
            <input
              maxLength={150}
              placeholder="P. ex., uns 30 minuts, 2 hores…"
              value={data.delay}
              onChange={(e) => set("delay", e.target.value)}
            />
          </label>
          <label>
            Notes <span className="optional">Opcional</span>
            <textarea
              maxLength={5000}
              rows={2}
              placeholder="Qualsevol detall que vulguis recordar"
              value={data.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </label>
        </details>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel·lar
          </button>
          <button disabled={busy} className="primary" type="submit">
            <Check size={17} />
            {busy ? "Desant…" : "Desar dia"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Calendar({ month, records, onSelect }) {
  const start = new Date(month + "-01T12:00:00");
  const offset = (start.getDay() + 6) % 7;
  const count = new Date(
    start.getFullYear(),
    start.getMonth() + 1,
    0,
  ).getDate();
  return (
    <>
      <div className="calendar-grid">
        {["dl.", "dt.", "dc.", "dj.", "dv.", "ds.", "dg."].map((d, i) => (
          <span className="weekday" key={i}>
            {d}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={"blank" + i} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const date = `${month}-${String(i + 1).padStart(2, "0")}`;
          const r = records.find((r) => r.date === date);
          return (
            <button
              key={date}
              disabled={date < START_DATE || date > today()}
              aria-label={`${dateLabel(date)}${r ? ", amb registre" : ""}`}
              className={
                "day " +
                (r ? "recorded " : "") +
                (date === today() ? "today" : "")
              }
              onClick={() => onSelect(date, r)}
            >
              {i + 1}
              {r && <i />}
            </button>
          );
        })}
      </div>
      <div className="calendar-key">
        <span className="dot" /> Dia amb registre <span className="today-key" />{" "}
        Avui
      </div>
    </>
  );
}
