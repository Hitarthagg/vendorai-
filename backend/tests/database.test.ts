import { describe, expect, it } from "vitest";
import { createDatabase } from "../src/db/client.js";
import {
  approveDraft,
  getBrief,
  saveDraft,
  saveResearch,
  saveScenario,
} from "../src/db/repository.js";
import { analyzeScenario } from "../src/engine/scenario.js";
import { createNegotiationDraft } from "../src/llm/negotiate.js";
import { brief, verifiedOffer } from "./helpers.js";

describe("SQLite persistence", () => {
  it("persists briefs, offers, scenarios, and human approval without sending", async () => {
    const database = createDatabase(":memory:");
    try {
      const offer = verifiedOffer("Northstar", 12.5, 45);
      const briefId = saveResearch(database.db, brief, [offer]);
      const scenario = analyzeScenario([offer], brief, { quantity: 60 });
      const scenarioId = saveScenario(database.db, briefId, { quantity: 60 }, scenario);
      const draft = await createNegotiationDraft(brief, [offer], offer.offerId);
      saveDraft(database.db, briefId, draft);

      expect(approveDraft(database.db, draft.draftId)).toBe(true);
      expect(getBrief(database.db, briefId)).toMatchObject({
        id: briefId,
        offers: [offer],
        scenarios: [{ id: scenarioId }],
        drafts: [{ approvalStatus: "approved" }],
      });
      expect(approveDraft(database.db, "not-a-draft")).toBe(false);
    } finally {
      database.close();
    }
  });
});
