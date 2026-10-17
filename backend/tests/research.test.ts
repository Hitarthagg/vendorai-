import { describe, expect, it } from "vitest";
import { makeMissingOffer } from "../src/research/extract.js";
import { classifyProduct } from "../src/research/category.js";
import { isSafeSupplierUrl } from "../src/research/tinyfish.js";
import { brief } from "./helpers.js";

describe("research guardrails and categories", () => {
  it("limits live research to the two planned categories", () => {
    expect(classifyProduct("corrugated shipping boxes")).toEqual({
      category: "packaging",
      live: true,
    });
    expect(classifyProduct("office chairs")).toEqual({
      category: "office_industrial",
      live: true,
    });
    expect(classifyProduct("stainless steel rod")).toEqual({
      category: "engineering_materials_fixture",
      live: false,
    });
    expect(classifyProduct("fresh mangoes").category).toBeNull();
  });

  it("rejects non-HTTPS, local, login, and checkout URLs", () => {
    expect(isSafeSupplierUrl("https://supplier.example/products/boxes")).toBe(true);
    expect(isSafeSupplierUrl("http://supplier.example/products/boxes")).toBe(false);
    expect(isSafeSupplierUrl("https://localhost/products/boxes")).toBe(false);
    expect(isSafeSupplierUrl("https://supplier.example/account/signin")).toBe(false);
    expect(isSafeSupplierUrl("https://127.0.0.1/products/boxes")).toBe(false);
  });

  it("retains search results as live offers with unknown fields rather than guessing", () => {
    const offer = makeMissingOffer(
      brief,
      "packaging",
      "https://supplier.example/products/box",
      "Supplier listing",
    );
    expect(offer.isFixture).toBe(false);
    expect(offer.unitPrice).toBeNull();
    expect(offer.provenance.unitPrice.status).toBe("missing");
    expect(offer.provenance.unitPrice.sourceUrl).toBe(offer.sourceUrl);
  });
});
