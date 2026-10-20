import { useRef, useState } from "react";
import "../styles/App.css";
import {
  evaluateOffers,
  researchSuppliers,
  toApiBrief,
} from "./api.js";
import { amount } from "./format.js";
import SupplierPage from "./SupplierPage.jsx";

const BRIEFS_KEY = "vendormind_briefs";

const EMPTY_BRIEF = {
  id: null,
  product: "",
  quantity: 1000,
  budget: "",
  currency: "INR",
  location: "",
  deadline: "",
  specs: "",
  priorities: ["Total cost", "Lead time"],
};

const PRIORITIES = [
  "Total cost",
  "Lead time",
];

const LABELS = {
  dashboard: "Overview",
  brief: "Purchase brief",
  suppliers: "Suppliers",
  saved: "Saved briefs",
};

function readBriefs() {
  try {
    const value = JSON.parse(localStorage.getItem(BRIEFS_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
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
      "Review researched offers and their published evidence.",
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
            Find supplier offers, compare known terms and prepare your
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
            Tell us what you need. Review supplier leads, confirm
            their terms and compare known costs.
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
            Target budget ({brief.currency || "INR"})
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
            Currency
            <select
              value={brief.currency || "INR"}
              onChange={(event) => change("currency", event.target.value)}
            >
              <option value="INR">INR (₹)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </label>

          <label className="field">
            Delivery location
            <input
              value={brief.location}
              onChange={(event) =>
                change("location", event.target.value)
              }
              placeholder="e.g. New Delhi (India by default)"
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
  const [research, setResearch] = useState(null);
  const [evaluation, setEvaluation] = useState(null);
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
    setResearch(null);
    setEvaluation(null);

    try {
      const apiBrief = toApiBrief(value);
      const data = await researchSuppliers(apiBrief);
      if (id !== requestId.current) return;
      setResearch(data);
      if (data.offers.length > 0) {
        const result = await evaluateOffers(data);
        if (id === requestId.current) setEvaluation(result);
      }
    } catch (cause) {
      if (id === requestId.current) {
        setError(cause.message || "Supplier research failed.");
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
    setResearch(null);
    setEvaluation(null);
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
            key={research?.briefId || "empty"}
            brief={brief}
            research={research}
            evaluation={evaluation}
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
