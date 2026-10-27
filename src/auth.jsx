import React, { useEffect, useRef, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { api } from "./api.js";
let googleScript;
export function loadGoogle() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (googleScript) return googleScript;
  googleScript = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client?hl=ca";
    script.async = true;
    script.defer = true;
    const timer = setTimeout(() => {
      script.remove();
      googleScript = null;
      reject(
        new Error(
          "Google triga a respondre. Comprova la connexió i torna-ho a provar.",
        ),
      );
    }, 15000);
    script.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    script.onerror = () => {
      clearTimeout(timer);
      script.remove();
      googleScript = null;
      reject(new Error("No s’ha pogut carregar l’accés amb Google."));
    };
    document.head.appendChild(script);
  });
  return googleScript;
}
function Login({ onLogin }) {
  const button = useRef();
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setStatus("loading");
    setError("");
    (async () => {
      try {
        const config = await api("/auth/config", {
          signal: controller.signal,
          notify: false,
        });
        if (!active) return;
        if (!config.configured) {
          setStatus("unconfigured");
          return;
        }
        await loadGoogle();
        if (!active) return;
        window.google.accounts.id.initialize({
          client_id: config.clientId,
          nonce: config.nonce,
          auto_select: false,
          ux_mode: "popup",
          callback: async (response) => {
            if (!active) return;
            setStatus("checking");
            setError("");
            try {
              const result = await api("/auth/google", {
                method: "POST",
                body: { credential: response.credential },
                notify: false,
                signal: controller.signal,
              });
              if (active) onLogin(result.user);
            } catch (e) {
              if (active) {
                setError(e.message);
                setStatus("error");
              }
            }
          },
        });
        button.current.replaceChildren();
        window.google.accounts.id.renderButton(button.current, {
          theme: "outline",
          size: "large",
          text: "signin_with",
          shape: "pill",
          locale: "ca",
          width: 280,
        });
        setStatus("ready");
      } catch (e) {
        if (active) {
          setError(e.message);
          setStatus("error");
        }
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [retry]);
  return (
    <main className="login-page">
      <section className="login-card">
        <img src="/leaf.svg" alt="" className="login-logo" />
        <p className="eyebrow">EL TEU ESPAI PERSONAL</p>
        <h1>PANXA</h1>
        <p className="login-subtitle">El teu diari digestiu</p>
        <p className="muted">
          Un espai privat per escoltar el teu cos.
          <br />
          Inicia sessió amb el teu compte de Google.
        </p>
        <div
          ref={button}
          className="google-button"
          hidden={status !== "ready"}
        />
        {status === "loading" && <p role="status">Preparant l’accés…</p>}
        {status === "checking" && (
          <p role="status">Verificant el teu compte…</p>
        )}
        {status === "unconfigured" && (
          <p className="error" role="alert">
            L’accés amb Google encara no està configurat al servidor. Consulta
            la guia de configuració del projecte.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {["error", "unconfigured"].includes(status) && (
          <button className="secondary" onClick={() => setRetry((n) => n + 1)}>
            Tornar-ho a provar
          </button>
        )}
        <div className="login-privacy">
          <ShieldCheck size={17} />
          <span>
            Només el compte autoritzat pot accedir al diari. No demanem accés al
            teu correu.
          </span>
        </div>
      </section>
    </main>
  );
}
export function AuthBoundary({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const check = async () => {
      const current = ++sequence;
      try {
        const result = await api("/auth/me", { notify: false });
        if (active && current === sequence) {
          setUser(result.user);
          setError("");
        }
      } catch (e) {
        if (active && current === sequence) {
          setUser(null);
          if (e.status !== 401) setError(e.message);
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    const unauthorized = () => {
      sequence++;
      setUser(null);
    };
    check();
    const timer = setInterval(check, 60000);
    window.addEventListener("focus", check);
    window.addEventListener("panxa:unauthorized", unauthorized);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("panxa:unauthorized", unauthorized);
    };
  }, []);
  const logout = async () => {
    await api("/auth/logout", { method: "POST", body: {} });
    window.google?.accounts?.id?.disableAutoSelect();
    window.dispatchEvent(new Event("panxa:unauthorized"));
  };
  if (loading)
    return (
      <main className="login-page">
        <p role="status">Comprovant la sessió…</p>
      </main>
    );
  if (!user)
    return (
      <>
        <Login
          onLogin={(next) => {
            window.dispatchEvent(new Event("panxa:unauthorized"));
            setError("");
            setUser(next);
          }}
        />
        {error && (
          <p className="auth-connection-error" role="alert">
            {error}
          </p>
        )}
      </>
    );
  return children({ user, logout });
}
