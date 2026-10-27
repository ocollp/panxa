import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  BookOpen,
  CalendarDays,
  ChartNoAxesColumn,
  ShieldCheck,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Download,
  Upload,
  Trash2,
  Pencil,
  Leaf,
  Check,
  FileText,
  Clock,
  SlidersHorizontal,
} from "lucide-react";
import {
  START_MONTH,
  today,
  parseBackup,
  summarize,
  monthLabel,
  dateLabel,
} from "./domain.js";
import {
  readRecords,
  saveRecord,
  deleteRecord,
  mergeRecords,
} from "./storage.js";
import { backup, exportCSV, exportPDF } from "./export.js";
import "./style.css";
import { AuthBoundary } from "./auth.jsx";
import { LegacyImport } from "./LegacyImport.jsx";
import { Modal, Editor, Calendar } from "./components.jsx";
const tabs = [
  ["diary", "Dies amb molèsties", BookOpen],
  ["calendar", "Calendari", CalendarDays],
  ["report", "Informe mensual", ChartNoAxesColumn],
];
function App({ user, logout }) {
  const [records, setRecords] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("diary");
  const [month, setMonth] = useState(today().slice(0, 7));
  const [editor, setEditor] = useState(null);
  const [detail, setDetail] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [settings, setSettings] = useState(false);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();
  const refresh = async () => {
    try {
      setRecords(await readRecords());
      setLoaded(true);
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => {
    refresh();
    const focus = () => refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("panxa:sheet-connected", focus);
    return () => {
      window.removeEventListener("focus", focus);
      window.removeEventListener("panxa:sheet-connected", focus);
    };
  }, []);
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(""), 5000);
      return () => clearTimeout(id);
    }
  }, [notice]);
  const monthly = records.filter((r) => r.date.startsWith(month));
  const stats = summarize(monthly);
  const shift = (n) => {
    const d = new Date(month + "-01T12:00:00");
    d.setMonth(d.getMonth() + n);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (next >= START_MONTH) setMonth(next);
  };
  const selectedDay = (date, r) => {
    if (r) setDetail(r);
    else setEditor({ initialDate: date });
  };
  const safeExport = async (fn) => {
    try {
      await fn();
    } catch {
      setError("No s’ha pogut generar el fitxer. Torna-ho a provar.");
    }
  };
  return (
    <>
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("diary");
          }}
        >
          <img src={`${import.meta.env.BASE_URL}leaf.svg`} alt="" />
          <span>
            PANXA<small>El teu diari digestiu</small>
          </span>
        </a>
        <div className="header-right">
          <span className="account-email">{user.email}</span>
          <button
            className="secondary logout-button"
            onClick={async () => {
              try {
                await logout();
              } catch (e) {
                setError(e.message);
              }
            }}
          >
            Tancar sessió
          </button>
          <span className="local-badge">
            <ShieldCheck size={15} /> Accés privat
          </span>
          <button
            className="icon settings-button"
            aria-label="Dades i còpies de seguretat"
            onClick={() => setSettings(true)}
          >
            <SlidersHorizontal size={20} />
          </button>
        </div>
      </header>
      <div className={`app-layout view-${tab}`}>
        <aside className="sidebar">
          <p className="eyebrow">EL MEU ESPAI</p>
          <nav aria-label="Navegació principal">
            {tabs.map(([id, label, Icon]) => (
              <button
                key={id}
                aria-current={tab === id ? "page" : undefined}
                className={tab === id ? "active" : ""}
                onClick={() => setTab(id)}
              >
                <Icon size={19} />
                {label}
                {tab === id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="gentle-note">
              <Leaf size={22} />
              <h3>Al teu ritme.</h3>
              <p>No cal registrar-ho tot. Només els dies que ho necessitis.</p>
            </div>
            <button className="data-link" onClick={() => setSettings(true)}>
              <ShieldCheck size={17} /> Les teves dades i còpies{" "}
              <ArrowUpRight size={15} />
            </button>
            <p className="version">PANXA · Una mica més de claredat</p>
          </div>
        </aside>
        <main>
          <LegacyImport onImported={refresh} />
          <div className="page-heading">
            <div>
              <p className="eyebrow">EL TEU DIARI, SENSE COMPLICACIONS</p>
              <h1>{tabs.find((t) => t[0] === tab)[1]}</h1>
              <p className="muted">
                {tab === "diary"
                  ? "Un espai per escoltar el teu cos i recordar com et vas sentir."
                  : tab === "calendar"
                    ? "Les teves anotacions, dia a dia. Sense omplir els buits."
                    : "Una mirada al que has anotat aquest mes."}
              </p>
            </div>
            <button
              className="primary add-button"
              disabled={!loaded}
              onClick={() => setEditor({})}
            >
              <Plus size={19} /> Afegir dia amb molèsties
            </button>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button className="text-button" onClick={() => setError("")}>
                Tancar avís
              </button>
            </div>
          )}
          <div className="month-row">
            <div className="month-control">
              <button
                className="icon"
                aria-label="Mes anterior"
                disabled={month <= START_MONTH}
                onClick={() => shift(-1)}
              >
                <ChevronLeft size={18} />
              </button>
              <label className="month-picker">
                <span>{monthLabel(month)}</span>
                <input
                  aria-label="Mes seleccionat"
                  type="month"
                  value={month}
                  min={START_MONTH}
                  max="9999-12"
                  onChange={(e) => {
                    if (
                      /^\d{4}-\d{2}$/.test(e.target.value) &&
                      e.target.value >= START_MONTH
                    )
                      setMonth(e.target.value);
                  }}
                />
              </label>
              <button
                className="icon"
                aria-label="Mes següent"
                onClick={() => shift(1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
            <span className="month-caption">
              Només compten els dies que registres
            </span>
          </div>
          <section className="stats" aria-label="Resum del mes">
            <div className="stat">
              <span className="stat-icon">
                <CalendarDays size={20} />
              </span>
              <div>
                <p>Dies registrats</p>
                <strong>
                  {loaded ? stats.count : "—"}
                  <small> aquest mes</small>
                </strong>
              </div>
            </div>
            <div className="stat">
              <span className="stat-icon sand">
                <ChartNoAxesColumn size={20} />
              </span>
              <div>
                <p>Intensitat mitjana</p>
                <strong>
                  {stats.average === null
                    ? "—"
                    : stats.average.toLocaleString("ca-ES", {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}
                  <small>{stats.count ? " / 10" : " Encara sense dades"}</small>
                </strong>
              </div>
            </div>
            <div className="stat">
              <span className="stat-icon lilac">
                <Leaf size={20} />
              </span>
              <div>
                <p>Símptoma més registrat</p>
                <strong className="symptom-stat">
                  {stats.symptoms[0].count
                    ? stats.symptoms
                        .filter((s) => s.count === stats.symptoms[0].count)
                        .map((s) => s.name)
                        .join(", ")
                    : "—"}
                  <small>
                    {stats.count
                      ? `${stats.symptoms[0].count} ${stats.symptoms[0].count === 1 ? "dia" : "dies"}`
                      : " Encara sense dades"}
                  </small>
                </strong>
              </div>
            </div>
          </section>
          {tab === "diary" && (
            <div className="content-grid">
              <section className="card diary-card">
                <div className="card-heading">
                  <h2>
                    Els teus registres{" "}
                    <span className="count">{monthly.length}</span>
                  </h2>
                  <span className="subtle">Els més recents primer</span>
                </div>
                {!loaded ? (
                  <div className="empty">
                    <p>Carregant el teu diari…</p>
                  </div>
                ) : !monthly.length ? (
                  <div className="empty">
                    <div className="empty-art">
                      <div className="paper-art">
                        <Leaf size={35} />
                        <span />
                        <span />
                        <span />
                      </div>
                      <span className="spark">✦</span>
                      <span className="small-leaf">
                        <Leaf size={20} />
                      </span>
                    </div>
                    <h2>
                      {records.length
                        ? "Aquest mes encara no té registres"
                        : "El teu diari comença quan el necessitis"}
                    </h2>
                    <p>
                      Si un dia tens molèsties, anota què vas menjar
                      <br className="desktop" /> i com et vas sentir. Aquí ho
                      podràs tornar a consultar.
                    </p>
                    <button className="primary" onClick={() => setEditor({})}>
                      <Plus size={17} /> Registrar un dia
                    </button>
                    <span className="empty-foot">
                      Sense rutines obligatòries. Sense haver-ho d’anotar tot.
                    </span>
                  </div>
                ) : (
                  <div className="records">
                    {monthly.map((r) => (
                      <button
                        key={r.date}
                        className="record"
                        onClick={() => setDetail(r)}
                      >
                        <span className="date-tile">
                          <strong>{Number(r.date.slice(8))}</strong>
                          <small>
                            {new Date(r.date + "T12:00:00").toLocaleDateString(
                              "ca-ES",
                              { weekday: "short" },
                            )}
                          </small>
                        </span>
                        <span className="record-body">
                          <strong>{dateLabel(r.date)}</strong>
                          <span className="food-preview">{r.food}</span>
                          <span className="tags">
                            {r.symptoms.map((s) => (
                              <span key={s}>{s}</span>
                            ))}
                          </span>
                        </span>
                        <span className="intensity">
                          {r.intensity}
                          <small>/10</small>
                        </span>
                        <ChevronRight size={17} />
                      </button>
                    ))}
                  </div>
                )}
              </section>
              <div className="right-column">
                <section className="card mini-calendar">
                  <div className="card-heading">
                    <h2 className="capitalize">{monthLabel(month)}</h2>
                    <CalendarDays size={17} />
                  </div>
                  <Calendar
                    month={month}
                    records={monthly}
                    onSelect={selectedDay}
                  />
                </section>
              </div>
            </div>
          )}
          {tab === "calendar" && (
            <section className="card large-calendar">
              <div className="card-heading">
                <h2 className="capitalize">{monthLabel(month)}</h2>
                <span className="subtle">
                  Selecciona un dia per consultar-lo o afegir-lo
                </span>
              </div>
              <Calendar
                month={month}
                records={monthly}
                onSelect={selectedDay}
              />
              <p className="muted">
                Els dies sense marca no tenen registre. No indiquen absència de
                símptomes.
              </p>
            </section>
          )}
          {tab === "report" && (
            <section className="card report">
              <div className="card-heading">
                <h2>El teu mes en perspectiva</h2>
                <div className="export-buttons">
                  <button
                    className="secondary"
                    onClick={() => safeExport(() => exportCSV(monthly, month))}
                  >
                    <Download size={16} /> CSV
                  </button>
                  <button
                    className="secondary"
                    onClick={() => safeExport(() => exportPDF(monthly, month))}
                  >
                    <FileText size={16} /> PDF
                  </button>
                </div>
              </div>
              <div className="report-columns">
                <section>
                  <h3>Freqüència de símptomes</h3>
                  <p className="muted">
                    Nombre de dies registrats amb cada símptoma
                  </p>
                  {stats.symptoms.map((s) => (
                    <div className="bar-row" key={s.name}>
                      <span>{s.name}</span>
                      <div className="bar">
                        <i
                          style={{
                            width: `${stats.count ? (s.count / stats.count) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <strong>{s.count}</strong>
                    </div>
                  ))}
                  <p className="muted">
                    Intensitat màxima:{" "}
                    {stats.max === null ? "sense dades" : `${stats.max} / 10`}
                  </p>
                </section>
                <section>
                  <h3>Aliments esmentats</h3>
                  <p className="muted">
                    Les teves descripcions originals, sense inferir ingredients
                    ni causes.
                  </p>
                  {stats.mentions.length ? (
                    stats.mentions.map((m) => (
                      <div className="mention" key={m.date}>
                        <small>{dateLabel(m.date)}</small>
                        <p>{m.text}</p>
                      </div>
                    ))
                  ) : (
                    <div className="report-empty">
                      <Leaf />
                      <p>Encara no hi ha aliments anotats aquest mes.</p>
                    </div>
                  )}
                </section>
              </div>
            </section>
          )}
        </main>
      </div>
      <button
        className="primary mobile-add"
        disabled={!loaded}
        onClick={() => {
          const existing = records.find((record) => record.date === today());
          setEditor(existing ? { record: existing } : { initialDate: today() });
        }}
      >
        <Plus size={20} />
        {records.some((record) => record.date === today())
          ? "Editar avui"
          : "Anotar avui"}
      </button>
      {editor && (
        <Editor
          {...editor}
          onClose={() => setEditor(null)}
          onSave={async (data, original) => {
            await saveRecord(data, original);
            await refresh();
            setMonth(data.date.slice(0, 7));
            setEditor(null);
            setNotice("Dia desat a Google Sheets.");
          }}
        />
      )}
      {detail && (
        <Modal title={dateLabel(detail.date)} onClose={() => setDetail(null)}>
          <div className="detail">
            <span className="detail-intensity">
              Intensitat <strong>{detail.intensity} / 10</strong>
            </span>
            <h3>Què vas menjar</h3>
            <p>{detail.food}</p>
            <h3>Símptomes</h3>
            <div className="tags">
              {detail.symptoms.map((s) => (
                <span key={s}>{s}</span>
              ))}
            </div>
            {detail.delay && (
              <>
                <h3>
                  <Clock size={15} /> Temps aproximat
                </h3>
                <p>{detail.delay}</p>
              </>
            )}
            {detail.notes && (
              <>
                <h3>Notes</h3>
                <p>{detail.notes}</p>
              </>
            )}
          </div>
          <div className="modal-actions">
            <button
              className="danger secondary"
              onClick={() => {
                setDeleting(detail);
                setDetail(null);
              }}
            >
              <Trash2 size={16} /> Eliminar
            </button>
            <button
              className="primary"
              onClick={() => {
                setEditor({ record: detail });
                setDetail(null);
              }}
            >
              <Pencil size={16} /> Editar dia
            </button>
          </div>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Vols eliminar aquest dia?"
          onClose={() => setDeleting(null)}
        >
          <p>
            S’eliminarà el registre del {dateLabel(deleting.date)} del teu
            compte. Aquesta acció no es pot desfer.
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setDeleting(null)}>
              Cancel·lar
            </button>
            <button
              disabled={busy}
              className="primary danger-fill"
              onClick={async () => {
                setBusy(true);
                try {
                  await deleteRecord(deleting);
                  await refresh();
                  setDeleting(null);
                  setNotice("Registre eliminat.");
                } catch (e) {
                  setError(e.message);
                  setDeleting(null);
                } finally {
                  setBusy(false);
                }
              }}
            >
              Eliminar registre
            </button>
          </div>
        </Modal>
      )}
      {settings && (
        <Modal
          title="Les teves dades, sota el teu control"
          onClose={() => {
            setSettings(false);
            setPending(null);
          }}
        >
          <div className="privacy-box">
            <ShieldCheck />
            <p>
              Els registres es desen directament al teu full privat de Google
              Sheets. Google comprova que el teu compte hi tingui accés. Mantén
              el full privat: qualsevol persona amb qui el comparteixis també
              podrà veure les dades.
            </p>
          </div>
          <p className="muted">
            Pots consultar les dades des de qualsevol dispositiu que es connecti
            a PANXA amb el mateix compte de Google. Desa una còpia de seguretat
            periòdicament. Les dades locals de la versió anterior només es
            traslladen quan ho confirmes.
          </p>
          <button
            className="secondary full"
            disabled={!loaded}
            onClick={() => safeExport(() => backup(records))}
          >
            <Download size={18} /> Descarregar còpia de seguretat ·{" "}
            {records.length} dies
          </button>
          <h3>Restaurar des d’una còpia</h3>
          <p className="muted">
            Importa un fitxer JSON de PANXA. S’hi afegiran dates noves; els dies
            que ja tens es conservaran.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            aria-label="Seleccionar còpia JSON"
            disabled={!loaded}
            onChange={async (e) => {
              const f = e.target.files[0];
              if (!f) return;
              try {
                if (f.size > 10 * 1024 * 1024)
                  throw new Error("El fitxer supera el límit de 10 MB.");
                setPending({ records: parseBackup(await f.text()) });
              } catch (err) {
                setPending({ error: err.message });
              }
              e.target.value = "";
            }}
          />
          {pending?.error && (
            <p role="alert" className="error">
              {pending.error}
            </p>
          )}
          {pending?.records && (
            <div className="import-preview">
              <p>
                <strong>{pending.records.length} dies a la còpia.</strong>{" "}
                {
                  pending.records.filter(
                    (r) => !records.some((x) => x.date === r.date),
                  ).length
                }{" "}
                dates noves per importar.
              </p>
              <button
                disabled={busy}
                className="primary"
                onClick={async () => {
                  setBusy(true);
                  try {
                    await mergeRecords(pending.records);
                    await refresh();
                    setPending(null);
                    setNotice(
                      "Còpia importada. S’han conservat els dies existents.",
                    );
                  } catch (err) {
                    setPending({ error: err.message });
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Upload size={16} /> Confirmar importació
              </button>
            </div>
          )}
          <p className="small muted">
            La còpia conté informació personal en text llegible. Desa-la en un
            lloc privat.
          </p>
        </Modal>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")).render(
  <AuthBoundary>
    {({ user, logout }) => <App key={user.email} user={user} logout={logout} />}
  </AuthBoundary>,
);
