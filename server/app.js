import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import serveStatic from "@fastify/static";
import { OAuth2Client } from "google-auth-library";
import { resolve } from "node:path";
import { createSheetsStore, SHEETS_SCOPE } from "./sheets-store.js";
import { hash } from "./store.js";
import { openStore } from "./store.js";
const SESSION = "panxa_session";
const CHALLENGE = "panxa_login";
export async function createApp({
  clientId = "",
  allowedEmail = "",
  origin = "http://127.0.0.1:5173",
  databasePath = ":memory:",
  production = false,
  serveWeb = false,
  verifyToken,
  spreadsheetId = "",
  verifyAccessToken,
  recordsFactory,
} = {}) {
  const email = allowedEmail.trim().toLowerCase();
  if (production && (!clientId || !email || !origin.startsWith("https://")))
    throw new Error(
      "En producció calen GOOGLE_CLIENT_ID, ALLOWED_EMAIL i APP_ORIGIN amb HTTPS.",
    );
  const app = Fastify({ logger: false, bodyLimit: 12 * 1024 * 1024 });
  const store = openStore(databasePath);
  const google = new OAuth2Client(clientId);
  const verify =
    verifyToken ||
    (async (credential) =>
      (
        await google.verifyIdToken({ idToken: credential, audience: clientId })
      ).getPayload());
  const grants = new Map();
  const getGrant = (key) => {
    const grant = grants.get(key);
    if (!grant || grant.expires <= Date.now()) {
      grants.delete(key);
      const e = new Error("Connecta Google Sheets per accedir al diari.");
      e.statusCode = 428;
      throw e;
    }
    return grant.token;
  };
  const records = recordsFactory
    ? recordsFactory(store)
    : createSheetsStore({ spreadsheetId, getToken: getGrant });
  const recordOwner = (req) =>
    recordsFactory ? req.user.owner : hash(req.cookies[SESSION]);
  const accessVerifier =
    verifyAccessToken ||
    (async (token) => {
      const info = await google.getTokenInfo(token);
      const res = await fetch(
        "https://openidconnect.googleapis.com/v1/userinfo",
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15000),
        },
      );
      if (!res.ok) throw new Error("invalid_user");
      return { ...info, ...(await res.json()) };
    });
  const cookieOptions = {
    httpOnly: true,
    secure: production,
    sameSite: "strict",
    path: "/api",
  };
  app.addHook("onClose", async () => store.close());
  await app.register(cookie);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "no-referrer");
    reply.header("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
    if (
      req.url.startsWith("/api/") &&
      !["GET", "HEAD", "OPTIONS"].includes(req.method)
    ) {
      if (req.headers.origin !== origin)
        return reply
          .code(403)
          .send({ error: "Origen de la petició no autoritzat." });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return reply.code(415).send({ error: "La petició ha de ser JSON." });
    }
  });
  app.setErrorHandler((error, req, reply) => {
    const code = error.statusCode || 500;
    reply.code(code).send({
      error:
        code === 429
          ? "Massa intents. Torna-ho a provar més tard."
          : code >= 500
            ? "No s’ha pogut completar la petició. Torna-ho a provar."
            : error.message,
    });
  });
  app.get("/api/auth/config", async (req, reply) => {
    if (!clientId || !email) return { configured: false };
    const nonce = store.challenge();
    reply.setCookie(CHALLENGE, nonce, { ...cookieOptions, maxAge: 300 });
    return { configured: true, clientId, nonce };
  });
  app.post(
    "/api/auth/google",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (req, reply) => {
      if (!clientId || !email)
        return reply
          .code(503)
          .send({ error: "L’accés amb Google encara no està configurat." });
      const nonce = req.cookies[CHALLENGE];
      reply.clearCookie(CHALLENGE, cookieOptions);
      if (!nonce || !store.consumeChallenge(nonce))
        return reply
          .code(401)
          .send({ error: "La petició d’accés ha caducat. Torna-ho a provar." });
      const credential = req.body?.credential;
      if (typeof credential !== "string" || credential.length > 12000)
        return reply
          .code(400)
          .send({ error: "Credencial de Google no vàlida." });
      let user;
      try {
        user = await verify(credential);
      } catch {
        return reply
          .code(401)
          .send({ error: "No s’ha pogut verificar el compte de Google." });
      }
      // Signature/audience/issuer/expiry are checked by google-auth-library; nonce binds the popup to this browser.
      if (
        !user?.sub ||
        user.nonce !== nonce ||
        user.email_verified !== true ||
        user.email?.toLowerCase() !== email
      )
        return reply
          .code(403)
          .send({ error: "Aquest compte no té accés a PANXA." });
      if (req.cookies[SESSION]) {
        grants.delete(hash(req.cookies[SESSION]));
        store.logout(req.cookies[SESSION]);
      }
      const identity = {
        sub: user.sub,
        email,
        name:
          typeof user.name === "string"
            ? user.name.slice(0, 120)
            : "El meu compte",
      };
      reply.setCookie(SESSION, store.createSession(identity), {
        ...cookieOptions,
        maxAge: 12 * 60 * 60,
      });
      return { user: { email: identity.email, name: identity.name } };
    },
  );
  const authenticate = async (req, reply) => {
    const session = req.cookies[SESSION] && store.session(req.cookies[SESSION]);
    if (!session || session.email !== email) {
      reply.clearCookie(SESSION, cookieOptions);
      return reply
        .code(401)
        .send({ error: "Inicia sessió per accedir al teu diari." });
    }
    req.user = session;
  };
  app.get("/api/auth/me", { preHandler: authenticate }, async (req) => ({
    user: { email: req.user.email, name: req.user.name },
  }));
  app.post("/api/auth/logout", async (req, reply) => {
    if (req.cookies[SESSION]) {
      grants.delete(hash(req.cookies[SESSION]));
      store.logout(req.cookies[SESSION]);
    }
    reply.clearCookie(SESSION, cookieOptions);
    return { ok: true };
  });
  app.get("/api/sheets/status", { preHandler: authenticate }, async (req) => {
    let connected = false;
    try {
      getGrant(hash(req.cookies[SESSION]));
      connected = true;
    } catch {}
    return {
      configured: Boolean(spreadsheetId),
      connected,
      clientId,
      spreadsheetUrl: spreadsheetId
        ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
        : null,
    };
  });
  app.post(
    "/api/sheets/connect",
    {
      preHandler: authenticate,
      config: { rateLimit: { max: 10, timeWindow: "5 minutes" } },
    },
    async (req, reply) => {
      const token = req.body?.accessToken;
      if (!spreadsheetId)
        return reply
          .code(503)
          .send({ error: "Cal configurar el full de Google Sheets." });
      if (typeof token !== "string" || token.length > 12000)
        return reply.code(400).send({ error: "Autorització no vàlida." });
      let info;
      try {
        info = await accessVerifier(token);
      } catch {
        return reply
          .code(403)
          .send({
            error: "No s’ha pogut verificar l’autorització de Google Sheets.",
          });
      }
      if (
        info.aud !== clientId ||
        info.sub !== req.user.owner ||
        info.email?.toLowerCase() !== email ||
        info.email_verified !== true ||
        !info.scopes?.includes(SHEETS_SCOPE) ||
        !Number.isFinite(info.expiry_date) ||
        info.expiry_date <= Date.now() + 30000
      )
        return reply
          .code(403)
          .send({
            error:
              "Autoritza Google Sheets amb el mateix compte de PANXA i concedeix el permís sol·licitat.",
          });
      for (const [key, value] of grants)
        if (value.expires <= Date.now()) grants.delete(key);
      const key = hash(req.cookies[SESSION]);
      grants.set(key, {
        token,
        expires: Math.min(info.expiry_date - 30000, Date.now() + 3600000),
      });
      try {
        await records.list(recordOwner(req));
      } catch (e) {
        grants.delete(key);
        return reply.code(e.statusCode || 400).send({ error: e.message });
      }
      return { connected: true };
    },
  );
  app.get("/api/legacy/records", { preHandler: authenticate }, async (req) => ({
    records: store.list(req.user.owner),
  }));
  app.get("/api/records", { preHandler: authenticate }, async (req) => ({
    records: await records.list(recordOwner(req)),
  }));
  app.post("/api/records", { preHandler: authenticate }, async (req, reply) => {
    try {
      return {
        record: await records.save(
          recordOwner(req),
          req.body?.record,
          req.body?.original,
        ),
      };
    } catch (e) {
      return reply.code(e.statusCode || 400).send({ error: e.message });
    }
  });
  app.delete(
    "/api/records",
    { preHandler: authenticate },
    async (req, reply) => {
      try {
        await records.remove(recordOwner(req), req.body?.original);
        return { ok: true };
      } catch (e) {
        return reply.code(e.statusCode || 400).send({ error: e.message });
      }
    },
  );
  app.post(
    "/api/records/import",
    { preHandler: authenticate },
    async (req, reply) => {
      try {
        return await records.merge(recordOwner(req), req.body?.records);
      } catch (e) {
        return reply.code(e.statusCode || 400).send({ error: e.message });
      }
    },
  );
  if (serveWeb) {
    await app.register(serveStatic, { root: resolve("dist") });
  }
  return app;
}
