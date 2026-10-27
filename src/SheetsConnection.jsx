import React, { useEffect, useRef, useState } from "react";
import { api } from "./api.js";
import { loadGoogle } from "./auth.jsx";
import { Modal } from "./components.jsx";
const SCOPE = "https://www.googleapis.com/auth/spreadsheets";
export function SheetsBoundary({ user, logout, children }) {
  const [ready, setReady] = useState(false),
    [connected, setConnected] = useState(false),
    [config, setConfig] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [retry, setRetry] = useState(0),
    [clientReady, setClientReady] = useState(false);
  const client = useRef(null);
  useEffect(() => {
    let active = true;
    setClientReady(false);
    const check = async () => {
      try {
        const status = await api("/sheets/status");
        if (!active) return;
        setConfig(status);
        setConnected(status.connected);
        if (status.connected) setReady(true);
        if (!status.configured) return;
        await loadGoogle();
        if (!active) return;
        client.current = window.google.accounts.oauth2.initTokenClient({
          client_id: status.clientId,
          scope: `openid email ${SCOPE}`,
          include_granted_scopes: false,
          login_hint: user.email,
          callback: async (response) => {
            if (!active) return;
            if (response.error || !response.access_token) {
              setError(
                "No s’ha concedit l’accés a Google Sheets. Pots tornar-ho a provar.",
              );
              setBusy(false);
              return;
            }
            try {
              await api("/sheets/connect", {
                method: "POST",
                body: { accessToken: response.access_token },
              });
              if (active) {
                setError("");
                setConnected(true);
                setReady(true);
                window.dispatchEvent(new Event("panxa:sheet-connected"));
              }
            } catch (e) {
              if (active) setError(e.message);
            } finally {
              if (active) setBusy(false);
            }
          },
          error_callback: () => {
            if (active) {
              setBusy(false);
              setError(
                "La finestra de Google s’ha tancat o s’ha bloquejat. Torna-ho a provar.",
              );
            }
          },
        });
        setClientReady(true);
      } catch (e) {
        if (active) setError(e.message);
      }
    };
    check();
    const expired = () => setConnected(false);
    window.addEventListener("panxa:sheets-required", expired);
    return () => {
      active = false;
      window.removeEventListener("panxa:sheets-required", expired);
    };
  }, [retry, user.email]);
  const panel = (
    <>
      <p className="muted">
        Els teus registres es desaran al teu full privat, a la pestanya PANXA.
        Les altres pestanyes es conservaran.
      </p>
      {config?.spreadsheetUrl && (
        <p>
          <a
            className="text-button"
            href={config.spreadsheetUrl}
            target="_blank"
            rel="noreferrer"
          >
            Obrir el meu full de Google Sheets ↗
          </a>
        </p>
      )}
      <p className="muted">
        Google et demanarà permís per llegir i editar fulls de càlcul. PANXA
        només farà servir el full configurat. No necessita accés a Gmail.
      </p>
      {config && !config.configured && (
        <p className="error">Falta configurar el full al servidor.</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button
          className="secondary"
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
        <button
          className="primary"
          disabled={!clientReady || busy}
          onClick={() => {
            setBusy(true);
            setError("");
            client.current.requestAccessToken({ prompt: "consent" });
          }}
        >
          {busy ? "Connectant…" : "Connectar Google Sheets"}
        </button>
      </div>
      {error && (
        <button
          className="text-button"
          onClick={() => {
            setError("");
            setRetry((n) => n + 1);
          }}
        >
          Recarregar connexió
        </button>
      )}
      <p className="small muted">
        Si l’autorització caduca, et demanarem que tornis a connectar el full.
        Els canvis del formulari es mantindran mentre la pàgina continuï oberta.
      </p>
    </>
  );
  if (!ready)
    return (
      <main className="login-page">
        <section className="login-card">
          <img src="/leaf.svg" alt="" className="login-logo" />
          <h1>El teu diari, al Drive</h1>
          {panel}
        </section>
      </main>
    );
  return (
    <>
      {children}
      {!connected && (
        <Modal title="Torna a connectar Google Sheets" onClose={() => {}}>
          {panel}
        </Modal>
      )}
    </>
  );
}
