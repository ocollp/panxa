import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../server/app.js";
import { openStore } from "../server/store.js";
const origin = "http://127.0.0.1:5173";
const email = "owner@gmail.com";
const record = {
  date: "2026-10-01",
  food: "Arròs",
  symptoms: ["Gasos"],
  intensity: 5,
  notes: "",
  delay: "",
};
const cookies = (response) =>
  (Array.isArray(response.headers["set-cookie"])
    ? response.headers["set-cookie"]
    : [response.headers["set-cookie"]]
  )
    .filter(Boolean)
    .map((c) => c.split(";")[0])
    .join("; ");
async function setup(t, options = {}) {
  const app = await createApp({
    clientId: "test.apps.googleusercontent.com",
    allowedEmail: email,
    origin,
    verifyToken: async (c) => JSON.parse(c),
    recordsFactory: (store) => store,
    ...options,
  });
  t.after(() => app.close());
  return app;
}
async function login(app, overrides = {}) {
  const config = await app.inject("/api/auth/config");
  return app.inject({
    method: "POST",
    url: "/api/auth/google",
    headers: { origin, cookie: cookies(config) },
    payload: {
      credential: JSON.stringify({
        sub: "owner-1",
        email,
        email_verified: true,
        name: "Propietària",
        nonce: config.json().nonce,
        ...overrides,
      }),
    },
  });
}
async function request(app, cookie, method, url, payload) {
  return app.inject({
    method,
    url,
    headers: { origin, cookie },
    ...(payload ? { payload } : {}),
  });
}
test("cap operació de dades és accessible sense una sessió verificada", async (t) => {
  const app = await setup(t);
  for (const [method, url, payload] of [
    ["GET", "/api/records"],
    ["POST", "/api/records", { record }],
    ["DELETE", "/api/records", { original: record }],
    ["POST", "/api/records/import", { records: [record] }],
    ["GET", "/api/auth/me"],
  ])
    assert.equal(
      (await request(app, "", method, url, payload)).statusCode,
      401,
    );
});
test("Google: rebutja correus aliens, correu no verificat, nonce incorrecte i credencials falses", async (t) => {
  const app = await setup(t);
  for (const overrides of [
    { email: "other@gmail.com" },
    { email_verified: false },
    { nonce: "forged" },
    { sub: "" },
  ])
    assert.equal((await login(app, overrides)).statusCode, 403);
  const config = await app.inject("/api/auth/config");
  const result = await app.inject({
    method: "POST",
    url: "/api/auth/google",
    headers: { origin, cookie: cookies(config) },
    payload: { credential: "not-a-google-token" },
  });
  assert.equal(result.statusCode, 401);
  const real = await setup(t, { verifyToken: undefined });
  const challenge = await real.inject("/api/auth/config");
  assert.equal(
    (
      await real.inject({
        method: "POST",
        url: "/api/auth/google",
        headers: { origin, cookie: cookies(challenge) },
        payload: { credential: "unsigned.invalid.token" },
      })
    ).statusCode,
    401,
  );
});
test("protecció CSRF, nonce d’un sol ús i galeta HttpOnly", async (t) => {
  const app = await setup(t);
  const config = await app.inject("/api/auth/config");
  const options = {
    method: "POST",
    url: "/api/auth/google",
    headers: { origin, cookie: cookies(config) },
    payload: {
      credential: JSON.stringify({
        sub: "owner-1",
        email,
        email_verified: true,
        nonce: config.json().nonce,
      }),
    },
  };
  assert.equal(
    (
      await app.inject({
        ...options,
        headers: { ...options.headers, origin: "https://evil.example" },
      })
    ).statusCode,
    403,
  );
  const result = await app.inject(options);
  assert.equal(result.statusCode, 200);
  const header = result.headers["set-cookie"].join(";");
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Strict/i);
  assert.equal((await app.inject(options)).statusCode, 401);
  const session = cookies(result);
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/records",
        headers: { cookie: session },
        payload: { record },
      })
    ).statusCode,
    403,
  );
});
test("CRUD, importació atòmica, conflictes i tancament de sessió", async (t) => {
  const app = await setup(t);
  const auth = await login(app);
  assert.equal(auth.statusCode, 200);
  const session = cookies(auth);
  assert.equal(
    (await request(app, session, "POST", "/api/records", { record }))
      .statusCode,
    200,
  );
  assert.deepEqual(
    (await request(app, session, "GET", "/api/records")).json().records,
    [record],
  );
  assert.equal(
    (await request(app, session, "POST", "/api/records", { record }))
      .statusCode,
    409,
  );
  const updated = { ...record, intensity: 7 };
  assert.equal(
    (
      await request(app, session, "POST", "/api/records", {
        record: updated,
        original: record,
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await request(app, session, "DELETE", "/api/records", {
        original: record,
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await request(app, session, "POST", "/api/records/import", {
        records: [
          { ...record, date: "2026-10-02" },
          { ...record, date: "2026-09-30" },
        ],
      })
    ).statusCode,
    400,
  );
  assert.equal(
    (await request(app, session, "GET", "/api/records")).json().records.length,
    1,
  );
  const merged = await request(app, session, "POST", "/api/records/import", {
    records: [record, { ...record, date: "2026-10-02" }],
  });
  assert.deepEqual(merged.json(), {
    inserted: 1,
    accepted: ["2026-10-02"],
    conflicts: ["2026-10-01"],
  });
  assert.equal(
    (
      await request(app, session, "DELETE", "/api/records", {
        original: updated,
      })
    ).statusCode,
    200,
  );
  await request(app, session, "POST", "/api/auth/logout", {});
  assert.equal(
    (await request(app, session, "GET", "/api/records")).statusCode,
    401,
  );
});
test("les dades es filtren pel sub verificat, no per un owner enviat pel client", async (t) => {
  const app = await setup(t);
  const a = cookies(await login(app));
  await request(app, a, "POST", "/api/records", { record, owner: "owner-2" });
  const b = cookies(await login(app, { sub: "owner-2" }));
  assert.deepEqual(
    (await request(app, b, "GET", "/api/records?owner=owner-1")).json().records,
    [],
  );
  assert.equal(
    (
      await request(app, b, "DELETE", "/api/records", {
        original: record,
        owner: "owner-1",
      })
    ).statusCode,
    409,
  );
  assert.equal(
    (await request(app, a, "GET", "/api/records")).json().records.length,
    1,
  );
});
test("configuració absent: tancat; producció exigeix HTTPS", async (t) => {
  const app = await setup(t, { allowedEmail: "" });
  assert.deepEqual((await app.inject("/api/auth/config")).json(), {
    configured: false,
  });
  assert.equal((await login(app)).statusCode, 503);
  await assert.rejects(createApp({ production: true, origin }), /HTTPS/);
  const secure = await setup(t, {
    origin: "https://panxa.example",
    production: true,
  });
  const config = await secure.inject("/api/auth/config");
  assert.match(config.headers["set-cookie"], /Secure/);
});
test("SQLite conserva dades després de reiniciar; sessions i challenges caduquen", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "panxa-auth-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "test.sqlite");
  let store = openStore(path);
  store.save("owner", record);
  const token = store.createSession({ sub: "owner", email, name: "Owner" });
  const nonce = store.challenge();
  store.close();
  store = openStore(path);
  t.after(() => store.close());
  assert.deepEqual(store.list("owner"), [record]);
  assert.deepEqual(store.list("other"), []);
  assert.ok(store.session(token));
  const now = Date.now();
  t.mock.method(Date, "now", () => now + 13 * 60 * 60 * 1000);
  assert.equal(store.session(token), undefined);
  assert.equal(store.consumeChallenge(nonce), false);
});

test("connexió Sheets exigeix el mateix usuari, audiència, permís i token vigent", async (t) => {
  const valid = {
    aud: "test.apps.googleusercontent.com",
    sub: "owner-1",
    email,
    email_verified: true,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    expiry_date: Date.now() + 3600000,
  };
  let info = valid;
  const app = await setup(t, {
    spreadsheetId: "configured-id",
    verifyAccessToken: async () => info,
  });
  const session = cookies(await login(app));
  assert.equal(
    (await request(app, session, "GET", "/api/sheets/status")).json().connected,
    false,
  );
  for (const patch of [
    { sub: "another-user" },
    { aud: "other-client" },
    { scopes: [] },
    { email: "other@gmail.com" },
    { email_verified: false },
    { expiry_date: 0 },
  ]) {
    info = { ...valid, ...patch };
    assert.equal(
      (
        await request(app, session, "POST", "/api/sheets/connect", {
          accessToken: "token",
        })
      ).statusCode,
      403,
    );
  }
  info = valid;
  assert.equal(
    (
      await request(app, session, "POST", "/api/sheets/connect", {
        accessToken: "token",
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (await request(app, session, "GET", "/api/sheets/status")).json().connected,
    true,
  );
  await request(app, session, "POST", "/api/auth/logout", {});
  assert.equal(
    (await request(app, session, "GET", "/api/sheets/status")).statusCode,
    401,
  );
});
test("sense autorització Sheets no hi ha fallback silenciós a SQLite", async (t) => {
  const app = await setup(t, {
    spreadsheetId: "id",
    recordsFactory: undefined,
  });
  const session = cookies(await login(app));
  assert.equal(
    (await request(app, session, "GET", "/api/records")).statusCode,
    428,
  );
  assert.equal(
    (await request(app, session, "POST", "/api/records", { record }))
      .statusCode,
    428,
  );
  assert.deepEqual(
    (await request(app, session, "GET", "/api/legacy/records")).json().records,
    [],
  );
});
