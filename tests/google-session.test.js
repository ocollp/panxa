import test from "node:test";
import assert from "node:assert/strict";
import { createGoogleSession } from "../src/google-session.js";
const response = {
  access_token: "test-token",
  expires_in: 3600,
  scope: "openid email https://www.googleapis.com/auth/spreadsheets",
};
const allowedEmail = "owner@example.test";
const fetchUser = (user) => async (url, options) => {
  assert.equal(url, "https://openidconnect.googleapis.com/v1/userinfo");
  assert.equal(options.headers.Authorization, "Bearer test-token");
  return { ok: true, json: async () => user };
};
test("browser auth: verified account, token expiry and logout", async () => {
  let clock = 100;
  const session = createGoogleSession({
    allowedEmail,
    now: () => clock,
    fetchImpl: fetchUser({ email: allowedEmail, email_verified: true }),
  });
  assert.throws(() => session.token(), { statusCode: 428 });
  assert.equal((await session.connect(response)).email, allowedEmail);
  assert.equal(session.token(), "test-token");
  clock += 3600000;
  assert.throws(() => session.token(), { statusCode: 428 });
  await session.connect(response);
  session.clear();
  assert.throws(() => session.token(), { statusCode: 428 });
});
test("browser auth: rejects foreign/unverified users and denied scopes", async () => {
  for (const user of [
    { email: "other@example.test", email_verified: true },
    { email: allowedEmail, email_verified: false },
  ]) {
    const session = createGoogleSession({
      allowedEmail,
      fetchImpl: fetchUser(user),
    });
    await assert.rejects(session.connect(response));
    assert.throws(() => session.token());
  }
  const session = createGoogleSession({
    allowedEmail,
    fetchImpl: fetchUser({ email: allowedEmail, email_verified: true }),
  });
  for (const invalid of [
    { ...response, scope: "openid email" },
    { ...response, expires_in: 0 },
    { ...response, error: "access_denied" },
  ])
    await assert.rejects(session.connect(invalid));
});
test("browser auth: logout cancels an in-flight connection", async () => {
  let resolve;
  const pending = new Promise((done) => {
    resolve = done;
  });
  const session = createGoogleSession({
    allowedEmail,
    fetchImpl: async () => pending,
  });
  const connect = session.connect(response);
  session.clear();
  resolve({
    ok: true,
    json: async () => ({ email: allowedEmail, email_verified: true }),
  });
  await assert.rejects(connect);
  assert.throws(() => session.token());
});
