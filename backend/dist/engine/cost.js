function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
const INDIVIDUAL_UNIT_BASES = new Set([
    "each",
    "unit",
    "per unit",
    "piece",
    "pieces",
    "pc",
    "pcs",
]);
function unitBasisIsIndividual(unitBasis) {
    return INDIVIDUAL_UNIT_BASES.has(unitBasis.trim().toLocaleLowerCase());
}
export function calculateCost(offer, brief, changes = {}) {
    const quantity = changes.quantity ?? brief.quantity;
    const missingFields = [];
    const currencyMismatch = offer.currency !== brief.currency;
    if (offer.currency === null)
        missingFields.push("currency");
    else if (currencyMismatch)
        missingFields.push("currency conversion");
    if (!unitBasisIsIndividual(offer.unitBasis)) {
        missingFields.push("incompatible or unknown unit basis");
    }
    if (offer.unitPrice === null)
        missingFields.push("unit price");
    else if (!offer.isFixture &&
        offer.provenance.unitPrice?.status !== "verified") {
        missingFields.push("unverified unit price");
    }
    if (offer.provenance.quantityTiers?.status === "missing" ||
        (!offer.isFixture && offer.provenance.quantityTiers?.status !== "verified")) {
        missingFields.push("unverified quantity discounts");
    }
    const tiersVerified = offer.isFixture || offer.provenance.quantityTiers?.status === "verified";
    const tier = tiersVerified
        ? offer.quantityTiers
            .filter((candidate) => candidate.minimumQuantity <= quantity)
            .sort((a, b) => b.minimumQuantity - a.minimumQuantity)[0]
        : undefined;
    const listedTierDiscount = tiersVerified
        ? tier?.unitPrice !== null && tier?.unitPrice !== undefined
            ? 0
            : tier?.discountPercent ??
                offer.discountsApplicable
                    .filter((candidate) => candidate.minimumQuantity <= quantity)
                    .sort((a, b) => b.minimumQuantity - a.minimumQuantity)[0]
                    ?.discountPercent ??
                0
        : 0;
    const scenarioDiscount = changes.discountsByOffer?.[offer.offerId] ?? 0;
    const tierUnitPrice = tier?.unitPrice ?? offer.unitPrice;
    const discountedUnitPrice = tierUnitPrice === null
        ? null
        : roundMoney(tierUnitPrice *
            (1 - listedTierDiscount / 100) *
            (1 - scenarioDiscount / 100));
    const overriddenShipping = changes.shippingOverrides?.[offer.offerId];
    const shippingCost = overriddenShipping !== undefined
        ? overriddenShipping
        : offer.shippingCost === null
            ? null
            : offer.shippingUnit === "per_unit"
                ? offer.shippingCost * quantity
                : offer.shippingUnit === "flat"
                    ? offer.shippingCost
                    : null;
    if (shippingCost === null)
        missingFields.push("shipping");
    else if (overriddenShipping === undefined &&
        !offer.isFixture &&
        offer.provenance.shippingCost?.status !== "verified") {
        missingFields.push("unverified shipping");
    }
    if (offer.provenance.extraFees?.status === "missing") {
        missingFields.push("fees");
    }
    const fees = offer.provenance.extraFees?.status === "missing" ||
        (!offer.isFixture && offer.provenance.extraFees?.status !== "verified")
        ? null
        : offer.extraFees.reduce((total, fee) => total + (fee.currency === brief.currency ? fee.amount : 0), 0);
    if (offer.extraFees.some((fee) => fee.currency !== brief.currency) &&
        !missingFields.includes("currency conversion")) {
        missingFields.push("currency conversion");
    }
    const complete = !currencyMismatch &&
        offer.currency !== null &&
        unitBasisIsIndividual(offer.unitBasis) &&
        (offer.isFixture || offer.provenance.currency?.status === "verified") &&
        discountedUnitPrice !== null &&
        (offer.isFixture || offer.provenance.unitPrice?.status === "verified") &&
        shippingCost !== null &&
        (overriddenShipping !== undefined ||
            offer.isFixture ||
            offer.provenance.shippingCost?.status === "verified") &&
        fees !== null &&
        (offer.isFixture || offer.provenance.extraFees?.status === "verified") &&
        (offer.isFixture || offer.provenance.quantityTiers?.status === "verified") &&
        !missingFields.includes("currency conversion");
    const totalKnown = discountedUnitPrice === null ||
        currencyMismatch ||
        !unitBasisIsIndividual(offer.unitBasis) ||
        missingFields.includes("currency conversion")
        ? null
        : roundMoney(discountedUnitPrice * quantity +
            (shippingCost ?? 0) +
            (fees ?? 0));
    return {
        currency: brief.currency,
        unitPrice: discountedUnitPrice,
        shippingCost: shippingCost === null ? null : roundMoney(shippingCost),
        fees: fees === null ? null : roundMoney(fees),
        totalKnown,
        complete,
        formula: "(unit price x quantity) + listed shipping + known fees; " +
            "listed quantity discount and scenario discount are applied to unit price",
        missingFields: [...new Set(missingFields)],
    };
}
