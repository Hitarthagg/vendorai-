import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import BetterSqlite3 from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type Database = BetterSQLite3Database<typeof schema>;

export type DatabaseClient = {
  db: Database;
  close: () => void;
};

export function createDatabase(
  configuredPath = process.env.DATABASE_PATH ?? "./data/vendormind.sqlite",
): DatabaseClient {
  const databasePath =
    configuredPath === ":memory:" ? configuredPath : resolve(configuredPath);
  if (databasePath !== ":memory:") {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const sqlite = new BetterSqlite3(databasePath);
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS briefs (
      id TEXT PRIMARY KEY,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS offers (
      id TEXT PRIMARY KEY,
      brief_id TEXT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS offers_brief_id_idx ON offers(brief_id);
    CREATE TABLE IF NOT EXISTS scenarios (
      id TEXT PRIMARY KEY,
      brief_id TEXT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
      input TEXT NOT NULL,
      result TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS scenarios_brief_id_idx ON scenarios(brief_id);
    CREATE TABLE IF NOT EXISTS snapshots (
      id TEXT PRIMARY KEY,
      brief_id TEXT REFERENCES briefs(id) ON DELETE SET NULL,
      source_url TEXT NOT NULL,
      retrieved_at TEXT NOT NULL,
      file_path TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS drafts (
      id TEXT PRIMARY KEY,
      brief_id TEXT NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      approved_at TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS drafts_brief_id_idx ON drafts(brief_id);
  `);
  return { db: drizzle(sqlite, { schema }), close: () => sqlite.close() };
}
