import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, join } from "node:path";
import pLimit from "p-limit";
import { z } from "zod";
import type { Offer, PurchaseBrief } from "../schemas.js";
import { CategorySchema } from "../schemas.js";
import { makeFixtureOffers } from "../fixtures/offers.js";
import { llmConfigured } from "../llm/provider.js";
import {
  agentFallbackEnabled,
  agentGoal,
  agentOutputSchema,
  createTinyFishClient,
  isSafeSupplierUrl,
  indianResultsFirst,
  searchQuery,
  searchLocation,
  tinyFishConfigured,
  type ResearchProgress,
  type ResearchResult,
  type ResearchSnapshot,
} from "./tinyfish.js";
import { classifyProduct } from "./category.js";
import { extractOfferFromPage, makeMissingOffer } from "./extract.js";

type Candidate = {
  title: string;
  url: string;
  snippet: string;
};

type FetchedPage = {
  candidate: Candidate;
  text: string | null;
  retrievedAt: string;
  error?: string;
};

export class ResearchError extends Error {}

const AgentResultSchema = z.object({
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
  evidence: z.record(z.string(), z.string().nullable()),
});

async function retryOnce<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (firstError) {
    if (!shouldRetry(firstError)) throw firstError;
    try {
      return await operation();
    } catch (secondError) {
      throw new Error(
        `TinyFish request failed after one retry: ${
          secondError instanceof Error ? secondError.message : String(firstError)
        }`,
        { cause: secondError },
      );
    }
  }
}

function shouldRetry(error: unknown): boolean {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return true;
  }
  const status = error.status;
  return typeof status !== "number" || status === 429 || status >= 500;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : null;
}

function evidenceStatus(
  value: unknown,
  quote: string | null | undefined,
  pageText: string,
): "verified" | "inferred" | "missing" {
  if (value === null || value === undefined) return "missing";
  if (
    quote &&
    quote.trim().length >= 3 &&
    pageText.toLocaleLowerCase().includes(quote.toLocaleLowerCase())
  ) {
    if (typeof value === "number") {
      const amounts = quote.match(/\b\d[\d,]*(?:\.\d+)?\b/g) ?? [];
      return amounts.some(
        (amount) =>
          Math.abs(Number(amount.replaceAll(",", "")) - value) < 0.0001,
      )
        ? "verified"
        : "inferred";
    }
    if (typeof value === "string") {
      const symbols: Record<string, string> = {
        USD: "$",
        EUR: "€",
        GBP: "£",
        INR: "₹",
      };
      return (
        quote.toLocaleLowerCase().includes(value.toLocaleLowerCase()) ||
        Boolean(symbols[value] && quote.includes(symbols[value]!))
      )
        ? "verified"
        : "inferred";
    }
  }
  return "inferred";
}

function applyAgentData(
  offer: Offer,
  raw: unknown,
  pageText: string,
  retrievedAt: string,
): Offer {
  const record = asRecord(raw);
  if (!record) return offer;
  const nestedResult = asRecord(record.result);
  const candidate = nestedResult ?? record;
  const parsed = AgentResultSchema.safeParse(candidate);
  if (!parsed.success) return offer;

  const result = parsed.data;
  const values: Record<string, unknown> = {
    supplierName: result.supplierName,
    productTitle: result.productTitle,
    currency: result.currency,
    unitPrice: result.unitPrice,
    unitBasis: result.unitBasis,
    moq: result.moq,
    shippingCost: result.shippingCost,
    shippingUnit: result.shippingUnit,
    leadTimeDays: result.leadTimeDays,
    deliveryRegion: result.deliveryRegion,
  };
  const updated = { ...offer };
  for (const [field, value] of Object.entries(values)) {
    if (value === null || value === undefined) continue;
    if (updated.provenance[field]?.status === "verified") continue;
    if (field === "supplierName" && result.supplierName) {
      updated.supplierName = result.supplierName;
    } else if (field === "productTitle" && result.productTitle) {
      updated.productTitle = result.productTitle;
    } else if (field === "currency") {
      updated.currency = result.currency;
    } else if (field === "unitPrice") {
      updated.unitPrice = result.unitPrice;
    } else if (field === "unitBasis" && result.unitBasis) {
      updated.unitBasis = result.unitBasis;
    } else if (field === "moq") {
      updated.moq = result.moq;
    } else if (field === "shippingCost") {
      updated.shippingCost = result.shippingCost;
    } else if (field === "shippingUnit") {
      updated.shippingUnit = result.shippingUnit;
    } else if (field === "leadTimeDays") {
      updated.leadTimeDays = result.leadTimeDays;
    } else if (field === "deliveryRegion") {
      updated.deliveryRegion = result.deliveryRegion;
    }
    const quote = result.evidence[field];
    const status = evidenceStatus(value, quote, pageText);
    updated.provenance[field] = {
      value,
      sourceUrl: offer.sourceUrl,
      retrievedAt,
      status,
      extractionMethod: "agent",
      ...(status === "inferred"
        ? { reason: "Agent result did not match a verbatim quote from the fetched page." }
        : status === "missing"
          ? { reason: "Not present on the supplier page." }
          : {}),
    };
  }
  return updated;
}

function markAgentFailure(
  offer: Offer,
  reason: string,
  retrievedAt: string,
): Offer {
  const updated = { ...offer, provenance: { ...offer.provenance } };
  for (const field of [
    "unitPrice",
    "currency",
    "moq",
    "shippingCost",
    "leadTimeDays",
  ] as const) {
    if (updated[field] !== null) continue;
    updated.provenance[field] = {
      value: null,
      sourceUrl: offer.sourceUrl,
      retrievedAt,
      status: "missing",
      extractionMethod: "agent",
      reason,
    };
  }
  return updated;
}

function safeCandidate(result: {
  title: string;
  url: string;
  snippet: string;
}): Candidate | null {
  if (!isSafeSupplierUrl(result.url)) return null;
  const path = new URL(result.url).pathname;
  if (/\.(?:pdf|png|jpe?g|gif|zip|exe)(?:$|\/)/i.test(path)) return null;
  return {
    title: result.title,
    url: result.url,
    snippet: result.snippet,
  };
}

async function robotsAllows(url: string): Promise<boolean> {
  const target = new URL(url);
  try {
    const response = await fetch(new URL("/robots.txt", target.origin), {
      signal: AbortSignal.timeout(5_000),
      headers: { "User-Agent": "VendorMindResearchBot" },
      redirect: "manual",
    });
    if (response.status === 404) return true;
    if (!response.ok) return false;
    const text = await response.text();
    const groups: Array<{ agents: string[]; rules: Array<[string, string]> }> = [];
    let current: { agents: string[]; rules: Array<[string, string]> } | null = null;
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.split("#", 1)[0]?.trim();
      if (!line) {
        if (current && (current.agents.length || current.rules.length)) {
          groups.push(current);
          current = null;
        }
        continue;
      }
      const separator = line.indexOf(":");
      if (separator < 0) continue;
      const directive = line.slice(0, separator).trim().toLowerCase();
      const value = line.slice(separator + 1).trim();
      if (directive === "user-agent") {
        if (current?.rules.length) {
          groups.push(current);
          current = null;
        }
        current ??= { agents: [], rules: [] };
        current.agents.push(value.toLowerCase());
      } else if (
        (directive === "disallow" || directive === "allow") &&
        current?.agents.length &&
        value
      ) {
        current.rules.push([directive, value]);
      }
    }
    if (current?.agents.length) groups.push(current);
    const applicable = groups.filter((group) =>
      group.agents.some((agent) => agent === "*" || agent === "vendormindresearchbot"),
    );
    const rules = applicable.flatMap((group) => group.rules);
    const path = `${target.pathname}${target.search}`;
    const matching = rules
      .filter(([, rule]) => path.startsWith(rule.replace(/\*$/, "")))
      .sort((a, b) => b[1].length - a[1].length);
    return matching[0]?.[0] !== "disallow";
  } catch {
    return false;
  }
}

async function persistSnapshot(snapshot: ResearchSnapshot): Promise<string> {
  const configured = process.env.SNAPSHOT_DIR ?? "./snapshots";
  const directory = resolve(configured);
  await mkdir(directory, { recursive: true });
  const name = `${Date.now()}-${randomUUID()}.json`;
  await writeFile(
    join(directory, name),
    JSON.stringify(snapshot, null, 2),
    "utf8",
  );
  snapshot.filePath = join(directory, name);
  return snapshot.filePath;
}

function syntheticResult(
  brief: PurchaseBrief,
  category: NonNullable<ReturnType<typeof classifyProduct>["category"]>,
  note: string,
  snapshots: ResearchSnapshot[],
): ResearchResult {
  return {
    offers: makeFixtureOffers(brief, category),
    source: "fixture",
    category,
    note,
    snapshots,
  };
}

export async function researchSuppliers(
  brief: PurchaseBrief,
  options: { fixtureOnly?: boolean; briefId?: string },
  progress: ResearchProgress = () => undefined,
): Promise<ResearchResult> {
  const classification = classifyProduct(brief.product);
  if (!classification.category) {
    throw new Error(
      "Round 1 live research supports packaging and office/industrial supplies; engineering materials use fixtures.",
    );
  }
  const category = CategorySchema.parse(classification.category);
  if (!classification.live || options.fixtureOnly) {
    progress({
      stage: "complete",
      message: classification.live
        ? "Returning clearly labelled synthetic fixtures by request."
        : "Engineering materials are fixture-only in Round 1.",
    });
    return syntheticResult(
      brief,
      category,
      classification.live
        ? "Fixture-only research requested; no live supplier pages were visited."
        : "Round 1 engineering-material research uses labelled synthetic fixtures.",
      [],
    );
  }
  if (!tinyFishConfigured()) {
    return syntheticResult(
      brief,
      category,
      "TinyFish API key is not configured; labelled synthetic fixtures are shown instead.",
      [],
    );
  }

  const client = createTinyFishClient();
  const snapshots: ResearchSnapshot[] = [];
  let searchResponse;
  const query = searchQuery(brief, category);
  progress({ stage: "search", message: "Searching for Indian supplier listings first." });
  try {
    searchResponse = await retryOnce(() =>
      client.search.query({
        query,
        purpose: "Find public India-based wholesale suppliers with published terms for buyer comparison.",
        location: searchLocation(brief.region),
      }),
    );
  } catch (error) {
    throw new ResearchError(
      `TinyFish Search failed: ${
        error instanceof Error ? error.message : "Unknown error."
      }`,
      { cause: error },
    );
  }
  const searchRetrievedAt = new Date().toISOString();
  snapshots.push({
    sourceUrl: "https://api.search.tinyfish.ai",
    retrievedAt: searchRetrievedAt,
    stage: "search",
    payload: searchResponse,
  });
  await persistSnapshot(snapshots[snapshots.length - 1]!);

  const uniqueHosts = new Set<string>();
  const candidates: Candidate[] = [];
  for (const result of indianResultsFirst(searchResponse.results.slice(0, 10))) {
    const candidate = safeCandidate(result);
    if (!candidate) continue;
    const host = new URL(candidate.url).hostname;
    if (uniqueHosts.has(host)) continue;
    uniqueHosts.add(host);
    if (!(await robotsAllows(candidate.url))) continue;
    candidates.push(candidate);
    if (candidates.length === 5) break;
  }
  if (candidates.length === 0) {
    throw new ResearchError(
      "TinyFish Search returned no eligible public supplier pages after URL and robots.txt checks. Try a more specific packaging or office product.",
    );
  }

  const pages: FetchedPage[] = [];
  const limiter = pLimit(3);
  const fetchResults = await Promise.all(
    candidates.map((candidate, index) =>
      limiter(async () => {
        progress({
          stage: "fetch",
          message: `Fetching public supplier page ${index + 1} of ${candidates.length}.`,
          completed: index,
          total: candidates.length,
        });
        try {
          const response = await retryOnce(() =>
            client.fetch.getContents({
              urls: [candidate.url],
              format: "markdown",
              purpose: `Read public supplier terms for ${brief.product}.`,
              per_url_timeout_ms: 20_000,
            }),
          );
          const result = response.results[0];
          const pageText =
            result?.format === "markdown" || result?.format === "html"
              ? result.text ?? ""
              : "";
          const retrievedAt = new Date().toISOString();
          if (!result || !pageText.trim()) {
            return {
              candidate,
              text: null,
              retrievedAt,
              error: "TinyFish Fetch returned no page text.",
            };
          }
          const snapshot: ResearchSnapshot = {
            sourceUrl: candidate.url,
            retrievedAt,
            stage: "fetch",
            payload: response,
          };
          snapshots.push(snapshot);
          await persistSnapshot(snapshot);
          return { candidate, text: pageText, retrievedAt };
        } catch (error) {
          const retrievedAt = new Date().toISOString();
          const snapshot: ResearchSnapshot = {
            sourceUrl: candidate.url,
            retrievedAt,
            stage: "fetch",
            payload: {
              error: error instanceof Error ? error.message : "Unknown fetch error.",
            },
          };
          snapshots.push(snapshot);
          await persistSnapshot(snapshot);
          return {
            candidate,
            text: null,
            retrievedAt,
            error:
              error instanceof Error
                ? `TinyFish Fetch failed after a retry: ${error.message}`
                : "TinyFish Fetch failed after a retry.",
          };
        }
      }),
    ),
  );
  pages.push(...fetchResults);
  if (!pages.some((page) => page.text !== null)) {
    const offers = pages.map((page) =>
      makeMissingOffer(
        brief,
        category,
        page.candidate.url,
        page.candidate.title || "Supplier listing",
        page.retrievedAt,
        "fetch",
        page.error ?? "TinyFish Fetch returned no page text.",
      ),
    );
    return {
      offers,
      category,
      source: "tinyfish",
      note: "Supplier pages could not be fetched. Offers are marked as missing evidence.",
      snapshots,
    };
  }

  const offers = await Promise.all(
    pages.map((page, index) => {
      if (page.text === null) {
        return makeMissingOffer(
          brief,
          category,
          page.candidate.url,
          page.candidate.title || "Supplier listing",
          page.retrievedAt,
          "fetch",
          page.error ?? "TinyFish Fetch returned no page text.",
        );
      }
      progress({
        stage: "extract",
        message: `Extracting and validating supplier ${index + 1} of ${pages.length}.`,
        completed: index,
        total: pages.length,
      });
      return extractOfferFromPage(
        brief,
        category,
        page.candidate.url,
        page.candidate.title,
        page.text,
        page.retrievedAt,
        snapshots,
      );
    }),
  );

  const configuredAgentLimit = Number(
    process.env.TINYFISH_AGENT_MAX_RUNS ?? "5",
  );
  if (
    !Number.isInteger(configuredAgentLimit) ||
    configuredAgentLimit < 0 ||
    configuredAgentLimit > 5
  ) {
    throw new Error("TINYFISH_AGENT_MAX_RUNS must be an integer from 0 to 5.");
  }
  const agentLimit = Math.min(5, configuredAgentLimit);
  let agentRuns = 0;
  if (agentFallbackEnabled() && agentLimit > 0) {
    for (let index = 0; index < offers.length && agentRuns < agentLimit; index += 1) {
      const offer = offers[index]!;
      if (
        offer.unitPrice !== null &&
        offer.moq !== null &&
        offer.shippingCost !== null
      ) {
        continue;
      }
      const page = pages.find((candidate) => candidate.candidate.url === offer.sourceUrl);
      if (!page || !offer.sourceUrl) continue;
      let agentResult: Awaited<ReturnType<typeof client.agent.run>> | null = null;
      let failureReason = "TinyFish Agent did not return completed structured data.";
      for (let attempt = 0; attempt < 2 && agentRuns < agentLimit; attempt += 1) {
        agentRuns += 1;
        console.info("[research] TinyFish Agent run", {
          sourceUrl: offer.sourceUrl,
          run: agentRuns,
          limit: agentLimit,
        });
        progress({
          stage: "agent",
          message: `Using Agent fallback for supplier ${index + 1} of ${offers.length} (run ${agentRuns} of ${agentLimit}).`,
        });
        try {
          const response = await client.agent.run({
            url: offer.sourceUrl,
            goal: agentGoal(brief),
            output_schema: agentOutputSchema,
          });
          const retrievedAt = new Date().toISOString();
          const snapshot: ResearchSnapshot = {
            sourceUrl: offer.sourceUrl,
            retrievedAt,
            stage: "agent",
            payload: response,
          };
          snapshots.push(snapshot);
          await persistSnapshot(snapshot);
          if (response.status === "COMPLETED" && response.result) {
            agentResult = response;
            break;
          }
          failureReason = response.error?.message ?? failureReason;
        } catch (error) {
          failureReason =
            error instanceof Error ? error.message : "TinyFish Agent failed.";
          if (!shouldRetry(error)) break;
        }
      }
      if (agentResult?.result) {
        offers[index] = applyAgentData(
          offer,
          agentResult.result,
          page.text ?? "",
          new Date().toISOString(),
        );
      } else {
        offers[index] = markAgentFailure(
          offer,
          `TinyFish Agent failed after the permitted retry: ${failureReason}`,
          new Date().toISOString(),
        );
      }
    }
  }

  if (!llmConfigured()) {
    return {
      offers,
      category,
      source: "tinyfish",
      note:
        "Live pages were searched and fetched. Configure an OpenAI-compatible LLM to extract page terms; missing values remain unknown.",
      snapshots,
    };
  }
  progress({
    stage: "complete",
    message: "Research finished; every offer has field-level provenance.",
    completed: offers.length,
    total: offers.length,
  });
  return {
    offers,
    category,
    source: "tinyfish",
    note: "",
    snapshots,
  };
}
