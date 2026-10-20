import "dotenv/config";
import express from "express";
import { ZodError } from "zod";
import { createDatabase } from "./db/client.js";
import { approveDraft, getBrief, saveDraft, saveResearch, saveScenario, saveSnapshot, } from "./db/repository.js";
import { ApproveDraftRequestSchema, EvaluationRequestSchema, NegotiateRequestSchema, ResearchRequestSchema, ScenarioRequestSchema, parseResearchBrief, } from "./schemas.js";
import { evaluateOffers } from "./engine/evaluate.js";
import { analyzeScenario } from "./engine/scenario.js";
import { createNegotiationDraft } from "./llm/negotiate.js";
import { researchSuppliers } from "./research/service.js";
import { agentFallbackEnabled, tinyFishConfigured, } from "./research/tinyfish.js";
import { classifyProduct } from "./research/category.js";
export class ApiError extends Error {
    statusCode;
    details;
    constructor(message, statusCode, details) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
    }
}
function validationError(error) {
    return new ApiError("Request validation failed.", 400, error.issues);
}
function sendSse(response, event, data) {
    if (response.writableEnded)
        return;
    response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}
function requireUuid(value) {
    if (!value)
        return undefined;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
        throw new ApiError("briefId must be a valid UUID.", 400);
    }
    return value;
}
function persistedBriefId(database, brief, offerRecords, requestedBriefId) {
    if (requestedBriefId) {
        if (!getBrief(database.db, requestedBriefId)) {
            throw new ApiError("The requested brief was not found.", 404);
        }
        return requestedBriefId;
    }
    return saveResearch(database.db, brief, offerRecords);
}
export function createApp(database = createDatabase()) {
    const app = express();
    app.disable("x-powered-by");
    app.use(express.json({ limit: "1mb" }));
    app.get("/api/health", (_request, response) => {
        response.json({
            status: "ok",
            tinyFishConfigured: tinyFishConfigured(),
            agentFallbackEnabled: agentFallbackEnabled(),
        });
    });
    const researchHandler = async (request, response, stream) => {
        const validation = ResearchRequestSchema.safeParse(request.body);
        if (!validation.success)
            throw validationError(validation.error);
        const brief = parseResearchBrief(validation.data);
        if (!classifyProduct(brief.product).category) {
            throw new ApiError("Round 1 supports packaging and office/industrial live research; engineering materials use fixtures.", 422);
        }
        const progress = (event) => {
            if (stream)
                sendSse(response, "progress", event);
        };
        if (stream) {
            response.status(200);
            response.setHeader("Content-Type", "text/event-stream; charset=utf-8");
            response.setHeader("Cache-Control", "no-cache, no-transform");
            response.setHeader("Connection", "keep-alive");
            response.flushHeaders();
            sendSse(response, "progress", {
                stage: "search",
                message: "Research request accepted.",
            });
        }
        try {
            const result = await researchSuppliers(brief, { fixtureOnly: validation.data.fixtureOnly }, progress);
            const briefId = saveResearch(database.db, brief, result.offers);
            for (const snapshot of result.snapshots) {
                await saveSnapshot(database.db, briefId, snapshot.sourceUrl, snapshot.retrievedAt, snapshot.filePath ?? `${process.env.SNAPSHOT_DIR ?? "./snapshots"}`);
            }
            const body = {
                briefId,
                brief,
                ...result,
                snapshots: result.snapshots.length,
            };
            if (stream) {
                sendSse(response, "complete", body);
                response.end();
            }
            else {
                response.status(200).json(body);
            }
        }
        catch (error) {
            if (stream) {
                sendSse(response, "error", {
                    status: error instanceof ApiError
                        ? error.statusCode
                        : error instanceof Error &&
                            error.message.startsWith("Round 1")
                            ? 422
                            : 500,
                    message: error instanceof Error ? error.message : "Research request failed.",
                });
                response.end();
                return;
            }
            if (error instanceof Error && error.message.startsWith("Round 1")) {
                throw new ApiError(error.message, 422);
            }
            throw error;
        }
    };
    app.post("/api/research", async (request, response, next) => {
        try {
            await researchHandler(request, response, false);
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/api/research/stream", async (request, response, next) => {
        try {
            await researchHandler(request, response, true);
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/api/evaluate", (request, response, next) => {
        try {
            const parsed = EvaluationRequestSchema.safeParse(request.body);
            if (!parsed.success)
                throw validationError(parsed.error);
            const evaluation = evaluateOffers(parsed.data.offers, parsed.data.brief);
            const briefId = saveResearch(database.db, parsed.data.brief, parsed.data.offers);
            response.json({ briefId, ...evaluation });
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/api/scenario", (request, response, next) => {
        try {
            const parsed = ScenarioRequestSchema.safeParse(request.body);
            if (!parsed.success)
                throw validationError(parsed.error);
            const requestedBriefId = requireUuid(typeof request.body.briefId === "string" ? request.body.briefId : undefined);
            const briefId = persistedBriefId(database, parsed.data.brief, parsed.data.offers, requestedBriefId);
            const result = analyzeScenario(parsed.data.offers, parsed.data.brief, parsed.data.changes);
            const scenarioId = saveScenario(database.db, briefId, { brief: parsed.data.brief, changes: parsed.data.changes }, result);
            response.json({ briefId, scenarioId, ...result });
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/api/negotiate", async (request, response, next) => {
        try {
            const parsed = NegotiateRequestSchema.safeParse(request.body);
            if (!parsed.success)
                throw validationError(parsed.error);
            const requestedBriefId = requireUuid(typeof request.body.briefId === "string" ? request.body.briefId : undefined);
            const briefId = persistedBriefId(database, parsed.data.brief, parsed.data.offers, requestedBriefId);
            const draft = await createNegotiationDraft(parsed.data.brief, parsed.data.offers, parsed.data.supplierId);
            saveDraft(database.db, briefId, draft);
            response.json({ briefId, ...draft });
        }
        catch (error) {
            next(error);
        }
    });
    app.post("/api/negotiate/approve", (request, response, next) => {
        try {
            const parsed = ApproveDraftRequestSchema.safeParse(request.body);
            if (!parsed.success)
                throw validationError(parsed.error);
            if (!approveDraft(database.db, parsed.data.draftId)) {
                throw new ApiError("Negotiation draft was not found.", 404);
            }
            response.json({
                draftId: parsed.data.draftId,
                approvalStatus: "approved",
                sent: false,
                message: "Approval recorded. No message was sent.",
            });
        }
        catch (error) {
            next(error);
        }
    });
    app.get("/api/briefs/:briefId", (request, response, next) => {
        try {
            const briefId = requireUuid(request.params.briefId);
            const saved = briefId ? getBrief(database.db, briefId) : null;
            if (!saved)
                throw new ApiError("The requested brief was not found.", 404);
            response.json(saved);
        }
        catch (error) {
            next(error);
        }
    });
    app.use((_request, _response, next) => {
        next(new ApiError("Route not found.", 404));
    });
    const errorHandler = (error, _request, response, _next) => {
        if (response.headersSent)
            return;
        if (error instanceof ZodError)
            error = validationError(error);
        if (error instanceof ApiError) {
            response.status(error.statusCode).json({
                error: error.message,
                ...(error.details ? { details: error.details } : {}),
            });
            return;
        }
        if (error instanceof SyntaxError && "body" in error) {
            response.status(400).json({ error: "Request body contains invalid JSON." });
            return;
        }
        console.error("[api] Unhandled request error:", error);
        response.status(500).json({ error: "Internal server error." });
    };
    app.use(errorHandler);
    return app;
}
