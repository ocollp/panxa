import { DatabaseSync } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { validate } from "../src/domain.js";
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const randomToken = () => randomBytes(32).toString("base64url");
export function openStore(path) {
  if (path !== ":memory:")
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path);
  if (path !== ":memory:") chmodSync(path, 0o600);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS records(owner TEXT NOT NULL,date TEXT NOT NULL,body TEXT NOT NULL,PRIMARY KEY(owner,date));
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,owner TEXT NOT NULL,email TEXT NOT NULL,name TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS challenges(token TEXT PRIMARY KEY,expires INTEGER NOT NULL);`);
  const transaction = (fn) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };
  const conflict = () => {
    const e = new Error(
      "Aquest registre ja existeix o ha canviat. Actualitza el diari abans de continuar.",
    );
    e.statusCode = 409;
    throw e;
  };
  const get = (owner, date) => {
    const row = db
      .prepare("SELECT body FROM records WHERE owner=? AND date=?")
      .get(owner, date);
    return row ? JSON.parse(row.body) : null;
  };
  return {
    close: () => db.close(),
    challenge() {
      const token = randomToken();
      db.prepare("DELETE FROM challenges WHERE expires<=?").run(Date.now());
      db.prepare("INSERT INTO challenges VALUES (?,?)").run(
        hash(token),
        Date.now() + 300000,
      );
      return token;
    },
    consumeChallenge(token) {
      return transaction(() => {
        const key = hash(token);
        const row = db
          .prepare("SELECT expires FROM challenges WHERE token=?")
          .get(key);
        db.prepare("DELETE FROM challenges WHERE token=?").run(key);
        return Boolean(row && row.expires > Date.now());
      });
    },
    createSession(user) {
      const token = randomToken();
      db.prepare("DELETE FROM sessions WHERE expires<=?").run(Date.now());
      db.prepare("INSERT INTO sessions VALUES (?,?,?,?,?)").run(
        hash(token),
        user.sub,
        user.email,
        user.name,
        Date.now() + 12 * 60 * 60 * 1000,
      );
      return token;
    },
    session(token) {
      return db
        .prepare(
          "SELECT owner,email,name FROM sessions WHERE token=? AND expires>?",
        )
        .get(hash(token), Date.now());
    },
    logout(token) {
      db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
    },
    list(owner) {
      return db
        .prepare("SELECT body FROM records WHERE owner=? ORDER BY date DESC")
        .all(owner)
        .map((row) => JSON.parse(row.body));
    },
    save(owner, record, original) {
      const clean = validate(record);
      const old = original ? validate(original) : null;
      return transaction(() => {
        if (old) {
          const current = get(owner, old.date);
          if (JSON.stringify(current) !== JSON.stringify(old)) conflict();
          if (old.date !== clean.date && get(owner, clean.date)) conflict();
          db.prepare("DELETE FROM records WHERE owner=? AND date=?").run(
            owner,
            old.date,
          );
        } else if (get(owner, clean.date)) conflict();
        db.prepare("INSERT INTO records VALUES (?,?,?)").run(
          owner,
          clean.date,
          JSON.stringify(clean),
        );
        return clean;
      });
    },
    remove(owner, original) {
      const old = validate(original);
      transaction(() => {
        if (JSON.stringify(get(owner, old.date)) !== JSON.stringify(old))
          conflict();
        db.prepare("DELETE FROM records WHERE owner=? AND date=?").run(
          owner,
          old.date,
        );
      });
    },
    merge(owner, records) {
      if (!Array.isArray(records) || records.length > 50000)
        throw new Error("La còpia no és vàlida.");
      const clean = records.map(validate);
      if (new Set(clean.map((r) => r.date)).size !== clean.length)
        throw new Error("La còpia conté dates duplicades.");
      return transaction(() => {
        const accepted = [],
          conflicts = [];
        let inserted = 0;
        for (const r of clean) {
          const current = get(owner, r.date);
          if (!current) {
            db.prepare("INSERT INTO records VALUES (?,?,?)").run(
              owner,
              r.date,
              JSON.stringify(r),
            );
            inserted++;
            accepted.push(r.date);
          } else if (JSON.stringify(current) === JSON.stringify(r))
            accepted.push(r.date);
          else conflicts.push(r.date);
        }
        return { inserted, accepted, conflicts };
      });
    },
  };
}
