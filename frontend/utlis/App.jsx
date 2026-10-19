import { useMemo, useRef, useState } from "react";
import "./styles/App.css";

const BRIEFS_KEY = "vendormind_briefs";

const EMPTY_BRIEF = {
  id: null,
  product: "",
  quantity: 1000,
  budget: "",
  location: "",
  deadline: "",
  specs: "",
  priorities: ["Total cost", "Lead time"],
};

const PRIORITIES = [
  "Total cost",
  "Quality",
  "Lead time",
  "Minimum order",
  "Payment terms",
];

const LABELS = {
  dashboard: "Overview",
  brief: "Purchase brief",
  suppliers: "Suppliers",
  saved: "Saved briefs",
};

const rupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const amount = (value) => rupees.format(value);

function readBriefs() {
  try {
    const value = JSON.parse(localStorage.getItem(BRIEFS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function sourceUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function supplierName(item) {
  if (item.site_name) return item.site_name;

  const url = sourceUrl(item.url);
  return url
    ? new URL(url).hostname.replace(/^www\./, "")
    : "Supplier lead";
}

function normalizeResults(data) {
  const results = Array.isArray(data?.results)
    ? data.results
    : data?.results?.results;

  if (!Array.isArray(results)) return [];

  const seen = new Set();

  return results.filter((item) => {
    if (!item || typeof item !== "object") return false;

    const key = item.url || `${item.site_name}-${item.title}`;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function evaluate(item, quote, brief) {
  const unit = Number(quote?.unitPrice);
  const shipping = Number(quote?.shipping);
  const quantity = Number(brief.quantity);

  const hasCosts =
    quote?.unitPrice != null &&
    quote?.shipping != null &&
    quote.unitPrice !== "" &&
    quote.shipping !== "" &&
    Number.isFinite(unit) &&
    Number.isFinite(shipping) &&
    unit >= 0 &&
    shipping >= 0;

  if (!hasCosts) {
    return { item, quote, status: "Awaiting quote", total: null };
  }

  const total = unit * quantity + shipping;

  if (
    quote.moq == null ||
    quote.moq === "" ||
    quote.leadDays == null ||
    quote.leadDays === ""
  ) {
    return {
      item,
      quote,
      total,
      status: "Terms pending",
      eligible: false,
    };
  }

  const moq = Number(quote.moq);

  const late =
    brief.deadline &&
    new Date().setHours(0, 0, 0, 0) +
      Number(quote.leadDays) * 86400000 >
      new Date(`${brief.deadline}T23:59:59`).getTime();

  const reason =
    quantity < moq
      ? "Below minimum order"
      : late
        ? "After deadline"
        : null;

  return {
    item,
    quote,
    total,
    status: reason || "Comparable",
    eligible: !reason,
  };
}

function Sidebar({
  page,
  setPage,
  onNew,
  savedCount,
  open,
  setOpen,
}) {
  const links = [
    ["dashboard", "▦", "Overview"],
    ["brief", "＋", "New purchase brief"],
    ["suppliers", "◫", "Compare suppliers"],
    ["saved", "▤", "Saved briefs"],
  ];

  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <button
        className="brand"
        onClick={() => {
          setPage("dashboard");
          setOpen(false);
        }}
      >
        <span className="brand-mark">V</span>
        vendor<span className="brand-light">mind</span>
      </button>

      <div className="side-label">WORKSPACE</div>

      <nav className="nav" aria-label="Main navigation">
        {links.map(([id, icon, label]) => (
          <button
            key={id}
            className={`nav-item ${page === id ? "active" : ""}`}
            onClick={() => {
              if (id === "brief") onNew();
              else setPage(id);
              setOpen(false);
            }}
          >
            <span aria-hidden="true">{icon}</span>
            {label}
            {id === "saved" && (
              <b className="nav-count">{savedCount}</b>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-bottom">
        <span className="status-dot" />
        Prototype workspace
      </div>
    </aside>
  );
}

function Dashboard({ onNew, savedCount }) {
  const steps = [
    [
      "01",
      "Define the need",
      "Enter the product, quantity, location and required terms.",
    ],
    [
      "02",
      "Find and verify",
      "Review website leads and enter quotes confirmed by suppliers.",
    ],
    [
      "03",
      "Compare and negotiate",
      "Check total costs, test a discount and copy a draft message.",
    ],
  ];

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PURCHASING INTELLIGENCE</div>
          <h1>
            Make every purchase <span>count.</span>
          </h1>
          <p className="muted">
            Find suppliers, compare confirmed quotes and prepare your
            negotiation.
          </p>
        </div>

        <button className="btn btn-dark" onClick={onNew}>
          ＋ Create purchase brief
        </button>
      </div>

      <div className="hero-panel">
        <div className="hero-copy">
          <span className="tag">YOUR DECISION DESK</span>
          <h2>Better decisions start with better comparisons.</h2>
          <p>
            Tell us what you need. Review supplier leads, collect
            quotes and compare the real cost.
          </p>
          <button className="btn btn-lime" onClick={onNew}>
            Start an evaluation ↗
          </button>
        </div>

        <div className="hero-mark" aria-hidden="true">
          VM<span>SUPPLIER RESEARCH</span>
        </div>
      </div>

      <div className="section-heading">
        <div>
          <div className="eyebrow">WORKFLOW</div>
          <h2>How VendorMind works</h2>
        </div>
        <span className="muted">
          {savedCount} saved brief{savedCount === 1 ? "" : "s"}
        </span>
      </div>

      <div className="steps-grid">
        {steps.map(([number, title, description]) => (
          <article className="step-card" key={number}>
            <span>{number}</span>
            <h3>{title}</h3>
            <p>{description}</p>
          </article>
        ))}
      </div>
    </>
  );
}

function BriefForm({ brief, setBrief, submit, busy }) {
  function change(key, value) {
    setBrief((previous) => ({ ...previous, [key]: value }));
  }

  function togglePriority(value) {
    change(
      "priorities",
      brief.priorities.includes(value)
        ? brief.priorities.filter((item) => item !== value)
        : [...brief.priorities, value],
    );
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">STEP 01 / REQUIREMENTS</div>
          <h1>Create a purchase brief</h1>
          <p className="muted">
            Describe the purchase so the supplier search starts with
            the right details.
          </p>
        </div>
      </div>

      <form className="panel form-panel" onSubmit={submit}>
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              PURCHASE REQUIREMENT
            </span>
            <h2>What are you buying?</h2>
          </div>
          <span className="muted">* Required</span>
        </div>

        <div className="form-grid">
          <label className="field field-wide">
            Product or material *
            <input
              required
              value={brief.product}
              onChange={(event) =>
                change("product", event.target.value)
              }
              placeholder="e.g. Recycled corrugated packaging boxes"
            />
          </label>

          <label className="field">
            Required quantity *
            <input
              required
              type="number"
              min="1"
              value={brief.quantity}
              onChange={(event) =>
                change("quantity", event.target.value)
              }
            />
          </label>

          <label className="field">
            Target budget (₹)
            <input
              type="number"
              min="0"
              value={brief.budget}
              onChange={(event) =>
                change("budget", event.target.value)
              }
              placeholder="Optional"
            />
          </label>

          <label className="field">
            Delivery location
            <input
              value={brief.location}
              onChange={(event) =>
                change("location", event.target.value)
              }
              placeholder="e.g. New Delhi"
            />
          </label>

          <label className="field">
            Required by
            <input
              type="date"
              value={brief.deadline}
              onChange={(event) =>
                change("deadline", event.target.value)
              }
            />
          </label>

          <label className="field field-wide">
            Must-have specifications
            <textarea
              rows="3"
              value={brief.specs}
              onChange={(event) =>
                change("specs", event.target.value)
              }
              placeholder="Dimensions, material, certifications…"
            />
          </label>

          <fieldset className="field field-wide">
            <legend>Evaluation priorities</legend>
            <div className="priority-options">
              {PRIORITIES.map((value) => (
                <label key={value}>
                  <input
                    type="checkbox"
                    checked={brief.priorities.includes(value)}
                    onChange={() => togglePriority(value)}
                  />
                  <span>{value}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <div className="form-footer">
          <span className="muted">Saved in this browser</span>
          <button
            className="btn btn-dark"
            disabled={busy}
            type="submit"
          >
            {busy ? "Searching…" : "Find suppliers →"}
          </button>
        </div>
      </form>
    </>
  );
}

function QuoteCard({ item, index, quote, onChange }) {
  const url = sourceUrl(item.url);

  function update(key, value) {
    onChange({ ...quote, [key]: value });
  }

  const fields = [
    ["unitPrice", "Unit price (₹)"],
    ["shipping", "Shipping (₹)"],
    ["moq", "Minimum order"],
    ["leadDays", "Lead time (days)"],
  ];

  return (
    <article className="live-result-card">
      <div className="live-result-top">
        <span className="live-result-number">
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="live-source">
          {supplierName(item)}
        </span>
      </div>

      <h3>{item.title || supplierName(item)}</h3>
      <p>
        {item.snippet ||
          "Visit the supplier page to review this lead."}
      </p>

      {item.date && (
        <span className="muted small">
          Page date: {item.date}
        </span>
      )}

      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open source ↗
        </a>
      )}

      <div className="quote-form">
        <strong>Enter the supplier's confirmed quote</strong>

        <div className="quote-grid">
          {fields.map(([key, label]) => (
            <label className="field" key={key}>
              {label}
              <input
                type="number"
                min="0"
                value={quote?.[key] ?? ""}
                placeholder="Unknown"
                onChange={(event) =>
                  update(key, event.target.value)
                }
              />
            </label>
          ))}
        </div>

        <small>
          Enter 0 shipping only when the supplier confirms it is free.
        </small>
      </div>
    </article>
  );
}

function SupplierPage({
  brief,
  results,
  quotes,
  setQuotes,
  busy,
  error,
  search,
  onEdit,
}) {
  const [selected, setSelected] = useState(0);
  const [quantity, setQuantity] = useState("");
  const [discount, setDiscount] = useState(5);
  const [tone, setTone] = useState("professional");
  const [draft, setDraft] = useState("");

  const qty =
    Number(quantity) > 0
      ? Number(quantity)
      : Number(brief.quantity) || 1;

  const rows = useMemo(
    () =>
      results.map((item, index) => ({
        ...evaluate(item, quotes[item.url || index] || {}, brief),
        index,
      })),
    [results, quotes, brief],
  );

  const comparable = rows
    .filter((row) => row.eligible)
    .sort((a, b) => a.total - b.total);

  const currentIndex =
    selected < results.length ? selected : 0;

  const chosen = rows[currentIndex];
  const chosenQuote = chosen?.quote;

  const hasPrice =
    chosenQuote?.unitPrice != null &&
    chosenQuote?.shipping != null &&
    chosenQuote.unitPrice !== "" &&
    chosenQuote.shipping !== "" &&
    Number.isFinite(Number(chosenQuote.unitPrice)) &&
    Number.isFinite(Number(chosenQuote.shipping)) &&
    Number(chosenQuote.unitPrice) >= 0 &&
    Number(chosenQuote.shipping) >= 0;

  const baseline = hasPrice
    ? Number(chosenQuote.unitPrice) * qty +
      Number(chosenQuote.shipping)
    : null;

  const scenario =
    baseline === null
      ? null
      : Number(chosenQuote.unitPrice) *
          (1 - discount / 100) *
          qty +
        Number(chosenQuote.shipping);

  function generateDraft() {
    if (!chosen) return;

    const greeting = tone === "friendly" ? "Hi" : "Hello";

    const request =
      tone === "direct"
        ? "Please send your best formal quotation"
        : "Could you please share your best current quotation";

    const lines = [
      `${greeting} ${supplierName(chosen.item)} team,`,
      `We are looking to purchase ${qty.toLocaleString("en-IN")} units of ${brief.product}.`,
      brief.specs &&
        `Required specifications: ${brief.specs}`,
      brief.location &&
        `Delivery location: ${brief.location}.`,
      brief.deadline &&
        `Required by: ${brief.deadline}.`,
      `${request}, including unit price, shipping, minimum order quantity, lead time and payment terms.`,
      hasPrice &&
        `We have noted a unit price of ${amount(Number(chosenQuote.unitPrice))}. Would a ${discount}% discount be possible at this volume?`,
      "Please confirm stock availability and whether you can meet these requirements.",
      "Regards,\nPurchasing Team",
    ].filter(Boolean);

    setDraft(lines.join("\n\n"));
  }

  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            STEP 02 / SUPPLIER RESEARCH
          </div>
          <h1>Compare suppliers</h1>
          <p className="muted">
            Website results are leads. Enter supplier-confirmed
            quotes to calculate totals.
          </p>
        </div>

        <div className="heading-actions">
          <button
            className="btn btn-outline"
            onClick={onEdit}
          >
            Edit brief
          </button>
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
        <div>
          <span>PRODUCT</span>
          <strong>
            {brief.product || "Create a brief first"}
          </strong>
        </div>
        <div>
          <span>QUANTITY</span>
          <strong>
            {Number(brief.quantity).toLocaleString("en-IN")} units
          </strong>
        </div>
        <div>
          <span>BUDGET</span>
          <strong>
            {brief.budget
              ? amount(Number(brief.budget))
              : "Not specified"}
          </strong>
        </div>
      </div>

      <div className="panel">
        <div className="panel-heading">
          <div>
            <span className="panel-kicker">
              TINYFISH WEB SEARCH
            </span>
            <h2>Supplier leads</h2>
          </div>
          <span className="muted">
            {results.length} result
            {results.length === 1 ? "" : "s"}
          </span>
        </div>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        {busy && (
          <p role="status">
            Searching supplier websites…
          </p>
        )}

        {!busy && !results.length && (
          <p className="muted">
            {brief.product
              ? "No results yet. Try searching again or broaden the product description."
              : "Submit a purchase brief to begin."}
          </p>
        )}

        <div className="live-results-grid">
          {results.map((item, index) => (
            <QuoteCard
              key={item.url || index}
              item={item}
              index={index}
              quote={quotes[item.url || index] || {}}
              onChange={(value) =>
                setQuotes((previous) => ({
                  ...previous,
                  [item.url || index]: value,
                }))
              }
            />
          ))}
        </div>
      </div>

      {results.length > 0 && (
        <>
          <div className="panel table-panel">
            <div className="panel-heading">
              <div>
                <span className="panel-kicker">
                  CONFIRMED QUOTES
                </span>
                <h2>Cost comparison</h2>
              </div>
            </div>

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Supplier</th>
                    <th>Unit price</th>
                    <th>Shipping</th>
                    <th>MOQ</th>
                    <th>Lead time</th>
                    <th>Total</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.item.url || row.index}
                    >
                      <td>
                        <strong>
                          {supplierName(row.item)}
                        </strong>
                      </td>
                      <td>
                        {row.quote?.unitPrice !== "" &&
                        row.quote?.unitPrice != null
                          ? amount(
                              Number(row.quote.unitPrice),
                            )
                          : "—"}
                      </td>
                      <td>
                        {row.quote?.shipping !== "" &&
                        row.quote?.shipping != null
                          ? amount(
                              Number(row.quote.shipping),
                            )
                          : "—"}
                      </td>
                      <td>{row.quote?.moq || "—"}</td>
                      <td>
                        {row.quote?.leadDays !== "" &&
                        row.quote?.leadDays != null
                          ? `${row.quote.leadDays} days`
                          : "—"}
                      </td>
                      <td>
                        {row.total === null
                          ? "—"
                          : amount(row.total)}
                      </td>
                      <td>
                        <span
                          className={`fit-pill ${
                            row.eligible
                              ? "fit-good"
                              : "fit-warn"
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="hint">
              Total = unit price × requested quantity +
              shipping. Taxes and other fees are not included.
            </p>
          </div>

          <div className="panel recommendation">
            <span className="panel-kicker">
              CURRENT RESULT
            </span>

            {comparable.length ? (
              <>
                <h2>
                  {supplierName(comparable[0].item)} has
                  the lowest known total
                </h2>
                <p>
                  {amount(comparable[0].total)} for{" "}
                  {Number(brief.quantity).toLocaleString(
                    "en-IN",
                  )}{" "}
                  units.
                  {brief.budget &&
                  comparable[0].total >
                    Number(brief.budget)
                    ? " This exceeds your target budget."
                    : ""}
                  {rows.some(
                    (row) =>
                      row.status === "Terms pending",
                  )
                    ? " Some suppliers still have unconfirmed terms."
                    : ""}
                </p>
              </>
            ) : (
              <>
                <h2>Enter quotes to compare</h2>
                <p>
                  Prices, shipping and mandatory terms
                  need confirmation before a
                  recommendation.
                </p>
              </>
            )}
          </div>

          <div className="panel">
            <span className="panel-kicker">
              WHAT-IF SCENARIO
            </span>
            <h2>Test a discount</h2>

            <div className="scenario-controls">
              <label className="field">
                Supplier
                <select
                  value={currentIndex}
                  onChange={(event) => {
                    setSelected(
                      Number(event.target.value),
                    );
                    setDraft("");
                  }}
                >
                  {results.map((item, index) => (
                    <option
                      value={index}
                      key={item.url || index}
                    >
                      {supplierName(item)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field">
                Quantity
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  placeholder={brief.quantity}
                  onChange={(event) =>
                    setQuantity(event.target.value)
                  }
                />
              </label>

              <label className="field">
                Requested discount: {discount}%
                <input
                  type="range"
                  min="0"
                  max="20"
                  value={discount}
                  onChange={(event) =>
                    setDiscount(
                      Number(event.target.value),
                    )
                  }
                />
              </label>
            </div>

            <div className="scenario-result">
              <div>
                Baseline
                <strong>
                  {baseline === null
                    ? "Need quote"
                    : amount(baseline)}
                </strong>
              </div>
              <div>
                With discount
                <strong>
                  {scenario === null
                    ? "Need quote"
                    : amount(scenario)}
                </strong>
              </div>
              <div>
                Potential difference
                <strong>
                  {scenario === null
                    ? "—"
                    : amount(baseline - scenario)}
                </strong>
              </div>
            </div>

            <p className="hint">
              This is a request to negotiate, not an
              agreed price.
            </p>
          </div>

          <div className="panel">
            <span className="panel-kicker">
              STEP 03 / NEGOTIATION
            </span>
            <h2>Prepare a message</h2>

            <div className="negotiation-actions">
              <label className="field">
                Tone
                <select
                  value={tone}
                  onChange={(event) =>
                    setTone(event.target.value)
                  }
                >
                  <option value="professional">
                    Professional
                  </option>
                  <option value="direct">Direct</option>
                  <option value="friendly">
                    Friendly
                  </option>
                </select>
              </label>

              <button
                className="btn btn-dark"
                onClick={generateDraft}
              >
                Generate draft
              </button>
            </div>

            <textarea
              className="draft"
              rows="9"
              value={draft}
              onChange={(event) =>
                setDraft(event.target.value)
              }
              placeholder="Generate a draft, then edit it here."
            />

            <div className="form-footer">
              <span className="muted">
                Review the message before sending it.
              </span>
              <button
                className="btn btn-outline"
                disabled={!draft.trim()}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      draft,
                    );
                  } catch {
                    window.alert(
                      "Copy failed. Select the text and copy it manually.",
                    );
                  }
                }}
              >
                Copy draft
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function SavedPage({
  briefs,
  openBrief,
  deleteBrief,
  newBrief,
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            YOUR WORKSPACE
          </div>
          <h1>Saved briefs</h1>
          <p className="muted">
            These briefs are stored in this browser.
          </p>
        </div>
        <button
          className="btn btn-dark"
          onClick={newBrief}
        >
          ＋ New brief
        </button>
      </div>

      {briefs.length ? (
        <div className="saved-list">
          {briefs.map((item) => (
            <article
              className="saved-item"
              key={item.id}
            >
              <div>
                <h3>{item.product}</h3>
                <p>
                  {Number(
                    item.quantity,
                  ).toLocaleString("en-IN")}{" "}
                  units ·{" "}
                  {item.budget
                    ? amount(Number(item.budget))
                    : "No budget"}{" "}
                  ·{" "}
                  {new Date(
                    item.createdAt,
                  ).toLocaleDateString("en-IN")}
                </p>
              </div>

              <div className="saved-actions">
                <button
                  onClick={() => openBrief(item)}
                >
                  Open
                </button>
                <button
                  onClick={() =>
                    deleteBrief(item.id)
                  }
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <h2>No saved briefs yet</h2>
          <p>
            Create a purchase brief to start.
          </p>
        </div>
      )}
    </>
  );
}

export default function App() {
  const [page, setPage] = useState("dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [briefs, setBriefs] = useState(readBriefs);
  const [brief, setBrief] = useState(EMPTY_BRIEF);
  const [results, setResults] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const requestId = useRef(0);

  function saveBriefs(next) {
    setBriefs(next);

    try {
      localStorage.setItem(
        BRIEFS_KEY,
        JSON.stringify(next),
      );
    } catch {
      setError(
        "Browser storage is unavailable. This brief will last only for this session.",
      );
    }
  }

  async function search(value = brief) {
    if (!value.product.trim()) return;

    const id = ++requestId.current;
    setBusy(true);
    setError("");
    setResults([]);
    setQuotes({});

    try {
      const response = await fetch(
        `${import.meta.env.VITE_API_URL || ""}/api/search-suppliers`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            product: value.product.trim(),
            quantity: Number(value.quantity),
            location: value.location || "India",
            specs: value.specs,
            priorities: value.priorities,
          }),
        },
      );

      const data = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error ||
            `Search failed (${response.status})`,
        );
      }

      if (id === requestId.current) {
        setResults(normalizeResults(data));
      }
    } catch (cause) {
      if (id === requestId.current) {
        setError(
          cause.message ||
            "Supplier search failed.",
        );
      }
    } finally {
      if (id === requestId.current) {
        setBusy(false);
      }
    }
  }

  function submit(event) {
    event.preventDefault();

    if (
      !brief.product.trim() ||
      Number(brief.quantity) < 1
    ) {
      return;
    }

    const next = {
      ...brief,
      product: brief.product.trim(),
      quantity: Number(brief.quantity),
      id: brief.id || crypto.randomUUID(),
      createdAt:
        brief.createdAt ||
        new Date().toISOString(),
    };

    setBrief(next);

    saveBriefs(
      [
        next,
        ...briefs.filter(
          (item) => item.id !== next.id,
        ),
      ].slice(0, 30),
    );

    setPage("suppliers");
    search(next);
  }

  function openBrief(item) {
    setBrief(item);
    setPage("suppliers");
    search(item);
  }

  function newBrief() {
    requestId.current++;
    setBusy(false);
    setBrief({
      ...EMPTY_BRIEF,
      priorities: [
        ...EMPTY_BRIEF.priorities,
      ],
    });
    setResults([]);
    setQuotes({});
    setError("");
    setPage("brief");
  }

  return (
    <div className="app-shell">
      <Sidebar
        page={page}
        setPage={setPage}
        onNew={newBrief}
        savedCount={briefs.length}
        open={menuOpen}
        setOpen={setMenuOpen}
      />

      <main className="main">
        <header className="topbar">
          <button
            className="mobile-menu"
            aria-label="Toggle navigation"
            onClick={() =>
              setMenuOpen(
                (value) => !value,
              )
            }
          >
            ☰
          </button>

          <div className="crumb">
            Workspace <span>/</span>
            <strong>{LABELS[page]}</strong>
          </div>

          <div className="top-actions">
            <span className="live-pill">
              PROTOTYPE
            </span>
            <span className="avatar">
              VM
            </span>
          </div>
        </header>

        {page === "dashboard" && (
          <Dashboard
            onNew={newBrief}
            savedCount={briefs.length}
          />
        )}

        {page === "brief" && (
          <BriefForm
            brief={brief}
            setBrief={setBrief}
            submit={submit}
            busy={busy}
          />
        )}

        {page === "suppliers" && (
          <SupplierPage
            brief={brief}
            results={results}
            quotes={quotes}
            setQuotes={setQuotes}
            busy={busy}
            error={error}
            search={() => search(brief)}
            onEdit={() =>
              setPage("brief")
            }
          />
        )}

        {page === "saved" && (
          <SavedPage
            briefs={briefs}
            openBrief={openBrief}
            newBrief={newBrief}
            deleteBrief={(id) =>
              saveBriefs(
                briefs.filter(
                  (item) =>
                    item.id !== id,
                ),
              )
            }
          />
        )}

        <footer className="footer">
          VENDORMIND · Smarter purchasing
          decisions
          <span>
            Confirm all terms with suppliers
          </span>
        </footer>
      </main>
    </div>
  );
}