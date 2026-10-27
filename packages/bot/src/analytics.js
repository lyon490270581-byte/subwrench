// Bot analytics: SQLite event log, zero external services.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

let db = null;
export async function initBotDb(dataDir = "data") {
  const { default: initSqlJs } = await import("sql.js");
  const SQL = await initSqlJs();
  fs.mkdirSync(dataDir, { recursive: true });
  const dbPath = path.join(dataDir, "bot-stats.db");
  db = fs.existsSync(dbPath) ? new SQL.Database(fs.readFileSync(dbPath)) : new SQL.Database();
  db.run(`CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT DEFAULT (datetime('now')),
    user_id INTEGER,
    username TEXT,
    cmd TEXT,
    lang TEXT DEFAULT ''
  )`);
  const save = () => fs.writeFileSync(dbPath, Buffer.from(db.export()));
  save();
  return { save, dbPath };
}

export function track(ctx, cmd) {
  if (!db) return;
  try {
    const u = ctx.from ?? {};
    db.run("INSERT INTO events (user_id, username, cmd, lang) VALUES (?,?,?,?)", [
      u.id ?? 0,
      u.username ?? "",
      cmd,
      u.language_code ?? "",
    ]);
  } catch {}
}

export function saveDb() {
  if (!db) return;
  const dir = "data";
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "bot-stats.db"), Buffer.from(db.export()));
}
