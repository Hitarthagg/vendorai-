import { randomUUID } from "node:crypto";
import { evaluateOffers } from "../engine/evaluate.js";
import { completeJson, llmConfigured } from "./provider.js";
const DraftResponse = (value) => {
    if (typeof value !== "object" ||
        value === null ||
        !("draft" in value) ||
        typeof value.draft !== "string" ||
        value.draft.trim().length === 0) {
        throw new Error("LLM response did not contain a negotiation draft.");
    }
    return { draft: value.draft.trim() };
};
function supportedNumbers(brief, offers) {
    const numbers = new Set([brief.quantity]);
    const addNumbersFromText = (text) => {
        const matches = text.match(/\b\d[\d,]*(?:\.\d+)?\b/g) ?? [];
        for (const match of matches)
            numbers.add(Number(match.replaceAll(",", "")));
    };
    addNumbersFromText(brief.product);
    if (brief.budget !== null)
        numbers.add(brief.budget);
    if (brief.deadlineDays !== null)
        numbers.add(brief.deadlineDays);
    for (const offer of offers) {
        for (const evidence of Object.values(offer.provenance)) {
            if (evidence.status !== "verified")
                continue;
            if (typeof evidence.value === "number") {
                numbers.add(evidence.value);
            }
            else if (typeof evidence.value === "string") {
                addNumbersFromText(evidence.value);
            }
            else if (Array.isArray(evidence.value)) {
                for (const item of evidence.value) {
                    if (typeof item === "number")
                        numbers.add(item);
                    else if (typeof item === "string")
                        addNumbersFromText(item);
                    else if (typeof item === "object" && item !== null) {
                        for (const value of Object.values(item)) {
                            if (typeof value === "number")
                                numbers.add(value);
                            else if (typeof value === "string")
                                addNumbersFromText(value);
                        }
                    }
                }
            }
        }
    }
    return numbers;
}
export function checkDraft(draft, brief, offer, supportingOffers = [offer], derivedNumbers = []) {
    const problems = [];
    const supplierEvidence = offer.provenance.supplierName;
    if (supplierEvidence?.status === "verified" &&
        !draft.toLowerCase().includes(offer.supplierName.toLowerCase())) {
        problems.push("The verified supplier name is missing.");
    }
    for (const supportingOffer of supportingOffers) {
        if (supportingOffer.provenance.supplierName?.status !== "verified" &&
            draft
                .toLocaleLowerCase()
                .includes(supportingOffer.supplierName.toLocaleLowerCase())) {
            problems.push("A supplier name without verified evidence was used.");
        }
    }
    const allowed = supportedNumbers(brief, supportingOffers);
    for (const value of derivedNumbers)
        allowed.add(value);
    const found = draft.match(/\b\d[\d,]*(?:\.\d+)?\b/g) ?? [];
    for (const raw of found) {
        const value = Number(raw.replaceAll(",", ""));
        if (!allowed.has(value)) {
            problems.push(`Unsupported numeric claim: ${raw}.`);
        }
    }
    return problems;
}
function deterministicDraft(brief, offer) {
    const verifiedFacts = [];
    if (offer.provenance.unitPrice?.status === "verified" && offer.unitPrice !== null) {
        verifiedFacts.push(`your listed unit price of ${brief.currency} ${offer.unitPrice.toFixed(2)}`);
    }
    if (offer.provenance.leadTimeDays?.status === "verified" && offer.leadTimeDays !== null) {
        verifiedFacts.push(`your listed ${offer.leadTimeDays}-day lead time`);
    }
    const greeting = offer.provenance.supplierName?.status === "verified"
        ? `Hello ${offer.supplierName},`
        : "Hello,";
    const basis = verifiedFacts.length > 0
        ? `I reviewed ${verifiedFacts.join(" and ")}.`
        : "I am comparing supplier terms and would like to confirm your current offer.";
    return [
        greeting,
        "",
        `Please confirm whether you can supply ${brief.quantity} units of ${brief.product}.`,
        basis,
        "Could you confirm the current minimum order, shipping charge, and delivery estimate for this quantity?",
        "If the terms are negotiable, please share your best available quote.",
        "",
        "This draft is for human review only and has not been sent.",
    ].join("\n");
}
export async function createNegotiationDraft(brief, offers, supplierId) {
    const offer = offers.find((item) => item.offerId === supplierId);
    if (!offer)
        throw new Error("The requested supplier offer was not found.");
    const evaluation = evaluateOffers(offers, brief);
    const selected = evaluation.ranked.find((row) => row.offerId === supplierId);
    const verifiedFacts = Object.entries(offer.provenance)
        .filter(([, evidence]) => evidence.status === "verified")
        .map(([field]) => field);
    const comparableRows = evaluation.ranked.filter((row) => row.offerId !== supplierId &&
        row.cost.totalKnown !== null &&
        offers.find((candidate) => candidate.offerId === row.offerId)
            ?.provenance.unitPrice?.status === "verified" &&
        offers.find((candidate) => candidate.offerId === row.offerId)
            ?.provenance.supplierName?.status === "verified");
    const fallbackRow = comparableRows[0];
    const selectedCost = evaluation.ranked.find((row) => row.offerId === supplierId)?.cost;
    const targetDiscount = selectedCost?.totalKnown !== null &&
        selectedCost?.totalKnown !== undefined &&
        selectedCost.unitPrice !== null &&
        selectedCost.unitPrice > 0 &&
        fallbackRow?.cost.totalKnown !== null &&
        fallbackRow?.cost.totalKnown !== undefined
        ? Math.max(0, Math.min(100, Math.round(((selectedCost.totalKnown - fallbackRow.cost.totalKnown) /
            (selectedCost.unitPrice * brief.quantity)) *
            10_000) / 100))
        : null;
    const derivedNumbers = [
        ...(targetDiscount === null ? [] : [targetDiscount]),
        ...(fallbackRow?.cost.totalKnown === null ||
            fallbackRow?.cost.totalKnown === undefined
            ? []
            : [fallbackRow.cost.totalKnown]),
    ];
    const bundle = {
        buyerRequest: {
            product: brief.product,
            quantity: brief.quantity,
            currency: brief.currency,
            budget: brief.budget,
            deadlineDays: brief.deadlineDays,
            priority: brief.priority,
        },
        selectedOffer: {
            supplierName: offer.supplierName,
            supplierNameVerified: offer.provenance.supplierName?.status === "verified",
            verifiedEvidence: Object.fromEntries(Object.entries(offer.provenance)
                .filter(([, evidence]) => evidence.status === "verified")
                .map(([field, evidence]) => [
                field,
                {
                    value: evidence.value,
                    sourceUrl: evidence.sourceUrl,
                    retrievedAt: evidence.retrievedAt,
                },
            ])),
        },
        comparableOffers: comparableRows.map((row) => ({
            supplierName: row.supplierName,
            totalKnown: row.cost.totalKnown,
            currency: row.cost.currency,
            sourceUrl: offers.find((candidate) => candidate.offerId === row.offerId)
                ?.sourceUrl,
        })),
        negotiationStrategy: fallbackRow && targetDiscount !== null
            ? {
                proposedUnitDiscountPercent: targetDiscount,
                targetKnownTotal: fallbackRow.cost.totalKnown,
                fallbackSupplier: fallbackRow.supplierName,
                label: "Strategy only; not a prediction of supplier acceptance.",
            }
            : {
                proposedUnitDiscountPercent: null,
                targetKnownTotal: null,
                fallbackSupplier: null,
                label: "Insufficient verified comparable evidence to calculate a target.",
            },
        recommendation: selected
            ? "Selected supplier is feasible and ranked on complete known costs."
            : "Selected supplier is not a fully evidenced feasible recommendation.",
    };
    let draft = deterministicDraft(brief, offer);
    let provider = "deterministic";
    let note = "";
    if (llmConfigured() && verifiedFacts.length > 0) {
        try {
            const generated = await completeJson([
                {
                    role: "system",
                    content: "Write a concise supplier negotiation email using only facts in the supplied JSON evidence bundle. " +
                        "Never add prices, shipping, MOQ, certifications, dates, contact details, supplier claims, or numeric claims not present in it. " +
                        "Do not claim a discount or agreement. Return JSON only as {\"draft\":\"...\"}.",
                },
                { role: "user", content: JSON.stringify(bundle) },
            ], DraftResponse);
            const issues = checkDraft(generated.draft, brief, offer, offers, derivedNumbers);
            if (issues.length === 0) {
                draft = generated.draft;
                provider = "llm";
            }
            else {
                note =
                    "The model draft contained unsupported information and was discarded; a deterministic draft is shown instead.";
            }
        }
        catch (error) {
            note =
                error instanceof Error
                    ? `LLM drafting failed; using a deterministic draft instead (${error.message}).`
                    : "LLM drafting failed; using a deterministic draft instead.";
        }
    }
    else if (!llmConfigured()) {
        note = "No LLM provider is configured; deterministic evidence-restricted draft used.";
    }
    const issues = checkDraft(draft, brief, offer, offers, derivedNumbers);
    if (issues.length > 0) {
        throw new Error(`Draft validation failed: ${issues.join(" ")}`);
    }
    return {
        draftId: randomUUID(),
        supplierId,
        supplierName: offer.supplierName,
        status: verifiedFacts.length > 0 && selected ? "ready" : "insufficient_evidence",
        draft,
        evidenceUsed: verifiedFacts,
        numberCheck: { passed: true, issues: [] },
        provider,
        note,
        approvalStatus: "pending",
    };
}
