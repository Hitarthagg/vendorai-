import { describe, expect, it } from "vitest";
import { checkDraft, createNegotiationDraft } from "../src/llm/negotiate.js";
import { brief, verifiedOffer } from "./helpers.js";

describe("evidence-grounded negotiation drafts", () => {
  it("rejects unsupported numeric claims", () => {
    const offer = verifiedOffer("Northstar", 12.5, 45);
    expect(
      checkDraft(
        "Hello Northstar. We need 50 boxes. Can you match 3.99?",
        brief,
        offer,
      ),
    ).toContain("Unsupported numeric claim: 3.99.");
  });

  it("creates a human-review draft and records insufficient evidence honestly", async () => {
    const offer = verifiedOffer("Sample supplier", 12.5, 45, {
      isFixture: true,
    });
    const draft = await createNegotiationDraft(
      brief,
      [offer],
      offer.offerId,
    );
    expect(draft.status).toBe("insufficient_evidence");
    expect(draft.approvalStatus).toBe("pending");
    expect(draft.draft).toContain("has not been sent");
    expect(draft.numberCheck.passed).toBe(true);
    expect(draft.provider).toBe("deterministic");
  });

  it("uses an exact competitor fact only when the source field is verified", async () => {
    const offer = verifiedOffer("Northstar", 12.5, 45);
    const draft = await createNegotiationDraft(
      brief,
      [offer],
      offer.offerId,
    );
    expect(draft.status).toBe("ready");
    expect(draft.evidenceUsed).toContain("unitPrice");
    expect(draft.draft).toContain("12.50");
  });
});
