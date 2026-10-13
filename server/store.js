import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
export const tokenHash = (t) => createHash("sha256").update(t).digest("hex");
export function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function checkPassword(password, hash) {
  const [salt, key] = hash.split(":");
  const actual = scryptSync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(key, "hex"));
}
export function openStore(path, password, seed = true) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users(email TEXT PRIMARY KEY,role TEXT NOT NULL,password_hash TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS assignments(report_id TEXT PRIMARY KEY,owner_email TEXT NOT NULL,assigned_by TEXT NOT NULL,assigned_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,email TEXT NOT NULL REFERENCES users(email),expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS overrides(report_id TEXT PRIMARY KEY,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY AUTOINCREMENT,report_id TEXT NOT NULL,type TEXT NOT NULL,message TEXT NOT NULL,source TEXT NOT NULL,created_at TEXT NOT NULL,resolved_at TEXT,ack_by TEXT,ack_at TEXT);
    CREATE UNIQUE INDEX IF NOT EXISTS active_condition ON alerts(report_id,type) WHERE resolved_at IS NULL;
    CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY AUTOINCREMENT,type TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,details TEXT NOT NULL,created_at TEXT NOT NULL);`);
  const columns = (table) =>
    db
      .prepare(`PRAGMA table_info(${table})`)
      .all()
      .map((x) => x.name);
  for (const [name, definition] of [
    ["severity", "TEXT NOT NULL DEFAULT 'warning'"],
    ["seen_count", "INTEGER NOT NULL DEFAULT 1"],
    ["last_seen_at", "TEXT"],
    ["resolution_reason", "TEXT"],
  ])
    if (!columns("alerts").includes(name))
      db.exec(`ALTER TABLE alerts ADD COLUMN ${name} ${definition}`);
  if (!columns("users").includes("active"))
    db.exec("ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1");
  if (seed)
    for (const role of ["admin", "engineer", "analyst", "viewer", "owner"])
      if (
        !db
          .prepare("SELECT email FROM users WHERE email=?")
          .get(`${role}@pureinsights.demo`)
      )
        db.prepare(
          "INSERT INTO users(email,role,password_hash) VALUES(?,?,?)",
        ).run(`${role}@pureinsights.demo`, role, hashPassword(password));
  return db;
}
export function setting(db, key, fallback) {
  return (
    db.prepare("SELECT value FROM settings WHERE key=?").get(key)?.value ??
    fallback
  );
}
export function setSetting(db, key, value) {
  db.prepare(
    "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
  ).run(key, String(value));
}
