import { z } from "zod";
export const CurrencySchema = z.enum(["USD", "EUR", "GBP", "INR"]);
export const EvidenceStatusSchema = z.enum([
    "verified",
    "inferred",
    "missing",
    "stale",
]);
export const ExtractionMethodSchema = z.enum([
    "search",
    "fetch",
    "agent",
    "fixture",
]);
export const CategorySchema = z.enum([
    "packaging",
    "office_industrial",
    "engineering_materials_fixture",
]);
export const PrioritySchema = z.enum(["cost", "speed", "balanced"]);
export const FieldEvidenceSchema = z.object({
    value: z.unknown(),
    sourceUrl: z.string().url().nullable(),
    retrievedAt: z.string().datetime(),
    status: EvidenceStatusSchema,
    extractionMethod: ExtractionMethodSchema,
    reason: z.string().optional(),
});
export const QuantityTierSchema = z.object({
    minimumQuantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative().nullable(),
    discountPercent: z.number().min(0).max(100).nullable(),
});
export const ExtraFeeSchema = z.object({
    name: z.string().min(1),
    amount: z.number().nonnegative(),
    currency: CurrencySchema,
});
export const OfferSchema = z.object({
    offerId: z.string().min(1),
    supplierName: z.string().min(1),
    productTitle: z.string().min(1),
    category: CategorySchema,
    sourceUrl: z.string().url().nullable(),
    retrievedAt: z.string().datetime(),
    isFixture: z.boolean(),
    unitPrice: z.number().nonnegative().nullable(),
    currency: CurrencySchema.nullable(),
    unitBasis: z.string().min(1),
    quantityTiers: z.array(QuantityTierSchema),
    moq: z.number().int().positive().nullable(),
    discountsApplicable: z.array(QuantityTierSchema),
    shippingCost: z.number().nonnegative().nullable(),
    shippingUnit: z.enum(["flat", "per_unit", "unknown"]),
    leadTimeDays: z.number().nonnegative().nullable(),
    deliveryRegion: z.string().nullable(),
    extraFees: z.array(ExtraFeeSchema),
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    specMatchFlags: z.record(z.string(), z.boolean().nullable()),
    provenance: z.record(z.string(), FieldEvidenceSchema),
});
export const PurchaseBriefSchema = z.object({
    product: z.string().trim().min(2).max(200),
    quantity: z.number().int().positive().max(1_000_000),
    budget: z.number().nonnegative().nullable().default(null),
    currency: CurrencySchema.default("USD"),
    deadlineDays: z.number().int().positive().max(3650).nullable().default(null),
    mandatorySpecs: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    priority: PrioritySchema.default("cost"),
    region: z.string().trim().max(100).nullable().default(null),
});
export const ResearchRequestSchema = z.object({
    brief: PurchaseBriefSchema.optional(),
    product: z.string().trim().min(2).max(200).optional(),
    quantity: z.number().int().positive().max(1_000_000).optional(),
    budget: z.number().nonnegative().nullable().optional(),
    currency: CurrencySchema.optional(),
    deadline_days: z.number().int().positive().max(3650).nullable().optional(),
    deadlineDays: z.number().int().positive().max(3650).nullable().optional(),
    must_haves: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    mandatorySpecs: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    region: z.string().trim().max(100).nullable().optional(),
    fixtureOnly: z.boolean().optional(),
});
export const EvaluationRequestSchema = z.object({
    brief: PurchaseBriefSchema,
    offers: z.array(OfferSchema).min(1).max(50),
});
export const ScenarioRequestSchema = EvaluationRequestSchema.extend({
    changes: z.object({
        quantity: z.number().int().positive().max(1_000_000).optional(),
        deadlineDays: z.number().int().positive().max(3650).nullable().optional(),
        priority: PrioritySchema.optional(),
        discountsByOffer: z.record(z.string(), z.number().min(0).max(100)).default({}),
        shippingOverrides: z.record(z.string(), z.number().nonnegative()).default({}),
        selectedOfferId: z.string().optional(),
    }),
});
export const NegotiateRequestSchema = z.object({
    brief: PurchaseBriefSchema,
    offers: z.array(OfferSchema).min(1).max(50),
    supplierId: z.string().min(1),
});
export const ApproveDraftRequestSchema = z.object({
    draftId: z.string().uuid(),
    approved: z.literal(true),
});
export function parseResearchBrief(input) {
    if (input.brief)
        return PurchaseBriefSchema.parse(input.brief);
    return PurchaseBriefSchema.parse({
        product: input.product,
        quantity: input.quantity,
        budget: input.budget ?? null,
        currency: input.currency,
        deadlineDays: input.deadlineDays ?? input.deadline_days ?? null,
        mandatorySpecs: input.mandatorySpecs ?? input.must_haves ?? [],
        region: input.region ?? null,
    });
}
