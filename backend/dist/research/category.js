const packaging = /\b(box(?:es)?|carton|packag\w*|packing|pouch|mailer|corrugat\w*|shipping container)\b/i;
const officeIndustrial = /\b(office|paper|notebook|stationery|pen|chair|desk|printer|workplace|industrial supply|safety gloves?|warehouse)\b/i;
const engineeringMaterials = /\b(steel|stainless|alumin\w*|alloy|timber|lumber|cement|concrete|rebar|rods?|bolts?|fasteners?|pipes?|sheet metal|engineering material)\b/i;
export function classifyProduct(product) {
    if (packaging.test(product))
        return { category: "packaging", live: true };
    if (officeIndustrial.test(product)) {
        return { category: "office_industrial", live: true };
    }
    if (engineeringMaterials.test(product)) {
        return { category: "engineering_materials_fixture", live: false };
    }
    return { category: null, live: false };
}
