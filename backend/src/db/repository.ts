import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Offer, PurchaseBrief } from "../schemas.js";
import type { NegotiationDraft } from "../llm/negotiate.js";
import type { ScenarioResult } from "../engine/scenario.js";
import type { Database } from "./client.js";
import { briefs, drafts, offers, scenarios, snapshots } from "./schema.js";

export function saveResearch(
  db: Database,
  brief: PurchaseBrief,
  offerRecords: Offer[],
): string {
  const briefId = randomUUID();
  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(briefs)
      .values({ id: briefId, content: brief, createdAt: now })
      .run();
    if (offerRecords.length) {
      tx.insert(offers)
        .values(
          offerRecords.map((offer) => ({
            id: offer.offerId,
            briefId,
            content: offer,
            createdAt: now,
          })),
        )
        .run();
    }
  });
  return briefId;
}

export function saveScenario(
  db: Database,
  briefId: string,
  input: unknown,
  result: ScenarioResult,
): string {
  const id = randomUUID();
  db.insert(scenarios)
    .values({ id, briefId, input, result, createdAt: new Date().toISOString() })
    .run();
  return id;
}

export function saveDraft(
  db: Database,
  briefId: string,
  content: NegotiationDraft,
): void {
  db.insert(drafts)
    .values({
      id: content.draftId,
      briefId,
      content,
      approvedAt: null,
      createdAt: new Date().toISOString(),
    })
    .run();
}

export function approveDraft(db: Database, draftId: string): boolean {
  const result = db
    .update(drafts)
    .set({ approvedAt: new Date().toISOString() })
    .where(eq(drafts.id, draftId))
    .run();
  return result.changes === 1;
}

export function getBrief(db: Database, briefId: string) {
  const brief = db.select().from(briefs).where(eq(briefs.id, briefId)).get();
  if (!brief) return null;
  return {
    id: brief.id,
    brief: brief.content,
    createdAt: brief.createdAt,
    offers: db
      .select()
      .from(offers)
      .where(eq(offers.briefId, briefId))
      .all()
      .map((row) => row.content),
    scenarios: db
      .select()
      .from(scenarios)
      .where(eq(scenarios.briefId, briefId))
      .all()
      .map((row) => ({
        id: row.id,
        input: row.input,
        result: row.result,
        createdAt: row.createdAt,
      })),
    drafts: db
      .select()
      .from(drafts)
      .where(eq(drafts.briefId, briefId))
      .all()
      .map((row) => ({
        ...row.content,
        approvalStatus: row.approvedAt ? "approved" : "pending",
        approvedAt: row.approvedAt,
      })),
  };
}

export function saveSnapshot(
  db: Database,
  briefId: string,
  sourceUrl: string,
  retrievedAt: string,
  filePath: string,
): void {
  db.insert(snapshots)
    .values({ id: randomUUID(), briefId, sourceUrl, retrievedAt, filePath })
    .run();
}
