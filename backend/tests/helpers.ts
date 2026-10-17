import { makeFixtureOffers } from "../src/fixtures/offers.js";
import type { Offer, PurchaseBrief } from "../src/schemas.js";

export const brief: PurchaseBrief = {
  product: "shipping box",
  quantity: 50,
  budget: null,
  currency: "USD",
  deadlineDays: 30,
  mandatorySpecs: ["recycled content"],
  priority: "cost",
  region: null,
};

export function verifiedOffer(
  supplierName: string,
  unitPrice: number,
  shippingCost: number | null,
  options: {
    moq?: number | null;
    leadTimeDays?: number | null;
    shippingUnit?: Offer["shippingUnit"];
    specMatch?: boolean | null;
    isFixture?: boolean;
  } = {},
): Offer {
  const offer = makeFixtureOffers(brief, "packaging")[0]!;
  const retrievedAt = new Date().toISOString();
  const sourceUrl = options.isFixture ? null : "https://supplier.example/products/box";
  const specMatch =
    options.specMatch === undefined ? true : options.specMatch;
  const values: Record<string, unknown> = {
    ...Object.fromEntries(
      Object.entries(offer.provenance).map(([field, evidence]) => [
        field,
        evidence.value,
      ]),
    ),
    supplierName,
    productTitle: brief.product,
    currency: "USD",
    unitPrice,
    unitBasis: "each",
    quantityTiers: [],
    moq: options.moq === undefined ? 1 : options.moq,
    discountsApplicable: [],
    shippingCost,
    shippingUnit: options.shippingUnit ?? "flat",
    leadTimeDays: options.leadTimeDays === undefined ? 5 : options.leadTimeDays,
    deliveryRegion: null,
    extraFees: [],
    attributes: {},
    specMatchFlags: { "recycled content": specMatch },
  };
  const provenance = Object.fromEntries(
    Object.entries(values).map(([field, value]) => [
      field,
      {
        value,
        sourceUrl,
        retrievedAt,
        status: options.isFixture ? "inferred" : "verified",
        extractionMethod: options.isFixture ? "fixture" : "fetch",
        ...(options.isFixture
          ? { reason: "Synthetic test fixture." }
          : {}),
      },
    ]),
  );
  provenance["spec:recycled content"] = {
    value: specMatch,
    sourceUrl,
    retrievedAt,
    status: options.isFixture ? "inferred" : "verified",
    extractionMethod: options.isFixture ? "fixture" : "fetch",
  };
  return {
    ...offer,
    offerId: supplierName.toLowerCase().replaceAll(" ", "-"),
    supplierName,
    productTitle: brief.product,
    sourceUrl,
    retrievedAt,
    isFixture: options.isFixture ?? false,
    unitPrice,
    currency: "USD",
    unitBasis: "each",
    quantityTiers: [],
    moq: options.moq === undefined ? 1 : options.moq,
    discountsApplicable: [],
    shippingCost,
    shippingUnit: options.shippingUnit ?? "flat",
    leadTimeDays: options.leadTimeDays === undefined ? 5 : options.leadTimeDays,
    extraFees: [],
    specMatchFlags: { "recycled content": specMatch },
    provenance,
  };
}
