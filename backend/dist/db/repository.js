import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { briefs, drafts, offers, scenarios, snapshots } from "./schema.js";
export function saveResearch(db, brief, offerRecords) {
    const briefId = randomUUID();
    const now = new Date().toISOString();
    db.transaction((tx) => {
        tx.insert(briefs)
            .values({ id: briefId, content: brief, createdAt: now })
            .run();
        if (offerRecords.length) {
            tx.insert(offers)
                .values(offerRecords.map((offer) => ({
                id: offer.offerId,
                briefId,
                content: offer,
                createdAt: now,
            })))
                .run();
        }
    });
    return briefId;
}
export function saveScenario(db, briefId, input, result) {
    const id = randomUUID();
    db.insert(scenarios)
        .values({ id, briefId, input, result, createdAt: new Date().toISOString() })
        .run();
    return id;
}
export function saveDraft(db, briefId, content) {
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
export function approveDraft(db, draftId) {
    const result = db
        .update(drafts)
        .set({ approvedAt: new Date().toISOString() })
        .where(eq(drafts.id, draftId))
        .run();
    return result.changes === 1;
}
export function getBrief(db, briefId) {
    const brief = db.select().from(briefs).where(eq(briefs.id, briefId)).get();
    if (!brief)
        return null;
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
export function saveSnapshot(db, briefId, sourceUrl, retrievedAt, filePath) {
    db.insert(snapshots)
        .values({ id: randomUUID(), briefId, sourceUrl, retrievedAt, filePath })
        .run();
}
