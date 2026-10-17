import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createDatabase } from "../src/db/client.js";
import type { PurchaseBrief } from "../src/schemas.js";

const brief: PurchaseBrief = {
  product: "corrugated shipping boxes",
  quantity: 40,
  budget: 500,
  currency: "USD",
  deadlineDays: 30,
  mandatorySpecs: [],
  priority: "cost",
  region: null,
};

describe("HTTP API", () => {
  let server: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;
  let database: ReturnType<typeof createDatabase> | undefined;
  let baseUrl = "";

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((error) => (error ? reject(error) : resolve()));
      });
      server = undefined;
    }
    database?.close();
    database = undefined;
  });

  async function start() {
    database = createDatabase(":memory:");
    const app = createApp(database);
    server = app.listen(0);
    await new Promise<void>((resolve) => server!.once("listening", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No HTTP address.");
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  it("researches fixtures without network calls and persists them", async () => {
    await start();
    const response = await fetch(`${baseUrl}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief, fixtureOnly: true }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.source).toBe("fixture");
    expect(body.offers).toHaveLength(3);
    expect(body.offers.every((offer: { isFixture: boolean }) => offer.isFixture)).toBe(true);
    const saved = await fetch(`${baseUrl}/api/briefs/${body.briefId}`);
    expect(saved.status).toBe(200);
    expect((await saved.json()).offers).toHaveLength(3);
  });

  it("validates malformed bodies and rejects unsupported research categories", async () => {
    await start();
    const malformed = await fetch(`${baseUrl}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ product: "box", quantity: -3 }),
    });
    expect(malformed.status).toBe(400);

    const unsupported = await fetch(`${baseUrl}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product: "fresh mangoes",
        quantity: 20,
        fixtureOnly: true,
      }),
    });
    expect(unsupported.status).toBe(422);
  });

  it("streams fixture research progress over the POST SSE endpoint", async () => {
    await start();
    const response = await fetch(`${baseUrl}/api/research/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief, fixtureOnly: true }),
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const output = await response.text();
    expect(output).toContain("event: progress");
    expect(output).toContain("event: complete");
    expect(output).toContain('"source":"fixture"');
  });

  it("runs a scenario, drafts a message, and records approval without sending", async () => {
    await start();
    const researchResponse = await fetch(`${baseUrl}/api/research`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brief, fixtureOnly: true }),
    });
    const research = await researchResponse.json();
    const scenarioResponse = await fetch(`${baseUrl}/api/scenario`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        briefId: research.briefId,
        brief,
        offers: research.offers,
        changes: {
          quantity: 40,
          selectedOfferId: research.offers[0].offerId,
        },
      }),
    });
    expect(scenarioResponse.status).toBe(200);
    expect((await scenarioResponse.json()).scenarioId).toBeTruthy();

    const draftResponse = await fetch(`${baseUrl}/api/negotiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        briefId: research.briefId,
        brief,
        offers: research.offers,
        supplierId: research.offers[0].offerId,
      }),
    });
    expect(draftResponse.status).toBe(200);
    const draft = await draftResponse.json();
    expect(draft.status).toBe("insufficient_evidence");
    const approvalResponse = await fetch(`${baseUrl}/api/negotiate/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draftId: draft.draftId, approved: true }),
    });
    expect(approvalResponse.status).toBe(200);
    expect(await approvalResponse.json()).toMatchObject({
      approvalStatus: "approved",
      sent: false,
    });
  });
});
