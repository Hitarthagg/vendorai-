import { describe, expect, it, vi } from "vitest";
import { brief } from "./helpers.js";

vi.mock("../src/research/tinyfish.js", () => ({
  tinyFishConfigured: () => true,
  createTinyFishClient: () => ({
    search: { query: () => Promise.reject(new Error("Invalid API key")) },
  }),
  searchQuery: () => "corrugated shipping boxes",
  searchLocation: () => "India",
  indianResultsFirst: (results: unknown[]) => results,
}));

import { researchSuppliers, ResearchError } from "../src/research/service.js";

describe("live research failures", () => {
  it("reports TinyFish Search errors instead of silently substituting fixtures", async () => {
    await expect(researchSuppliers(brief, { fixtureOnly: false })).rejects.toThrow(
      ResearchError,
    );
    await expect(researchSuppliers(brief, { fixtureOnly: false })).rejects.toThrow(
      /TinyFish Search failed.*Invalid API key/,
    );
  });
});
