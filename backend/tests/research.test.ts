import { describe, expect, it } from "vitest";
import { makeMissingOffer } from "../src/research/extract.js";
import { classifyProduct } from "../src/research/category.js";
import {
  indianResultsFirst,
  isSafeSupplierUrl,
  searchLocation,
  searchQuery,
} from "../src/research/tinyfish.js";
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

  it("searches India by default and prioritizes likely Indian results", () => {
    expect(searchLocation(null)).toBe("India");
    expect(searchLocation("New Delhi")).toBe("New Delhi, India");
    expect(searchLocation("Mumbai, India")).toBe("Mumbai, India");
    expect(searchQuery(brief, "packaging")).toContain(" India ");

    const results = [
      { position: 1, site_name: "Global", url: "https://global.example/boxes", title: "Boxes", snippet: "Bulk cartons" },
      { position: 2, site_name: "Supplier", url: "https://supplier.in/boxes", title: "Boxes", snippet: "Bulk cartons" },
      { position: 3, site_name: "Maker", url: "https://maker.com/boxes", title: "Indian manufacturer", snippet: "Corrugated boxes" },
    ];
    expect(indianResultsFirst(results).map((result) => result.url)).toEqual([
      "https://supplier.in/boxes",
      "https://maker.com/boxes",
      "https://global.example/boxes",
    ]);
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
