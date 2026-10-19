import { useState } from "react";
import { negotiate, runScenario } from "./api.js";
import { amount, sourceUrl } from "./format.js";

function money(value, currency) {
  if (value === null || value === undefined) return "Unknown";
  return currency === "INR" ? amount(value) : `${currency || "?"} ${value}`;
}

function findRow(evaluation, offerId) {
  return [
    ...(evaluation?.ranked || []),
    ...(evaluation?.partial || []),
    ...(evaluation?.excluded || []),
  ].find((row) => row.offerId === offerId);
}

function OfferCard({ offer, index }) {
  const url = sourceUrl(offer.sourceUrl);
  const evidence = offer.provenance || {};
  const facts = [
    ["Unit price", money(offer.unitPrice, offer.currency), "unitPrice"],
    [
      "Shipping",
      offer.shippingCost === null
        ? "Unknown"
        : `${money(offer.shippingCost, offer.currency)}${
            offer.shippingUnit === "per_unit" ? " / unit" : ""
          }`,
      "shippingCost",
    ],
    ["Minimum order", offer.moq ?? "Unknown", "moq"],
    [
      "Lead time",
      offer.leadTimeDays === null ? "Unknown" : `${offer.leadTimeDays} days`,
      "leadTimeDays",
    ],
  ];

  return (
    <article className="live-result-card">
      <div className="live-result-top">
        <span className="live-result-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="live-source">{offer.supplierName}</span>
      </div>
      <h3>{offer.productTitle}</h3>
      <p>{offer.isFixture ? "Sample data for the demo" : "Published supplier information"}</p>
      <div className="offer-facts">
        {facts.map(([label, value, field]) => (
          <div key={field}>
            <span className="muted small">{label}</span>
            <strong>{value}</strong>
            <small>
              {offer.isFixture
                ? "Sample value"
                : evidence[field]?.status === "verified"
                  ? "Matched source text"
                  : evidence[field]?.status === "inferred"
                    ? "Unverified extraction"
                    : "Not published or verified"}
            </small>
          </div>
        ))}
      </div>
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer">
          Open source ↗
        </a>
      )}
      <p className="muted small">
        {offer.isFixture
          ? "This is not a real supplier quote."
          : `Retrieved ${new Date(offer.retrievedAt).toLocaleString()}. Confirm terms with the supplier before ordering.`}
      </p>
    </article>
  );
}

export default function SupplierPage({
  brief,
  research,
  evaluation,
  busy,
  error,
  search,
  onEdit,
}) {
  const [selectedId, setSelectedId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [discount, setDiscount] = useState(5);
  const [scenario, setScenario] = useState(null);
  const [scenarioBusy, setScenarioBusy] = useState(false);
  const [draft, setDraft] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [actionError, setActionError] = useState("");

  const offers = research?.offers || [];
  const chosenId = offers.some((offer) => offer.offerId === selectedId)
    ? selectedId
    : offers[0]?.offerId || "";
  const chosenOffer = offers.find((offer) => offer.offerId === chosenId);
  const requestedQuantity = quantity === "" ? Number(brief.quantity) : Number(quantity);
  const baselineRow = findRow(evaluation, chosenId);
  const scenarioRow = findRow(scenario?.evaluation, chosenId);
  const baseline = baselineRow?.cost.complete ? baselineRow.cost.totalKnown : null;
  const proposed = scenarioRow?.cost.complete ? scenarioRow.cost.totalKnown : null;
  const rows = [
    ...(evaluation?.ranked || []).map((row) => ({ row, status: "Ranked" })),
    ...(evaluation?.partial || []).map((row) => ({ row, status: "Partial" })),
    ...(evaluation?.excluded || []).map((row) => ({
      row,
      status: row.feasibility.status === "fail" ? "Excluded" : "Unverified",
    })),
  ];
  const winner = offers.find(
    (offer) => offer.offerId === evaluation?.recommendation,
  );

  async function calculateScenario() {
    if (!research || !chosenId) return;
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
      setActionError("Enter a positive whole number for quantity.");
      return;
    }
    setScenarioBusy(true);
    setActionError("");
    setScenario(null);
    try {
      const result = await runScenario(research, {
        quantity: requestedQuantity,
        selectedOfferId: chosenId,
        discountsByOffer: discount ? { [chosenId]: discount } : {},
      });
      setScenario(result);
    } catch (cause) {
      setActionError(cause.message || "Scenario could not be calculated.");
    } finally {
      setScenarioBusy(false);
    }
  }

  async function generateDraft() {
    if (!research || !chosenId) return;
    setDraftBusy(true);
    setActionError("");
    setDraft("");
    try {
      const result = await negotiate(research, chosenId);
      setDraft(result.draft);
      setDraftNote(
        [
          result.status === "insufficient_evidence"
            ? "The available facts are insufficient for a verified negotiation target."
            : "Draft prepared for your review.",
          result.note,
        ]
          .filter(Boolean)
          .join(" "),
      );
    } catch (cause) {
      setActionError(cause.message || "Draft could not be generated.");
    } finally {
      setDraftBusy(false);
    }
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">STEP 02 / SUPPLIER RESEARCH</div>
          <h1>Compare suppliers</h1>
          <p className="muted">
            Supplier terms are extracted from published pages. Confirm current
            prices and availability before buying.
          </p>
        </div>
        <div className="heading-actions">
          <button className="btn btn-outline" onClick={onEdit}>Edit brief</button>
          <button
            className="btn btn-lime"
            disabled={busy || !brief.product.trim()}
            onClick={search}
          >
            {busy ? "Searching…" : "↻ Search again"}
          </button>
        </div>
      </div>

      <div className="evaluation-context">
        <div><span>PRODUCT</span><strong>{brief.product || "Create a brief first"}</strong></div>
        <div>
          <span>QUANTITY</span>
          <strong>{Number(brief.quantity).toLocaleString("en-IN")} units</strong>
        </div>
        <div>
          <span>BUDGET</span>
          <strong>{brief.budget ? money(Number(brief.budget), brief.currency || "INR") : "Not specified"}</strong>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">TINYFISH RESEARCH</span>
            <h2>Supplier offers</h2>
          </div>
          <span className="muted">{offers.length} result{offers.length === 1 ? "" : "s"}</span>
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        {research && (
          <p className={research.source === "fixture" ? "alert" : "muted"}>
            {research.source === "fixture" ? "Sample data" : "Live research"}
            {research.note ? ` — ${research.note}` : ""}
          </p>
        )}
        {busy && <p role="status">Searching supplier websites…</p>}
        {!busy && !offers.length && (
          <p className="muted">
            {brief.product
              ? "No offers yet. Try another supported product description."
              : "Submit a purchase brief to begin."}
          </p>
        )}
        <div className="live-results-grid">
          {offers.map((offer, index) => (
            <OfferCard offer={offer} index={index} key={offer.offerId} />
          ))}
        </div>
      </div>

      {offers.length > 0 && (
        <>
          <div className="panel table-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">BACKEND EVALUATION</span>
                <h2>Cost comparison</h2>
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Supplier</th><th>Unit price</th><th>Shipping</th>
                    <th>MOQ</th><th>Lead time</th><th>Known total</th><th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ row, status }) => {
                    const offer = offers.find((candidate) => candidate.offerId === row.offerId);
                    return (
                      <tr key={row.offerId}>
                        <td><strong>{row.supplierName}</strong></td>
                        <td>{money(offer?.unitPrice, offer?.currency)}</td>
                        <td>{money(row.cost.shippingCost, row.cost.currency)}</td>
                        <td>{offer?.moq ?? "Unknown"}</td>
                        <td>{offer?.leadTimeDays == null ? "Unknown" : `${offer.leadTimeDays} days`}</td>
                        <td>
                          {row.cost.totalKnown === null
                            ? "Unknown"
                            : `${row.cost.complete ? "" : "Partial: "}${money(row.cost.totalKnown, row.cost.currency)}`}
                        </td>
                        <td>
                          <span className={`fit-pill ${status === "Ranked" ? "fit-good" : "fit-warn"}`}>
                            {status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="hint">
              Known total includes listed shipping, known fees and applicable discounts.
              Partial costs are not complete quotes. Offers with unknown or failed
              requirements cannot be confidently ranked.
            </p>
          </div>

          <div className="panel recommendation">
            <span className="panel-kicker">CURRENT RESULT</span>
            {winner ? (
              <>
                <h2>{winner.supplierName} is the leading evidenced offer</h2>
                <p>
                  {money(evaluation.ranked.find((row) => row.offerId === winner.offerId)?.cost.totalKnown, evaluation.currency)} for{" "}
                  {Number(brief.quantity).toLocaleString("en-IN")} units.
                  {brief.budget && evaluation.ranked.find((row) => row.offerId === winner.offerId)?.cost.totalKnown > Number(brief.budget)
                    ? " This exceeds your target budget."
                    : ""}
                  {evaluation.partial.length || evaluation.excluded.length
                    ? " Other offers have incomplete or failing terms."
                    : ""}
                </p>
              </>
            ) : (
              <>
                <h2>No confident recommendation yet</h2>
                <p>
                  Check the missing fields and ask suppliers to confirm the terms
                  before treating any offer as the winner.
                </p>
              </>
            )}
          </div>

          <div className="panel">
            <span className="panel-kicker">WHAT-IF SCENARIO</span>
            <h2>Test quantity and discount</h2>
            <div className="scenario-controls">
              <label className="field">
                Supplier
                <select
                  value={chosenId}
                  onChange={(event) => {
                    setSelectedId(event.target.value);
                    setScenario(null);
                    setDraft("");
                  }}
                >
                  {offers.map((offer) => (
                    <option key={offer.offerId} value={offer.offerId}>
                      {offer.supplierName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                Quantity
                <input
                  type="number" min="1" value={quantity}
                  placeholder={brief.quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                    setScenario(null);
                  }}
                />
              </label>
              <label className="field">
                Hypothetical discount: {discount}%
                <input
                  type="range" min="0" max="20" value={discount}
                  onChange={(event) => {
                    setDiscount(Number(event.target.value));
                    setScenario(null);
                  }}
                />
              </label>
            </div>
            <button
              className="btn btn-dark" disabled={scenarioBusy}
              onClick={calculateScenario}
            >
              {scenarioBusy ? "Calculating…" : "Run scenario"}
            </button>
            {scenario && (
              <div className="scenario-result">
                <div>Original known total<strong>{baseline === null ? "Incomplete" : money(baseline, baselineRow?.cost.currency)}</strong></div>
                <div>Scenario known total<strong>{proposed === null ? "Incomplete" : money(proposed, scenarioRow?.cost.currency)}</strong></div>
                <div>
                  Difference from baseline
                  <strong>{baseline === null || proposed === null ? "Unknown" : money(baseline - proposed, baselineRow?.cost.currency)}</strong>
                </div>
              </div>
            )}
            <p className="hint">
              The scenario uses the backend evaluator. A requested discount is
              hypothetical, not a supplier commitment; figures may be incomplete.
            </p>
          </div>

          <div className="panel">
            <span className="panel-kicker">STEP 03 / NEGOTIATION</span>
            <h2>Prepare a message for {chosenOffer?.supplierName}</h2>
            <div className="negotiation-actions">
              <button
                className="btn btn-dark" disabled={draftBusy}
                onClick={generateDraft}
              >
                {draftBusy ? "Preparing…" : "Generate draft"}
              </button>
            </div>
            {draftNote && <p className="hint">{draftNote}</p>}
            <textarea
              className="draft" rows="9" value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Generate a draft, then review and edit it here."
            />
            <div className="form-footer">
              <span className="muted">Nothing is sent to suppliers automatically.</span>
              <button
                className="btn btn-outline" disabled={!draft.trim()}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(draft);
                  } catch {
                    window.alert("Copy failed. Select the text and copy it manually.");
                  }
                }}
              >
                Copy draft
              </button>
            </div>
          </div>
          {actionError && <p className="alert" role="alert">{actionError}</p>}
        </>
      )}
    </>
  );
}
