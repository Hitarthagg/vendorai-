import {
  index,
  integer,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import type { ScenarioResult } from "../engine/scenario.js";
import type { NegotiationDraft } from "../llm/negotiate.js";
import type { Offer, PurchaseBrief } from "../schemas.js";

export const briefs = sqliteTable("briefs", {
  id: text("id").primaryKey(),
  content: text("content", { mode: "json" }).$type<PurchaseBrief>().notNull(),
  createdAt: text("created_at").notNull(),
});

export const offers = sqliteTable(
  "offers",
  {
    id: text("id").primaryKey(),
    briefId: text("brief_id")
      .notNull()
      .references(() => briefs.id, { onDelete: "cascade" }),
    content: text("content", { mode: "json" }).$type<Offer>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("offers_brief_id_idx").on(table.briefId)],
);

export const scenarios = sqliteTable(
  "scenarios",
  {
    id: text("id").primaryKey(),
    briefId: text("brief_id")
      .notNull()
      .references(() => briefs.id, { onDelete: "cascade" }),
    input: text("input", { mode: "json" }).$type<unknown>().notNull(),
    result: text("result", { mode: "json" }).$type<ScenarioResult>().notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("scenarios_brief_id_idx").on(table.briefId)],
);

export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey(),
  briefId: text("brief_id").references(() => briefs.id, {
    onDelete: "set null",
  }),
  sourceUrl: text("source_url").notNull(),
  retrievedAt: text("retrieved_at").notNull(),
  filePath: text("file_path").notNull(),
});

export const drafts = sqliteTable(
  "drafts",
  {
    id: text("id").primaryKey(),
    briefId: text("brief_id")
      .notNull()
      .references(() => briefs.id, { onDelete: "cascade" }),
    content: text("content", { mode: "json" }).$type<NegotiationDraft>().notNull(),
    approvedAt: text("approved_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("drafts_brief_id_idx").on(table.briefId)],
);
