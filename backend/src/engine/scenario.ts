import type { Offer, PurchaseBrief } from "../schemas.js";
import { evaluateOffers, type EvaluationResult } from "./evaluate.js";
import { calculateCost, type ScenarioChanges } from "./cost.js";

export type BreakEvenPoint = {
  quantity: number;
  previousWinnerId: string;
  newWinnerId: string;
};

export type ScenarioResult = {
  evaluation: EvaluationResult;
  fallback: string | null;
  breakEvenPoints: BreakEvenPoint[];
  targetDiscount: {
    supplierId: string;
    percent: number;
    basedOnSupplierId: string;
    label: "strategy_not_prediction";
  } | null;
  savings: {
    supplierId: string;
    currency: string;
    baselineTotal: number;
    proposedTargetTotal: number;
    potentialSavings: number;
    label: "potential_only";
  } | null;
  quantityRange: { minimum: number; maximum: number };
};

export function analyzeScenario(
  offers: Offer[],
  brief: PurchaseBrief,
  changes: ScenarioChanges & { selectedOfferId?: string },
): ScenarioResult {
  const evaluation = evaluateOffers(offers, brief, changes);
  const fallback = evaluation.nextBestFallback?.offerId ?? null;
  const maxQuantity = Math.min(
    10_000,
    Math.max(500, (changes.quantity ?? brief.quantity) * 5),
  );
  const breakEvenPoints: BreakEvenPoint[] = [];
  let previousWinnerId: string | null = null;

  for (let quantity = 1; quantity <= maxQuantity; quantity += 1) {
    const swept = evaluateOffers(offers, brief, { ...changes, quantity });
    const winnerId = swept.recommendation;
    if (
      winnerId !== null &&
      previousWinnerId !== null &&
      winnerId !== previousWinnerId
    ) {
      breakEvenPoints.push({
        quantity,
        previousWinnerId,
        newWinnerId: winnerId,
      });
    }
    previousWinnerId = winnerId;
  }

  const selectedId = changes.selectedOfferId;
  let targetDiscount: ScenarioResult["targetDiscount"] = null;
  if (selectedId) {
    const selected = evaluation.ranked.find((row) => row.offerId === selectedId);
    const competitor = evaluation.ranked.find((row) => row.offerId !== selectedId);
    const selectedOffer = offers.find((offer) => offer.offerId === selectedId);
    if (
      selected &&
      competitor &&
      selectedOffer?.unitPrice !== null &&
      selectedOffer?.unitPrice !== undefined &&
      selected.cost.totalKnown !== null &&
      competitor.cost.totalKnown !== null &&
      selected.cost.unitPrice !== null
    ) {
      const discountableSpend =
        selected.cost.unitPrice * (changes.quantity ?? brief.quantity);
      const gap = selected.cost.totalKnown - competitor.cost.totalKnown;
      if (discountableSpend > 0 || gap <= 0) {
        targetDiscount = {
          supplierId: selectedId,
          percent:
            discountableSpend <= 0
              ? 0
              : Math.max(
                  0,
                  Math.min(
                    100,
                    Math.round((gap / discountableSpend) * 10_000) / 100,
                  ),
                ),
          basedOnSupplierId: competitor.offerId,
          label: "strategy_not_prediction",
        };
      }
    }
  }
  const savings =
    selectedId && targetDiscount
      ? (() => {
          const selected = evaluation.ranked.find(
            (row) => row.offerId === selectedId,
          );
          const selectedOffer = offers.find(
            (offer) => offer.offerId === selectedId,
          );
          if (
            !selected ||
            !selectedOffer ||
            selected.cost.totalKnown === null ||
            selected.cost.unitPrice === null
          ) {
            return null;
          }
          const discountableSpend =
            selected.cost.unitPrice * (changes.quantity ?? brief.quantity);
          const potentialSavings = Math.min(
            selected.cost.totalKnown,
            (discountableSpend * targetDiscount.percent) / 100,
          );
          return {
            supplierId: selectedId,
            currency: selected.cost.currency,
            baselineTotal: selected.cost.totalKnown,
            proposedTargetTotal: Math.max(
              0,
              Math.round(
                (selected.cost.totalKnown - potentialSavings + Number.EPSILON) *
                  100,
              ) / 100,
            ),
            potentialSavings: Math.round((potentialSavings + Number.EPSILON) * 100) / 100,
            label: "potential_only" as const,
          };
        })()
      : null;

  return {
    evaluation,
    fallback,
    breakEvenPoints,
    targetDiscount,
    savings,
    quantityRange: { minimum: 1, maximum: maxQuantity },
  };
}
