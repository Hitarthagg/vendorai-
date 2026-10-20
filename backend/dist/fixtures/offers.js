import { randomUUID } from "node:crypto";
const fixtureRows = {
    packaging: [
        { supplierName: "Northstar Packaging (sample)", price: 1.18, moq: 100, shipping: 85, shippingUnit: "flat", lead: 12, attribute: "recycled-content: unknown" },
        { supplierName: "Cedar Boxworks (sample)", price: 1.06, moq: 500, shipping: null, shippingUnit: "unknown", lead: 20, attribute: "recycled-content: unknown" },
        { supplierName: "ParcelCraft Supply (sample)", price: 1.31, moq: 50, shipping: 0.08, shippingUnit: "per_unit", lead: 7, attribute: "recycled-content: unknown" },
    ],
    office_industrial: [
        { supplierName: "Harbor Office Goods (sample)", price: 4.2, moq: 20, shipping: 45, shippingUnit: "flat", lead: 8, attribute: "material: mixed" },
        { supplierName: "Summit Workplace Supply (sample)", price: 3.85, moq: 100, shipping: null, shippingUnit: "unknown", lead: 15, attribute: "material: mixed" },
        { supplierName: "Maple Industrial Traders (sample)", price: 4.55, moq: 10, shipping: 0.12, shippingUnit: "per_unit", lead: 5, attribute: "material: mixed" },
    ],
    engineering_materials_fixture: [
        { supplierName: "ForgeLine Materials (synthetic fixture)", price: 8.4, moq: 25, shipping: 125, shippingUnit: "flat", lead: 10, attribute: "grade: unconfirmed" },
        { supplierName: "Alloy & Beam Co. (synthetic fixture)", price: 7.95, moq: 100, shipping: 0.6, shippingUnit: "per_unit", lead: 18, attribute: "grade: unconfirmed" },
        { supplierName: "Stonebridge Engineering (synthetic fixture)", price: 9.1, moq: 10, shipping: null, shippingUnit: "unknown", lead: 6, attribute: "grade: unconfirmed" },
    ],
};
const fixtureValues = (row) => ({
    supplierName: row.supplierName,
    unitPrice: row.price,
    moq: row.moq,
    shippingCost: row.shipping,
    leadTimeDays: row.lead,
    shippingUnit: row.shippingUnit,
});
export function makeFixtureOffers(brief, category) {
    const retrievedAt = new Date().toISOString();
    const rows = category === "engineering_materials_fixture"
        ? fixtureRows.engineering_materials_fixture
        : fixtureRows[category];
    return rows.map((row, index) => {
        const values = fixtureValues(row);
        const provenance = {};
        for (const [field, value] of Object.entries({
            ...values,
            productTitle: brief.product,
            currency: brief.currency,
            unitBasis: "each",
            quantityTiers: [],
            discountsApplicable: [],
            deliveryRegion: null,
            extraFees: [],
            attributes: { sample: row.attribute },
            specMatchFlags: Object.fromEntries(brief.mandatorySpecs.map((spec) => [spec, null])),
        })) {
            provenance[field] = {
                value,
                sourceUrl: null,
                retrievedAt,
                status: "inferred",
                extractionMethod: "fixture",
                reason: "Synthetic fixture only; not a live supplier listing or quote.",
            };
        }
        return {
            offerId: randomUUID(),
            supplierName: row.supplierName,
            productTitle: brief.product,
            category,
            sourceUrl: null,
            retrievedAt,
            isFixture: true,
            unitPrice: row.price,
            currency: brief.currency,
            unitBasis: "each",
            quantityTiers: [],
            moq: row.moq,
            discountsApplicable: [],
            shippingCost: row.shipping,
            shippingUnit: row.shippingUnit,
            leadTimeDays: row.lead,
            deliveryRegion: brief.region,
            extraFees: [],
            attributes: { sample: row.attribute, fixtureIndex: index + 1 },
            specMatchFlags: Object.fromEntries(brief.mandatorySpecs.map((spec) => [spec, null])),
            provenance,
        };
    });
}
