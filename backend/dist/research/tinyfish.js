import { TinyFish } from "@tiny-fish/sdk";
export function tinyFishConfigured() {
    return Boolean(process.env.TINYFISH_API_KEY);
}
export function agentFallbackEnabled() {
    return (process.env.TINYFISH_AGENT_ENABLED !== "false" &&
        tinyFishConfigured() &&
        Number(process.env.TINYFISH_AGENT_MAX_RUNS ?? "5") > 0);
}
export function createTinyFishClient() {
    const apiKey = process.env.TINYFISH_API_KEY;
    if (!apiKey)
        throw new Error("TINYFISH_API_KEY is not configured.");
    return new TinyFish({ apiKey, maxRetries: 0, timeout: 45_000 });
}
export function isSafeSupplierUrl(value) {
    try {
        const url = new URL(value);
        if (url.protocol !== "https:" ||
            url.username ||
            url.password ||
            !url.hostname ||
            url.hostname === "localhost" ||
            url.hostname.endsWith(".localhost") ||
            url.hostname.endsWith(".local") ||
            /^\d{1,3}(?:\.\d{1,3}){3}$/.test(url.hostname) ||
            url.hostname.includes(":")) {
            return false;
        }
        return !/\b(login|signin|sign-in|account|checkout|cart|admin)\b/i.test(url.pathname);
    }
    catch {
        return false;
    }
}
export function searchQuery(brief, category) {
    const vertical = category === "packaging"
        ? "bulk packaging supplier"
        : category === "office_industrial"
            ? "bulk office and industrial supplier"
            : "engineering materials";
    return `${brief.product} ${vertical} wholesale unit price MOQ shipping`;
}
export function agentGoal(brief) {
    return [
        `Inspect this supplier listing for ${brief.product}.`,
        `Find terms specifically applicable to an order of ${brief.quantity} units.`,
        "Return only values directly shown on this page; use null if a value is absent.",
        "Include a short verbatim evidence quote for each non-null value.",
        "Do not infer or estimate price, currency, shipping, MOQ, delivery, discounts, specifications, or contacts.",
    ].join(" ");
}
export const agentOutputSchema = {
    type: "object",
    properties: {
        supplierName: { type: "string", nullable: true },
        productTitle: { type: "string", nullable: true },
        currency: { type: "string", enum: ["USD", "EUR", "GBP", "INR"], nullable: true },
        unitPrice: { type: "number", minimum: 0, nullable: true },
        unitBasis: { type: "string", nullable: true },
        moq: { type: "integer", minimum: 1, nullable: true },
        shippingCost: { type: "number", minimum: 0, nullable: true },
        shippingUnit: { type: "string", enum: ["flat", "per_unit", "unknown"] },
        leadTimeDays: { type: "number", minimum: 0, nullable: true },
        deliveryRegion: { type: "string", nullable: true },
        evidence: {
            type: "object",
            properties: {
                supplierName: { type: "string", nullable: true },
                productTitle: { type: "string", nullable: true },
                currency: { type: "string", nullable: true },
                unitPrice: { type: "string", nullable: true },
                unitBasis: { type: "string", nullable: true },
                moq: { type: "string", nullable: true },
                shippingCost: { type: "string", nullable: true },
                leadTimeDays: { type: "string", nullable: true },
                deliveryRegion: { type: "string", nullable: true },
            },
            required: [
                "supplierName",
                "productTitle",
                "currency",
                "unitPrice",
                "unitBasis",
                "moq",
                "shippingCost",
                "leadTimeDays",
                "deliveryRegion",
            ],
        },
    },
    required: [
        "supplierName",
        "productTitle",
        "currency",
        "unitPrice",
        "unitBasis",
        "moq",
        "shippingCost",
        "shippingUnit",
        "leadTimeDays",
        "deliveryRegion",
        "evidence",
    ],
};
