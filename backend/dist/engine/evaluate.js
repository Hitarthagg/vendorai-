import { calculateCost } from "./cost.js";
export function checkFeasibility(offer, brief) {
    const failures = [];
    const unknowns = [];
    const evidenceAvailable = (field) => offer.isFixture || offer.provenance[field]?.status === "verified";
    if (offer.moq === null || !evidenceAvailable("moq")) {
        unknowns.push("Minimum order quantity is unknown or unverified.");
    }
    else if (brief.quantity < offer.moq) {
        failures.push(`Quantity ${brief.quantity} is below MOQ ${offer.moq}.`);
    }
    if (brief.deadlineDays !== null) {
        if (offer.leadTimeDays === null ||
            !evidenceAvailable("leadTimeDays")) {
            unknowns.push("Delivery time is unknown or unverified.");
        }
        else if (offer.leadTimeDays > brief.deadlineDays) {
            failures.push(`Lead time ${offer.leadTimeDays} days exceeds the ${brief.deadlineDays}-day deadline.`);
        }
    }
    for (const spec of brief.mandatorySpecs) {
        const match = offer.specMatchFlags[spec];
        if (!evidenceAvailable(`spec:${spec}`) && !offer.isFixture) {
            unknowns.push(`Requirement is unknown or unverified: ${spec}.`);
        }
        else if (match === false) {
            failures.push(`Does not meet mandatory requirement: ${spec}.`);
        }
        else if (match !== true) {
            unknowns.push(`Requirement is unconfirmed: ${spec}.`);
        }
    }
    if (failures.length)
        return { status: "fail", reasons: failures };
    if (unknowns.length)
        return { status: "unknown", reasons: unknowns };
    return { status: "pass", reasons: ["All known hard constraints pass."] };
}
function scoreRows(rows, priority) {
    const knownTotals = rows
        .map((row) => row.cost.totalKnown)
        .filter((total) => total !== null);
    const knownLeads = rows
        .map((row) => row.evidence.leadTimeDays?.value)
        .filter((lead) => typeof lead === "number");
    const minCost = Math.min(...knownTotals);
    const maxCost = Math.max(...knownTotals);
    const minLead = Math.min(...knownLeads);
    const maxLead = Math.max(...knownLeads);
    for (const row of rows) {
        const costScore = row.cost.totalKnown === null
            ? null
            : maxCost === minCost
                ? 100
                : 100 * (1 - (row.cost.totalKnown - minCost) / (maxCost - minCost));
        const lead = row.evidence.leadTimeDays?.value;
        const speedScore = typeof lead !== "number"
            ? null
            : maxLead === minLead
                ? 100
                : 100 * (1 - (lead - minLead) / (maxLead - minLead));
        row.scoreComponents = { cost: costScore, speed: speedScore };
        const available = priority === "cost"
            ? costScore === null
                ? []
                : [costScore]
            : priority === "speed"
                ? speedScore === null
                    ? []
                    : [speedScore]
                : [costScore, speedScore].filter((score) => score !== null);
        row.score =
            available.length === 0
                ? null
                : available.reduce((sum, score) => sum + score, 0) / available.length;
    }
}
export function evaluateOffers(offers, brief, changes = {}) {
    const scenarioBrief = {
        ...brief,
        quantity: changes.quantity ?? brief.quantity,
        deadlineDays: changes.deadlineDays === undefined
            ? brief.deadlineDays
            : changes.deadlineDays,
        priority: changes.priority ?? brief.priority,
    };
    const rows = offers.map((offer) => {
        const feasibility = checkFeasibility(offer, scenarioBrief);
        const cost = calculateCost(offer, scenarioBrief, changes);
        const explanation = [...feasibility.reasons];
        if (cost.totalKnown === null) {
            explanation.push("Total cost cannot be estimated without a known unit price.");
        }
        else if (!cost.complete) {
            explanation.push(`Partial known-cost estimate: ${cost.missingFields.join(", ")} is unknown.`);
        }
        else {
            explanation.push(`Known total: ${cost.currency} ${cost.totalKnown.toFixed(2)}.`);
        }
        if (offer.isFixture) {
            explanation.push("Synthetic fixture; not live supplier evidence.");
        }
        return {
            offerId: offer.offerId,
            supplierName: offer.supplierName,
            isFixture: offer.isFixture,
            feasibility,
            cost,
            score: null,
            scoreComponents: { cost: null, speed: null },
            explanation,
            evidence: offer.provenance,
        };
    });
    const excluded = rows.filter((row) => row.feasibility.status !== "pass");
    const eligible = rows.filter((row) => row.feasibility.status === "pass");
    const needsSpeedEvidence = scenarioBrief.priority !== "cost";
    const offersById = new Map(offers.map((offer) => [offer.offerId, offer]));
    const ranked = eligible.filter((row) => {
        const offer = offersById.get(row.offerId);
        const hasSpeedEvidence = offer?.leadTimeDays !== null &&
            offer?.leadTimeDays !== undefined &&
            (offer.isFixture || offer.provenance.leadTimeDays?.status === "verified");
        return (row.cost.complete &&
            row.cost.totalKnown !== null &&
            (!needsSpeedEvidence || hasSpeedEvidence));
    });
    const partial = eligible.filter((row) => !ranked.includes(row));
    for (const row of partial) {
        if (needsSpeedEvidence && row.cost.complete) {
            row.explanation.push(`${scenarioBrief.priority} priority cannot be fully scored because delivery evidence is unknown or unverified.`);
        }
    }
    scoreRows(ranked, scenarioBrief.priority);
    ranked.sort((a, b) => (b.score ?? Number.NEGATIVE_INFINITY) -
        (a.score ?? Number.NEGATIVE_INFINITY));
    for (const row of ranked) {
        const components = [
            row.scoreComponents.cost === null
                ? "cost score unknown"
                : `cost score ${row.scoreComponents.cost.toFixed(1)}/100`,
            row.scoreComponents.speed === null
                ? "delivery score unknown"
                : `delivery score ${row.scoreComponents.speed.toFixed(1)}/100`,
        ];
        row.explanation.push(`${scenarioBrief.priority} priority score ${row.score?.toFixed(1) ?? "unknown"}/100 (${components.join(", ")}).`);
    }
    const status = ranked.length > 0
        ? "ranked"
        : partial.length > 0
            ? "partial_estimate"
            : "insufficient_evidence";
    return {
        status,
        currency: brief.currency,
        formula: "Known total = (unit price x quantity) + listed shipping + known fees - applicable listed discounts.",
        recommendation: ranked[0]?.offerId ?? null,
        ranked,
        partial,
        excluded,
        nextBestFallback: ranked[1] ?? null,
    };
}
