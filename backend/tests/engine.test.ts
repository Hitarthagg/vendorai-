import { describe, expect, it } from "vitest";
import { calculateCost } from "../src/engine/cost.js";
import { checkFeasibility, evaluateOffers } from "../src/engine/evaluate.js";
import { analyzeScenario } from "../src/engine/scenario.js";
import { makeFixtureOffers } from "../src/fixtures/offers.js";
import { brief, verifiedOffer } from "./helpers.js";

describe("deterministic cost and evaluation engine", () => {
  it("calculates total cost from unit price, shipping, and fees", () => {
    const offer = verifiedOffer("A", 10, 25);
    offer.extraFees = [{ name: "handling", amount: 5, currency: "USD" }];
    offer.provenance.extraFees = {
      ...offer.provenance.extraFees!,
      value: offer.extraFees,
      status: "verified",
    };
    const result = calculateCost(offer, { ...brief, quantity: 10 });
    expect(result.totalKnown).toBe(130);
    expect(result.complete).toBe(true);
  });

  it("marks unknown shipping as a partial estimate, not free shipping", () => {
    const offer = verifiedOffer("A", 10, null, { shippingUnit: "unknown" });
    const result = calculateCost(offer, { ...brief, quantity: 10 });
    expect(result.totalKnown).toBe(100);
    expect(result.shippingCost).toBeNull();
    expect(result.complete).toBe(false);
    expect(result.missingFields).toContain("shipping");
  });

  it("does not rank a hard-constraint failure or unknown as a pass", () => {
    const fails = verifiedOffer("MOQ failure", 1, 10, { moq: 100 });
    const unknown = verifiedOffer("Unknown spec", 1, 10, { specMatch: null });
    const passes = verifiedOffer("Pass", 3, 10);

    expect(checkFeasibility(fails, brief).status).toBe("fail");
    expect(checkFeasibility(unknown, brief).status).toBe("unknown");
    const evaluation = evaluateOffers([fails, unknown, passes], brief);
    expect(evaluation.recommendation).toBe(passes.offerId);
    expect(evaluation.excluded.map((row) => row.offerId)).toContain(fails.offerId);
    expect(evaluation.excluded.map((row) => row.offerId)).toContain(unknown.offerId);
  });

  it("does not treat missing speed evidence as a pass for speed-based ranking", () => {
    const offer = verifiedOffer("Unverified lead", 3, 10);
    offer.provenance.leadTimeDays = {
      ...offer.provenance.leadTimeDays!,
      status: "inferred",
    };

    expect(checkFeasibility(offer, { ...brief, deadlineDays: null }).status).toBe(
      "pass",
    );
    const costEvaluation = evaluateOffers([offer], {
      ...brief,
      deadlineDays: null,
      priority: "cost",
    });
    expect(costEvaluation.recommendation).toBe(offer.offerId);

    const speedEvaluation = evaluateOffers([offer], {
      ...brief,
      deadlineDays: null,
      priority: "speed",
    });
    expect(speedEvaluation.recommendation).toBeNull();
    expect(speedEvaluation.partial.map((row) => row.offerId)).toContain(
      offer.offerId,
    );
  });

  it("does not compare an offer whose currency is unknown or different", () => {
    const offer = verifiedOffer("A", 10, 10);
    offer.currency = null;
    offer.provenance.currency = {
      ...offer.provenance.currency!,
      value: null,
      status: "missing",
    };
    const cost = calculateCost(offer, brief);
    expect(cost.totalKnown).toBeNull();
    expect(cost.missingFields).toContain("currency");
  });

  it("does not calculate totals using an incompatible case price basis", () => {
    const offer = verifiedOffer("A", 10, 10);
    offer.unitBasis = "case of 12";
    const cost = calculateCost(offer, brief);
    expect(cost.totalKnown).toBeNull();
    expect(cost.complete).toBe(false);
    expect(cost.missingFields).toContain("incompatible or unknown unit basis");
  });

  it("returns insufficient evidence when no supplier passes every hard constraint", () => {
    const offers = makeFixtureOffers(brief, "packaging").map((offer) => ({
      ...offer,
      moq: null,
    }));
    const evaluation = evaluateOffers(offers, brief);
    expect(evaluation.status).toBe("insufficient_evidence");
    expect(evaluation.recommendation).toBeNull();
  });
});

describe("counterfactual scenarios", () => {
  it("finds the quantity where a lower unit-price offer becomes cheaper", () => {
    const lowUnitHighFreight = verifiedOffer("Bulk", 10, 500);
    const higherUnitLowFreight = verifiedOffer("Flexible", 12, 0);
    const result = analyzeScenario(
      [lowUnitHighFreight, higherUnitLowFreight],
      brief,
      {},
    );
    expect(result.evaluation.recommendation).toBe(higherUnitLowFreight.offerId);
    expect(result.breakEvenPoints[0]).toEqual({
      quantity: 250,
      previousWinnerId: higherUnitLowFreight.offerId,
      newWinnerId: lowUnitHighFreight.offerId,
    });
  });

  it("labels calculated discount savings as potential only", () => {
    const highTotal = verifiedOffer("Bulk", 10, 500);
    const lowerTotal = verifiedOffer("Flexible", 12, 0);
    const result = analyzeScenario(
      [highTotal, lowerTotal],
      brief,
      { selectedOfferId: highTotal.offerId },
    );
    expect(result.targetDiscount?.label).toBe("strategy_not_prediction");
    expect(result.savings?.label).toBe("potential_only");
    expect(result.savings?.potentialSavings).toBe(400);
  });

  it("applies scenario discounts and shipping overrides without mutating source offers", () => {
    const offer = verifiedOffer("A", 10, 20);
    const result = calculateCost(offer, { ...brief, quantity: 10 }, {
      discountsByOffer: { [offer.offerId]: 10 },
      shippingOverrides: { [offer.offerId]: 2 },
    });
    expect(result.totalKnown).toBe(92);
    expect(offer.unitPrice).toBe(10);
    expect(offer.shippingCost).toBe(20);
  });
});
