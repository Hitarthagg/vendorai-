import { randomUUID } from "node:crypto";
import { z } from "zod";
import { OfferSchema } from "../schemas.js";
import { completeJson } from "../llm/provider.js";
const ExtractedPageSchema = z.object({
    supplierName: z.string().nullable(),
    productTitle: z.string().nullable(),
    currency: z.enum(["USD", "EUR", "GBP", "INR"]).nullable(),
    unitPrice: z.number().nonnegative().nullable(),
    unitBasis: z.string().nullable(),
    moq: z.number().int().positive().nullable(),
    shippingCost: z.number().nonnegative().nullable(),
    shippingUnit: z.enum(["flat", "per_unit", "unknown"]),
    leadTimeDays: z.number().nonnegative().nullable(),
    deliveryRegion: z.string().nullable(),
    extraFees: z.array(z.object({
        name: z.string(),
        amount: z.number().nonnegative(),
        currency: z.enum(["USD", "EUR", "GBP", "INR"]),
    })),
    quantityTiers: z.array(z.object({
        minimumQuantity: z.number().int().positive(),
        unitPrice: z.number().nonnegative().nullable(),
        discountPercent: z.number().min(0).max(100).nullable(),
    })),
    attributes: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
    specMatchFlags: z.record(z.string(), z.boolean().nullable()),
    evidence: z.record(z.string(), z.string().nullable()),
});
function evidenceStatus(value, quote, text) {
    if (value === null || value === undefined)
        return "missing";
    if (!quote ||
        quote.length < 3 ||
        !text.toLocaleLowerCase().includes(quote.toLocaleLowerCase())) {
        return "inferred";
    }
    if (typeof value === "number") {
        const amounts = quote.match(/\b\d[\d,]*(?:\.\d+)?\b/g) ?? [];
        return amounts.some((amount) => Math.abs(Number(amount.replaceAll(",", "")) - value) < 0.0001)
            ? "verified"
            : "inferred";
    }
    if (typeof value === "string") {
        const currencySymbols = {
            USD: "$",
            EUR: "€",
            GBP: "£",
            INR: "₹",
        };
        return (quote.toLocaleLowerCase().includes(value.toLocaleLowerCase()) ||
            Boolean(currencySymbols[value] && quote.includes(currencySymbols[value])))
            ? "verified"
            : "inferred";
    }
    if (Array.isArray(value)) {
        return value.every((item) => item === null || evidenceStatus(item, quote, text) === "verified")
            ? "verified"
            : "inferred";
    }
    if (typeof value === "object") {
        const values = Object.values(value);
        return values.every((item) => item === null || evidenceStatus(item, quote, text) === "verified")
            ? "verified"
            : "inferred";
    }
    return "inferred";
}
export function makeMissingOffer(brief, category, sourceUrl, supplierName, retrievedAt = new Date().toISOString(), extractionMethod = "fetch", reason = "No configured extractor could validate this field.") {
    const fields = [
        "supplierName",
        "productTitle",
        "currency",
        "unitPrice",
        "unitBasis",
        "quantityTiers",
        "moq",
        "discountsApplicable",
        "shippingCost",
        "shippingUnit",
        "leadTimeDays",
        "deliveryRegion",
        "extraFees",
        "attributes",
        "specMatchFlags",
    ];
    const provenance = Object.fromEntries(fields.map((field) => [
        field,
        {
            value: field === "supplierName"
                ? supplierName
                : field === "productTitle"
                    ? brief.product
                    : null,
            sourceUrl,
            retrievedAt,
            status: field === "supplierName" ? "inferred" : "missing",
            extractionMethod,
            reason,
        },
    ]));
    return OfferSchema.parse({
        offerId: randomUUID(),
        supplierName,
        productTitle: brief.product,
        category,
        sourceUrl,
        retrievedAt,
        isFixture: false,
        unitPrice: null,
        currency: null,
        unitBasis: "unknown",
        quantityTiers: [],
        moq: null,
        discountsApplicable: [],
        shippingCost: null,
        shippingUnit: "unknown",
        leadTimeDays: null,
        deliveryRegion: null,
        extraFees: [],
        attributes: {},
        specMatchFlags: Object.fromEntries(brief.mandatorySpecs.map((spec) => [spec, null])),
        provenance,
    });
}
export async function extractOfferFromPage(brief, category, sourceUrl, title, pageText, retrievedAt, snapshots) {
    const fallback = makeMissingOffer(brief, category, sourceUrl, title || "Supplier listing", retrievedAt);
    const baseUrl = process.env.LLM_BASE_URL;
    if (!baseUrl ||
        !process.env.LLM_API_KEY ||
        !process.env.LLM_MODEL ||
        pageText.trim().length === 0) {
        return fallback;
    }
    let extracted = null;
    let lastError;
    for (let attempt = 0; attempt < 2 && extracted === null; attempt += 1) {
        try {
            extracted = await completeJson([
                {
                    role: "system",
                    content: "Extract only supplier terms explicitly present in the source text. " +
                        "Use null for every absent fact. Never derive, guess, calculate, or fill a missing value. " +
                        "For each non-null field, return a short exact verbatim evidence quote in evidence[field]. " +
                        "Return JSON matching the requested object. Set specMatchFlags to true or false only when the page directly confirms it; otherwise null.",
                },
                {
                    role: "user",
                    content: JSON.stringify({
                        requestedProduct: brief.product,
                        orderQuantity: brief.quantity,
                        mandatorySpecs: brief.mandatorySpecs,
                        sourceUrl,
                        sourceText: pageText.slice(0, 24_000),
                    }),
                },
            ], (value) => ExtractedPageSchema.parse(value));
        }
        catch (error) {
            lastError = error;
        }
    }
    if (!extracted) {
        if (lastError) {
            snapshots.push({
                sourceUrl,
                retrievedAt,
                stage: "fetch",
                payload: {
                    extractionError: lastError instanceof Error ? lastError.message : "Unknown extraction error",
                },
            });
        }
        return fallback;
    }
    const supplierName = extracted.supplierName ?? title ?? "Supplier listing";
    const effectiveCurrency = extracted.currency;
    const evidenceFields = {
        supplierName,
        productTitle: extracted.productTitle,
        currency: effectiveCurrency,
        unitPrice: extracted.unitPrice,
        unitBasis: extracted.unitBasis,
        quantityTiers: extracted.quantityTiers,
        moq: extracted.moq,
        discountsApplicable: extracted.quantityTiers,
        shippingCost: extracted.shippingCost,
        shippingUnit: extracted.shippingUnit,
        leadTimeDays: extracted.leadTimeDays,
        deliveryRegion: extracted.deliveryRegion,
        extraFees: extracted.extraFees,
        attributes: extracted.attributes,
        specMatchFlags: extracted.specMatchFlags,
    };
    const provenance = Object.fromEntries(Object.entries(evidenceFields).map(([field, value]) => {
        const quote = field === "supplierName" && extracted.supplierName === null
            ? null
            : extracted.evidence[field];
        let status = evidenceStatus(value, quote, pageText);
        if ((field === "currency" && effectiveCurrency === null) ||
            (field === "unitPrice" && extracted.unitPrice === null)) {
            status = "missing";
        }
        return [
            field,
            {
                value,
                sourceUrl,
                retrievedAt,
                status,
                extractionMethod: "fetch",
                ...(status === "missing"
                    ? { reason: "Not found in the fetched supplier page." }
                    : status === "inferred"
                        ? { reason: "Could not verify an exact source quote." }
                        : {}),
            },
        ];
    }));
    const specMatchFlags = {};
    for (const spec of brief.mandatorySpecs) {
        const proposed = extracted.specMatchFlags[spec];
        const quote = extracted.evidence[`spec:${spec}`];
        const groundedQuote = quote !== null &&
            quote !== undefined &&
            pageText.toLocaleLowerCase().includes(quote.toLocaleLowerCase()) &&
            quote.toLocaleLowerCase().includes(spec.toLocaleLowerCase());
        specMatchFlags[spec] = groundedQuote ? proposed : null;
        provenance[`spec:${spec}`] = {
            value: specMatchFlags[spec],
            sourceUrl,
            retrievedAt,
            status: specMatchFlags[spec] === null
                ? "missing"
                : "verified",
            extractionMethod: "fetch",
            ...(specMatchFlags[spec] === null
                ? { reason: "The supplier page does not confirm this requirement." }
                : {}),
        };
    }
    const offer = {
        offerId: randomUUID(),
        supplierName,
        productTitle: extracted.productTitle ?? brief.product,
        category,
        sourceUrl,
        retrievedAt,
        isFixture: false,
        unitPrice: extracted.unitPrice,
        currency: effectiveCurrency,
        unitBasis: extracted.unitBasis ?? "unknown",
        quantityTiers: extracted.quantityTiers,
        moq: extracted.moq,
        discountsApplicable: extracted.quantityTiers,
        shippingCost: extracted.shippingCost,
        shippingUnit: extracted.shippingUnit,
        leadTimeDays: extracted.leadTimeDays,
        deliveryRegion: extracted.deliveryRegion,
        extraFees: extracted.extraFees,
        attributes: extracted.attributes,
        specMatchFlags,
        provenance,
    };
    return OfferSchema.parse(offer);
}
