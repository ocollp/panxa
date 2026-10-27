import React, { useEffect, useRef, useState } from "react";
import { config } from "./config.js";
import { session, readRecords } from "./storage.js";
import { loadGoogle } from "./google-loader.js";
import { Modal } from "./components.jsx";
export function AuthBoundary({ children }) {
  const [user, setUser] = useState(null);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const client = useRef(null);
  useEffect(() => {
    let active = true;
    setReady(false);
    const expired = () => setConnected(false);
    window.addEventListener("panxa:sheets-required", expired);
    (async () => {
      try {
        if (!config.clientId || !config.spreadsheetId || !config.allowedEmail)
          throw new Error(
            "Falta configurar l’accés de Google per a aquesta web.",
          );
        await loadGoogle();
        if (!active) return;
        client.current = window.google.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: "openid email https://www.googleapis.com/auth/spreadsheets",
          include_granted_scopes: false,
          login_hint: config.allowedEmail,
          callback: async (response) => {
            if (!active) return;
            try {
              const next = await session.connect(response);
              await readRecords();
              if (!active) return;
              setUser(next);
              setConnected(true);
              setError("");
              window.dispatchEvent(new Event("panxa:sheet-connected"));
            } catch (e) {
              session.clear();
              if (active)
                setError(e.message || "No s’ha pogut connectar amb Google.");
            } finally {
              if (active) setBusy(false);
            }
          },
          error_callback: () => {
            if (active) {
              setBusy(false);
              setError(
                "La finestra de Google s’ha tancat o bloquejat. Torna-ho a provar.",
              );
            }
          },
        });
        setReady(true);
      } catch (e) {
        if (active) setError(e.message);
      }
    })();
    return () => {
      active = false;
      session.clear();
      window.removeEventListener("panxa:sheets-required", expired);
    };
  }, [retry]);
  const logout = () => {
    session.clear();
    setUser(null);
    setConnected(false);
  };
  const panel = (
    <>
      <p className="muted">
        Entra amb Google per obrir el teu diari i desar-lo al teu full privat.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary full"
        disabled={!ready || busy}
        onClick={() => {
          setBusy(true);
          setError("");
          try {
            client.current.requestAccessToken({ prompt: "" });
          } catch {
            setBusy(false);
            setError("No s’ha pogut obrir Google. Torna-ho a provar.");
          }
        }}
      >
        {busy
          ? "Connectant…"
          : user
            ? "Tornar a connectar"
            : "Entrar amb Google"}
      </button>
      {!ready && error && (
        <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
          Tornar-ho a provar
        </button>
      )}
      <p className="small muted">
        Els registres es desen a Google Sheets. No demanem accés a Gmail. Cal
        connexió a Internet.
      </p>
    </>
  );
  if (!user)
    return (
      <main className="login-page">
        <section className="login-card">
          <img
            src={`${import.meta.env.BASE_URL}leaf.svg`}
            alt=""
            className="login-logo"
          />
          <h1>PANXA</h1>
          <p className="login-subtitle">El teu diari digestiu</p>
          {panel}
        </section>
      </main>
    );
  return (
    <>
      {children({ user, logout })}
      {!connected && (
        <Modal title="Torna a connectar amb Google" onClose={() => {}}>
          <p>
            La connexió ha caducat. El formulari es conserva mentre aquesta
            pàgina continuï oberta.
          </p>
          {panel}
        </Modal>
      )}
    </>
  );
}
