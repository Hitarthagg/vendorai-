import React, { useState, useMemo } from "react";
import "./styles/App.css";

/* ---- Currency formatting ---- */
let SYM = "$";
const loc = () => (SYM === "₹" ? "en-IN" : "en-US");
const usd = (n) => (n == null ? "—" : SYM + Math.round(n).toLocaleString(loc()));
const usd2 = (n) =>
  SYM +
  n.toLocaleString(loc(), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/* ---- Brief + offers ---- */
const BLANK = {
  request: "",
  product: "",
  qty: 1,
  budget: 0,
  cur: "$",
  dl: 30,
  pr: "cost",
  mustText: "",
};
const musts = (b) =>
  (b.mustText || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
let NEXT = 100;
const newOffer = (x) =>
  Object.assign(
    {
      id: ++NEXT,
      name: "",
      price: null,
      moq: 1,
      lead: null,
      shipType: "flat",
      shipAmt: null,
      fees: 0,
      tierQty: null,
      tierPct: null,
      specs: {},
      url: "",
    },
    x,
  );
const norm = (o) =>
  Object.assign({}, o, {
    name: o.name || "Supplier " + (o.id % 100),
  });

/* =====================================================================
   SUPPLIER DATA SOURCE  (this is the only place that needs to change
   when real-time data is connected)
   ---------------------------------------------------------------------
   Set DATA_SOURCE.liveUrl to an endpoint that accepts POST JSON:
     { product, quantity, budget, currency, deadline_days, must_haves[] }
   and returns JSON: { offers: [ ...offer objects... ] } where each offer is
     { supplier, product, unit_price, shipping | shipping_per_unit, fees,
       moq, lead_time_days, tier_qty, tier_pct, specs{must-have:true|false|null},
       certifications[], source_url, retrieved_at }
   Missing fields are treated as unknown, never as a pass.
   If liveUrl is null (or the call fails) the static demo catalogue below is used.
   ===================================================================== */
const DATA_SOURCE = {
  liveUrl: null,
};
const RATE = {
  $: 1,
  "€": 0.92,
  "£": 0.79,
  "₹": 83,
};
const SUPPLIER_NAMES = [
  "Meridian Wholesale",
  "Kestrel Trading Co",
  "Bluepeak Supplies",
  "Anand & Rao Traders",
  "Harbor Lane Direct",
];
/* Five trade-off profiles: m = price multiplier, s = shipping as a share of a typical order's value (null = not listed),
   q = minimum order as a share of the typical order, l = lead time (days), f = fee share, t = [volume-discount qty share, %] */
const PROFILES = [
  {
    m: 0.93,
    s: 0.06,
    q: 1.5,
    l: 21,
    f: 0,
    t: [2, 6],
  },
  {
    m: 1.0,
    s: 0.02,
    q: 0.5,
    l: 10,
    f: 0,
    t: null,
  },
  {
    m: 1.08,
    s: 0.0,
    q: 0.25,
    l: 5,
    f: 0,
    t: null,
  },
  {
    m: 0.88,
    s: null,
    q: 2.5,
    l: 28,
    f: 0,
    t: null,
  },
  {
    m: 0.96,
    s: 0.04,
    q: 1.0,
    l: 14,
    f: 0.01,
    t: [1.5, 4],
  },
];
/* p = typical unit price in USD, rq = typical order quantity, l = lead-time adjustment */
const CATS = [
  {
    id: "bottles",
    k: ["bottle", "flask", "tumbler"],
    p: 3.2,
    rq: 500,
    l: 0,
  },
  {
    id: "laptops",
    k: ["laptop", "notebook computer", "macbook"],
    p: 650,
    rq: 20,
    l: 2,
  },
  {
    id: "chairs",
    k: ["chair", "stool"],
    p: 120,
    rq: 40,
    l: 3,
  },
  {
    id: "fabric",
    k: ["fabric", "cotton", "textile", "cloth", "yarn"],
    p: 4,
    rq: 1000,
    l: 4,
  },
  {
    id: "apparel",
    k: ["t-shirt", "tshirt", "shirt", "uniform", "hoodie", "apparel"],
    p: 4.5,
    rq: 500,
    l: 3,
  },
  {
    id: "packaging",
    k: ["box", "carton", "packaging", "packing", "pouch"],
    p: 0.6,
    rq: 2000,
    l: 0,
  },
  {
    id: "lighting",
    k: ["led", "bulb", "light", "lamp"],
    p: 1.8,
    rq: 300,
    l: 1,
  },
  {
    id: "paper",
    k: ["paper", "notebook", "stationery", "pen", "ream"],
    p: 4,
    rq: 200,
    l: 0,
  },
  {
    id: "desks",
    k: ["desk", "table"],
    p: 140,
    rq: 25,
    l: 3,
  },
  {
    id: "phones",
    k: ["phone", "mobile", "smartphone", "tablet"],
    p: 220,
    rq: 30,
    l: 3,
  },
];
const hashStr = (s) => {
  let x = 7;
  for (let i = 0; i < s.length; i++) x = (x * 31 + s.charCodeAt(i)) >>> 0;
  return x;
};
function staticOffers(b) {
  const R = RATE[b.cur] || 1,
    t = (b.product || "").toLowerCase();
  const cat = CATS.find((c) => c.k.some((k) => t.indexOf(k) >= 0));
  const p = cat ? cat.p * R : b.budget > 0 && b.qty > 0 ? b.budget / b.qty / 1.05 : 20 * R;
  const rq = cat ? cat.rq : Math.max(1, b.qty),
    adj = cat ? cat.l : 0,
    slug = cat ? cat.id : "general",
    M = musts(b);
  const r2 = (n) => (p < 10 ? Math.round(n * 100) / 100 : Math.round(n));
  return PROFILES.map((f, i) => {
    const specs = {};
    M.forEach((m) => {
      const v = (hashStr(m.toLowerCase()) + i * 3) % 9;
      specs[m] = v === 0 ? false : v === 1 ? null : true;
    });
    const base = rq * p,
      ship = f.s == null ? null : Math.round(base * f.s);
    return {
      id: ++NEXT,
      name: SUPPLIER_NAMES[i],
      product: b.product,
      price: r2(p * f.m),
      shipType: ship == null ? "none" : "flat",
      shipAmt: ship,
      fees: Math.round(base * f.f),
      moq: Math.max(1, cat ? Math.round(rq * f.q) : Math.round(b.qty * Math.min(f.q, 0.8))),
      lead: f.l + adj,
      tierQty: f.t ? Math.round(rq * f.t[0]) : null,
      tierPct: f.t ? f.t[1] : null,
      specs: specs,
      url: "https://example.com/" + slug + "/supplier-" + (i + 1),
      static: true,
    };
  });
}
const pick = (x, ...k) => {
  for (const a of k) if (x[a] != null) return x[a];
  return null;
};
function normalizeOffer(x, b) {
  const per = pick(x, "shipping_per_unit"),
    flat = pick(x, "shipping", "shipping_cost"),
    lead = pick(x, "lead_time_days", "lead");
  return {
    id: ++NEXT,
    name: String(pick(x, "supplier", "name") || "Supplier"),
    product: pick(x, "product") || b.product,
    price: +pick(x, "unit_price", "price") || null,
    shipType: per != null ? "unit" : flat != null ? "flat" : "none",
    shipAmt: per != null ? +per : flat != null ? +flat : null,
    fees: +pick(x, "fees", "other_fees") || 0,
    moq: +pick(x, "moq", "min_order_qty") || 1,
    lead: lead == null ? null : +lead,
    tierQty: pick(x, "tier_qty"),
    tierPct: pick(x, "tier_pct"),
    specs: x.specs || {},
    claims: x.certifications || x.claims || null,
    url: pick(x, "source_url", "url") || "",
    got: pick(x, "retrieved_at") || "",
    live: true,
  };
}
async function fetchOffers(b) {
  if (DATA_SOURCE.liveUrl) {
    try {
      const r = await fetch(DATA_SOURCE.liveUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          product: b.product,
          quantity: b.qty,
          budget: b.budget,
          currency: b.cur,
          deadline_days: b.dl,
          must_haves: musts(b),
        }),
      });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      return {
        offers: (j.offers || []).map((x) => normalizeOffer(x, b)),
        note: "",
      };
    } catch (e) {
      return {
        offers: staticOffers(b),
        note: "The live data feed couldn't be reached, so static demo data is shown instead.",
      };
    }
  }
  return {
    offers: staticOffers(b),
    note: "",
  };
}
const claimHit = (claims, m) => {
  const k = m.toLowerCase();
  return claims.some((c) => {
    c = String(c).toLowerCase();
    return c.length > 2 && (c.indexOf(k) >= 0 || k.indexOf(c) >= 0);
  });
};
const specOf = (o, m) =>
  o.specs && m in o.specs ? o.specs[m] : o.claims && claimHit(o.claims, m) ? true : null;
function chairDemo() {
  const M = ["Lumbar support", "Load rating 120 kg or more"];
  const mk = (id, name, price, tier, ship, fees, moq, lead, load, url, got, fs) => ({
    id,
    name,
    price,
    tierQty: tier ? tier[0] : null,
    tierPct: tier ? tier[1] : null,
    shipType: ship.flat != null ? "flat" : ship.unit != null ? "unit" : "none",
    shipAmt: ship.flat != null ? ship.flat : ship.unit != null ? ship.unit : null,
    fees,
    moq,
    lead,
    specs: {
      [M[0]]: true,
      [M[1]]: load >= 120,
    },
    url,
    got,
    fs,
    demo: true,
  });
  return {
    brief: {
      request:
        "40 ergonomic office chairs with lumbar support, rated for 120 kg, within 3 weeks, budget $9,000",
      product: "Ergonomic office chairs",
      qty: 40,
      budget: 9000,
      cur: "$",
      dl: 21,
      pr: "cost",
      mustText: M.join(", "),
    },
    offers: [
      mk(
        1,
        "Halden Office Supply",
        142,
        [50, 6],
        {
          flat: 480,
        },
        0,
        10,
        14,
        150,
        "https://example.com/halden/ergo-chair-m2",
        "2026-10-12",
        {
          price: "v",
          ship: "v",
          moq: "v",
          lead: "i",
          spec: "v",
        },
      ),
      mk(
        2,
        "Brightline Wholesale",
        128,
        null,
        {
          unit: 9,
        },
        90,
        25,
        28,
        130,
        "https://example.com/brightline/bulk-seating",
        "2026-10-11",
        {
          price: "v",
          ship: "i",
          moq: "v",
          lead: "v",
          spec: "v",
        },
      ),
      mk(
        3,
        "Corvane Furniture Direct",
        135,
        [100, 8],
        {
          flat: 620,
        },
        0,
        20,
        10,
        120,
        "https://example.com/corvane/c-series",
        "2026-10-12",
        {
          price: "v",
          ship: "v",
          moq: "v",
          lead: "v",
          spec: "v",
        },
      ),
      mk(
        4,
        "Tessmer & Co",
        119,
        null,
        {
          flat: 540,
        },
        0,
        50,
        18,
        140,
        "https://example.com/tessmer/trade-chairs",
        "2026-09-20",
        {
          price: "s",
          ship: "s",
          moq: "v",
          lead: "i",
          spec: "v",
        },
      ),
      mk(
        5,
        "Norrow Seating",
        124,
        null,
        {},
        0,
        10,
        16,
        110,
        "https://example.com/norrow/task-chair",
        "2026-10-10",
        {
          price: "v",
          ship: "u",
          moq: "v",
          lead: "i",
          spec: "v",
        },
      ),
    ],
  };
}

/* ---- Deterministic decision engine ---- */
function cost(o, p) {
  const tier = o.tierQty && o.tierPct && p.qty >= o.tierQty ? o.tierPct : 0;
  const disc = (p.disc && p.disc[o.id]) || 0;
  const unit = (o.price || 0) * (1 - tier / 100) * (1 - disc / 100);
  const ov = p.ship ? p.ship[o.id] : undefined;
  const base =
    o.shipType === "flat"
      ? o.shipAmt
      : o.shipType === "unit" && o.shipAmt != null
        ? o.shipAmt * p.qty
        : null;
  const ship = ov != null ? ov : base;
  return {
    unit,
    tier,
    ship,
    total: unit * p.qty + (ship || 0) + (o.fees || 0),
    partial: ship == null,
  };
}
function issues(o, p) {
  const r = [];
  if (o.price == null) r.push("No price given");
  if (o.moq && p.qty < o.moq) r.push("Minimum order " + o.moq + " is above your quantity");
  if (o.lead == null) r.push("Delivery time not given");
  else if (o.lead > p.dl) r.push("Delivers in " + o.lead + " days, you need " + p.dl);
  musts(p).forEach((m) => {
    const v = specOf(o, m);
    if (v === false) r.push("Doesn't meet: " + m);
    else if (v == null) r.push("Not confirmed: " + m);
  });
  return r;
}
function evaluate(offers, p) {
  const rows = offers.map((o) => ({
    o,
    c: cost(o, p),
    bad: issues(o, p),
  }));
  const ok = rows.filter((r) => !r.bad.length);
  if (ok.length) {
    const c = ok.map((r) => r.c.total),
      l = ok.map((r) => r.o.lead);
    const c0 = Math.min.apply(null, c),
      c1 = Math.max.apply(null, c),
      l0 = Math.min.apply(null, l),
      l1 = Math.max.apply(null, l);
    const nz = (x, a, b) => (b === a ? 0 : (x - a) / (b - a));
    ok.forEach((r) => {
      r.score =
        p.pr === "speed"
          ? r.o.lead + r.c.total / 1e9
          : p.pr === "balanced"
            ? 0.5 * nz(r.c.total, c0, c1) + 0.5 * nz(r.o.lead, l0, l1)
            : r.c.total;
    });
    ok.sort((a, b) => a.score - b.score);
  }
  return {
    rows,
    ranked: ok,
    out: rows.filter((r) => r.bad.length),
  };
}
function breakEven(a, b, p) {
  let prev = null;
  const top = Math.max(400, p.qty * 5);
  for (let q = 1; q <= top; q++) {
    if ((a.moq && q < a.moq) || (b.moq && q < b.moq)) continue;
    const pp = Object.assign({}, p, {
      qty: q,
    });
    const d = cost(a, pp).total - cost(b, pp).total;
    if (prev !== null && d !== 0 && Math.sign(d) !== Math.sign(prev))
      return {
        q,
        cheaper: d < 0 ? a : b,
        before: prev < 0 ? a : b,
      };
    if (d !== 0) prev = d;
  }
  return null;
}
function explain(offers, p0, p1) {
  const e0 = evaluate(offers, p0),
    e1 = evaluate(offers, p1),
    w0 = e0.ranked[0],
    w1 = e1.ranked[0],
    ch = [];
  if (p1.qty !== p0.qty) ch.push("quantity " + p0.qty + " → " + p1.qty);
  if (p1.dl !== p0.dl) ch.push("deadline " + p0.dl + " → " + p1.dl + " days");
  if (p1.pr !== p0.pr) ch.push("priority set to " + p1.pr);
  if (Object.keys(p1.disc).some((k) => p1.disc[k])) ch.push("a negotiated discount");
  if (Object.keys(p1.ship).length) ch.push("a shipping override");
  if (!w1)
    return "No offer meets every mandatory requirement under these conditions, so no recommendation is made.";
  if (!ch.length)
    return (
      "Nothing changed yet. " +
      w1.o.name +
      " leads at " +
      usd(w1.c.total) +
      ". Try one of the quick scenarios above."
    );
  if (w0 && w0.o.id === w1.o.id)
    return (
      "With " +
      ch.join(", ") +
      ", " +
      w1.o.name +
      " stays first (" +
      usd(w0.c.total) +
      " → " +
      usd(w1.c.total) +
      ")."
    );
  let why = "";
  if (w0) {
    const prev = e1.rows.find((r) => r.o.id === w0.o.id);
    why = prev.bad.length
      ? w0.o.name + " no longer qualifies: " + prev.bad[0].toLowerCase() + "."
      : w0.o.name + " is now " + usd(prev.c.total - w1.c.total) + " more expensive.";
  }
  return (
    "With " +
    ch.join(", ") +
    ", the best option changes to " +
    w1.o.name +
    (w0 ? " (was " + w0.o.name + ")" : "") +
    ". " +
    why
  );
}

/* ---- Evidence labels ---- */
const STATUS = {
  v: ["v", "Verified"],
  e: ["e", "Your quote"],
  i: ["i", "Inferred"],
  u: ["u", "Unknown"],
  s: ["s", "Stale"],
  d: ["i", "Demo data"],
};
const Chip = (k) => <span className={"chip " + STATUS[k][0]}>{STATUS[k][1]}</span>;
function fsOf(o) {
  if (o.fs) return o.fs;
  if (o.static)
    return {
      price: "d",
      ship: o.shipType === "none" ? "u" : "d",
      moq: "d",
      lead: "d",
      spec: "d",
    };
  if (o.live)
    return {
      price: "v",
      ship: o.shipType === "none" ? "u" : "v",
      moq: "v",
      lead: o.lead == null ? "u" : "v",
      spec: "v",
    };
  if (o.sample)
    return {
      price: "i",
      ship: o.shipType === "none" ? "u" : "i",
      moq: "i",
      lead: "i",
      spec: "i",
    };
  return {
    price: o.price != null ? "e" : "u",
    ship: o.shipType !== "none" && o.shipAmt != null ? "e" : "u",
    moq: "e",
    lead: o.lead != null ? "e" : "u",
    spec: "e",
  };
}
const worst = (o) => {
  const fs = fsOf(o);
  return ["u", "s", "i", "d", "e", "v"].find((k) => Object.keys(fs).some((f) => fs[f] === k));
};
const field = (label, control, hint) => (
  <div className="f">
    <label>{label}</label>
    {control}
    {hint ? <div className="hint">{hint}</div> : null}
  </div>
);
const opts = (offs) =>
  offs.map((o) => (
    <option key={o.id} value={o.id}>
      {o.name}
    </option>
  ));
const prOpts = () => [
  <option key={"c"} value={"cost"}>
    {"Lowest total cost"}
  </option>,
  <option key={"s"} value={"speed"}>
    {"Fastest delivery"}
  </option>,
  <option key={"b"} value={"balanced"}>
    {"Balance of price and speed"}
  </option>,
];

/* ---- Guided flow ---- */
const STEPS = [
  ["new", "Describe your purchase"],
  ["suppliers", "Review suppliers"],
  ["compare", "Compare suppliers"],
  ["sandbox", "Test scenarios"],
  ["nego", "Negotiate"],
  ["ledger", "Record savings"],
];
const Head = (k, title, sub) => (
  <div>
    <div className="step">
      {"Step " + (STEPS.findIndex((s) => s[0] === k) + 1) + " of " + STEPS.length}
    </div>
    <h1>{title}</h1>
    <p className="sub">{sub}</p>
  </div>
);
const Foot = (go, prev, next, nextLabel, disabled) => (
  <div className="foot">
    {prev ? (
      <button className="btn ghost" onClick={() => go(prev)}>
        {"← Back"}
      </button>
    ) : (
      <span />
    )}
    {next ? (
      <button className="btn" disabled={!!disabled} onClick={() => go(next)}>
        {nextLabel + " →"}
      </button>
    ) : (
      <span />
    )}
  </div>
);
const Empty = (title, text, label, onClick) => (
  <div className="card empty">
    <h2>{title}</h2>
    <p>{text}</p>
    <button className="btn" onClick={onClick}>
      {label}
    </button>
  </div>
);

/* ---- AI helpers (Claude via the page's sample capability) ---- */
async function askJson(prompt) {
  if (!window.claude || !window.claude.use)
    throw {
      code: "none",
    };
  const s = await window.claude.use("sample");
  if (!s)
    throw {
      code: "none",
    };
  return await s.json(prompt);
}
const aiError = (e) =>
  e && (e.code === "not_granted" || e.code === "none")
    ? "AI help isn't available here, so please fill in the details yourself."
    : "That didn't work this time. Please try again, or fill in the details yourself.";

/* ---- Ranking table ---- */
function Ranking(props) {
  const ev = props.ev,
    p = props.p,
    w = ev.ranked[0],
    w2 = ev.ranked[1];
  const head = (
    <tr>
      <th>{"Rank"}</th>
      <th>{"Supplier"}</th>
      <th className="n">{"Unit price"}</th>
      <th className="n">{"Shipping"}</th>
      <th className="n">{"Delivery"}</th>
      <th className="n">{"Min. order"}</th>
      <th className="n">{"Total cost"}</th>
      <th>{"Data quality"}</th>
    </tr>
  );
  const ranked = ev.ranked.map((r, i) => (
    <tr className={i === 0 ? "win" : ""} key={r.o.id}>
      <td>{i === 0 ? "★ 1" : i + 1}</td>
      <td>
        <b>{r.o.name}</b>
        {r.o.static ? (
          <div className="note">{"Static demo data"}</div>
        ) : r.o.sample ? (
          <div className="note">{"AI sample"}</div>
        ) : null}
      </td>
      <td className="n">{usd2(r.c.unit)}</td>
      <td className="n">{r.c.ship == null ? "unknown" : usd(r.c.ship)}</td>
      <td className="n">{r.o.lead + " days"}</td>
      <td className="n">{r.o.moq || "—"}</td>
      <td className="n">
        <b>{usd(r.c.total)}</b>
        {r.c.partial ? " (partial)" : ""}
        {p.budget > 0 && r.c.total > p.budget ? (
          <div className="bad note">{"over budget"}</div>
        ) : null}
      </td>
      <td>{Chip(worst(r.o))}</td>
    </tr>
  ));
  const out = ev.out.map((r) => (
    <tr className="out" key={r.o.id}>
      <td>{"✕"}</td>
      <td>{r.o.name}</td>
      <td className="n">{r.o.price == null ? "—" : usd2(r.c.unit)}</td>
      <td className="n">{r.c.ship == null ? "unknown" : usd(r.c.ship)}</td>
      <td className="n">{r.o.lead == null ? "—" : r.o.lead + " days"}</td>
      <td className="n">{r.o.moq || "—"}</td>
      <td className="n">
        {r.o.price == null ? "—" : usd(r.c.total) + (r.c.partial ? " (partial)" : "")}
      </td>
      <td className="bad">{"Excluded: " + r.bad.join("; ")}</td>
    </tr>
  ));
  const unc = w
    ? Object.keys(fsOf(w.o))
        .filter((k) => fsOf(w.o)[k] !== "v" && fsOf(w.o)[k] !== "e")
        .map((k) => k + " (" + STATUS[fsOf(w.o)[k]][1].toLowerCase() + ")")
        .join(", ") || "none"
    : "";
  const why = w ? (
    <div className="why">
      <h3>{"Why " + w.o.name + "?"}</h3>
      <p className="layout-01">
        {"It has the lowest total cost among " +
          ev.ranked.length +
          " supplier" +
          (ev.ranked.length > 1 ? "s" : "") +
          " that meet your requirements" +
          (w2 ? ", " + usd(w2.c.total - w.c.total) + " below " + w2.o.name : "") +
          "."}
      </p>
      <p className={"note" + " layout-02"}>
        {"Still uncertain: " + unc + ". Taxes and duties are not included."}
      </p>
    </div>
  ) : (
    <div className="why">
      <h3>{"Not enough evidence"}</h3>
      <p className="note">
        {
          "No supplier meets every requirement, so we don't recommend one. Check the reasons listed above."
        }
      </p>
    </div>
  );
  return (
    <div className="card">
      <div className="scroll">
        <table>
          <thead>{head}</thead>
          <tbody>
            {ranked}
            {out}
          </tbody>
        </table>
      </div>
      {why}
    </div>
  );
}

/* ---- Pages ---- */
function Home(props) {
  const L = Object.keys(props.led).map((k) => props.led[k]),
    b = props.brief,
    n = props.offers.length;
  const pot = L.reduce((s, l) => s + (l.potential || 0), 0),
    real = L.reduce((s, l) => s + (l.realized || 0), 0);
  const kpi = (l, v) => (
    <div className="card kpi">
      <span>{l}</span>
      <b>{v}</b>
    </div>
  );
  return (
    <div>
      <h1>{"Welcome back, " + props.user.name.split(" ")[0]}</h1>
      <p className="sub">
        {
          "Describe anything you need to buy. VendorMind compares suppliers on total cost, tests what-if scenarios and prepares your negotiation."
        }
      </p>
      <div className={"card hero" + " layout-04"}>
        <div>
          <h2>{"Start a new purchase"}</h2>
          <p className={"note" + " layout-03"}>{"Type what you need, in your own words."}</p>
        </div>
        <button className="btn" onClick={() => props.go("new")}>
          {"Start →"}
        </button>
      </div>
      <div className={"grid g3" + " layout-04"}>
        {kpi("Active purchases", b.product ? "1" : "0")}
        {kpi("Potential savings (estimated)", usd(pot))}
        {kpi("Realized savings (confirmed)", usd(real))}
      </div>
      <div className="card">
        <h2 className="layout-05">{"Your purchases"}</h2>
        {b.product ? (
          <table>
            <thead>
              <tr>
                <th>{"Purchase"}</th>
                <th className="n">{"Qty"}</th>
                <th>{"Status"}</th>
                <th>{""}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <b>{b.product}</b>
                </td>
                <td className="n">{b.qty}</td>
                <td>{n ? n + " supplier" + (n > 1 ? "s" : "") + " added" : "No suppliers yet"}</td>
                <td className="n">
                  <button
                    className="btn ghost sm"
                    onClick={() => props.go(n ? "compare" : "suppliers")}
                  >
                    {"Open"}
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className={"note" + " layout-02"}>
            {"Nothing here yet. Start your first purchase above."}
          </p>
        )}
      </div>
    </div>
  );
}
function NewPurchase(props) {
  const brief = props.brief,
    set = (k, v) =>
      props.setBrief(
        Object.assign({}, brief, {
          [k]: v,
        }),
      );
  const [busy, setBusy] = useState(false),
    [msg, setMsg] = useState("");
  const examples = [
    "200 stainless steel water bottles, 750 ml, under ₹300 each, needed in 3 weeks",
    "10 business laptops with 16 GB RAM and 512 GB SSD, budget $12,000, within 2 weeks",
    "5 tons of cotton fabric, 120 GSM, delivered within 30 days",
  ];
  const read = async () => {
    setBusy(true);
    setMsg("");
    try {
      const v = await askJson(
        'Extract structured purchase requirements from the request below. Return ONLY JSON with keys: product (string, short name), qty (number), budget (number or null; the TOTAL budget, so multiply a per-unit budget by qty), currency (one of "$","€","£","₹"), deliveryDays (number or null), priority ("cost", "speed" or "balanced"), mustHaves (array of up to 5 short, specific requirements a supplier must meet). Use null when a value is not stated. Do not invent details. Request: ' +
          brief.request,
      );
      props.setBrief(
        Object.assign({}, brief, {
          product: v.product || brief.product,
          qty: +v.qty > 0 ? +v.qty : brief.qty,
          budget: +v.budget > 0 ? +v.budget : 0,
          cur: ["$", "€", "£", "₹"].indexOf(v.currency) >= 0 ? v.currency : brief.cur,
          dl: +v.deliveryDays > 0 ? +v.deliveryDays : brief.dl,
          pr: ["cost", "speed", "balanced"].indexOf(v.priority) >= 0 ? v.priority : "cost",
          mustText: Array.isArray(v.mustHaves) ? v.mustHaves.join(", ") : brief.mustText,
        }),
      );
      setMsg("done");
    } catch (e) {
      setMsg(aiError(e));
    }
    setBusy(false);
  };
  const num = (label, k, hint) =>
    field(
      label,
      <input
        type={"number"}
        value={brief[k]}
        min={0}
        onChange={(e) => set(k, +e.target.value || 0)}
      />,
      hint,
    );
  return (
    <div>
      {Head(
        "new",
        "What do you need to buy?",
        "Type it the way you'd say it. Include the product, quantity, budget, deadline and any must-haves.",
      )}
      <div className="card">
        <textarea
          className="ask"
          value={brief.request}
          placeholder={
            "e.g. 200 stainless steel water bottles, 750 ml, under ₹300 each, needed in 3 weeks"
          }
          onChange={(e) => set("request", e.target.value)}
        />
        <div className={"pills" + " layout-07"}>
          {examples.map((x) => (
            <button className="pill" key={x} onClick={() => set("request", x)}>
              {x.length > 52 ? x.slice(0, 50) + "…" : x}
            </button>
          ))}
          <button
            className={"pill" + " layout-06"}
            onClick={() => {
              const d = chairDemo();
              props.loadDemo(d);
            }}
          >
            {"Load full worked example"}
          </button>
        </div>
        <button className="btn" disabled={busy || brief.request.trim().length < 5} onClick={read}>
          {busy ? "Reading your request…" : "Fill in the details for me"}
        </button>
        {msg === "done" ? (
          <div className={"info" + " layout-08"}>
            {"Done. Please check the details below and correct anything that looks off."}
          </div>
        ) : msg ? (
          <div className={"err" + " layout-08"}>{msg}</div>
        ) : null}
      </div>
      <div className="card">
        <h2 className="layout-09">{"Purchase details"}</h2>
        <div className="grid g2">
          {field(
            "Product",
            <input
              value={brief.product}
              placeholder={"e.g. Stainless steel water bottle"}
              onChange={(e) => set("product", e.target.value)}
            />,
          )}
          {num("Quantity", "qty", "Units you need")}
          {field(
            "Currency",
            <select value={brief.cur} onChange={(e) => set("cur", e.target.value)}>
              {["$", "€", "£", "₹"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>,
          )}
          {num("Total budget (" + brief.cur + ")", "budget", "Leave 0 for no limit")}
          {num("Needed within (days)", "dl", "Slower suppliers are excluded")}
          {field(
            "What matters most?",
            <select value={brief.pr} onChange={(e) => set("pr", e.target.value)}>
              {prOpts()}
            </select>,
            "Used to rank suppliers that qualify",
          )}
        </div>
        {field(
          "Must-have requirements",
          <input
            value={brief.mustText}
            placeholder={"e.g. food-grade steel, leak-proof lid, ISO certified"}
            onChange={(e) => set("mustText", e.target.value)}
          />,
          "Separate with commas. Suppliers that fail or can't confirm one are excluded.",
        )}
      </div>
      <div className="foot">
        <button className="btn ghost" onClick={() => props.go("home")}>
          {"← Back"}
        </button>
        <button
          className="btn"
          disabled={props.finding || !brief.product.trim() || !(brief.qty > 0)}
          onClick={props.find}
        >
          {props.finding ? "Finding suppliers…" : "Find suppliers →"}
        </button>
      </div>
    </div>
  );
}
function OfferCard(props) {
  const o = props.o,
    M = props.musts,
    up = (x) => props.update(Object.assign({}, o, x));
  const num = (label, key, ph) =>
    field(
      label,
      <input
        type={"number"}
        min={0}
        placeholder={ph || ""}
        value={o[key] == null ? "" : o[key]}
        onChange={(e) =>
          up({
            [key]: e.target.value === "" ? null : +e.target.value,
          })
        }
      />,
    );
  const specVal = (m) => (o.specs[m] === true ? "y" : o.specs[m] === false ? "n" : "?");
  return (
    <div className="card">
      <div className="rowh">
        <div>
          <b>{o.name || "New supplier"}</b>
          {o.static ? (
            <span className={"chip i" + " layout-10"}>{"Static demo data"}</span>
          ) : o.sample ? (
            <span className={"chip i" + " layout-10"}>{"AI sample, not a real supplier"}</span>
          ) : null}
        </div>
        <button className="btn ghost sm" onClick={props.remove}>
          {"Remove"}
        </button>
      </div>
      <div className="grid g3">
        {field(
          "Supplier name",
          <input
            value={o.name}
            placeholder={"Company name"}
            onChange={(e) =>
              up({
                name: e.target.value,
              })
            }
          />,
        )}
        {num("Unit price (" + SYM + ")", "price")}
        {num("Minimum order (units)", "moq", "1")}
        {num("Delivery time (days)", "lead")}
        {field(
          "Shipping",
          <select
            value={o.shipType}
            onChange={(e) =>
              up({
                shipType: e.target.value,
              })
            }
          >
            {[
              <option key={"f"} value={"flat"}>
                {"Flat fee"}
              </option>,
              <option key={"u"} value={"unit"}>
                {"Per unit"}
              </option>,
              <option key={"n"} value={"none"}>
                {"Not listed"}
              </option>,
            ]}
          </select>,
        )}
        {num("Shipping amount (" + SYM + ")", "shipAmt")}
        {num("Other fees (" + SYM + ")", "fees", "0")}
        {num("Discount from quantity", "tierQty", "e.g. 100")}
        {num("Discount (%)", "tierPct", "e.g. 5")}
      </div>
      {field(
        "Source link (optional)",
        <input
          value={o.url || ""}
          placeholder={"https://…"}
          onChange={(e) =>
            up({
              url: e.target.value,
            })
          }
        />,
      )}
      {M.length ? (
        <div>
          <label>{"Does this supplier meet your must-haves?"}</label>
          <div className="grid g3">
            {M.map((m) => (
              <div className="f" key={m}>
                <div className="note">{m}</div>
                <select
                  value={specVal(m)}
                  onChange={(e) =>
                    up({
                      specs: Object.assign({}, o.specs, {
                        [m]: e.target.value === "y" ? true : e.target.value === "n" ? false : null,
                      }),
                    })
                  }
                >
                  {[
                    <option key={"y"} value={"y"}>
                      {"Yes"}
                    </option>,
                    <option key={"n"} value={"n"}>
                      {"No"}
                    </option>,
                    <option key={"q"} value={"?"}>
                      {"Not sure"}
                    </option>,
                  ]}
                </select>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
function Suppliers(props) {
  const b = props.brief,
    offers = props.offers;
  return (
    <div>
      {Head(
        "suppliers",
        "Review suppliers",
        "Supplier data for " +
          (b.product || "your product") +
          " is loaded below. Edit any value, remove a supplier, or add a quote you received.",
      )}
      <div className="info">
        {DATA_SOURCE.liveUrl
          ? "Showing data from the live supplier feed."
          : "Showing static demo data. A live data feed will replace it. Quotes you add yourself stay separate and are labeled as yours."}
      </div>
      {props.notice ? <div className="err">{props.notice}</div> : null}
      <div className="card">
        <div className={"rowh" + " layout-12"}>
          <div>
            <b>{offers.length + " supplier" + (offers.length === 1 ? "" : "s") + " loaded"}</b>
          </div>
          <div className="layout-11">
            <button
              className="btn ghost sm"
              onClick={() =>
                props.setOffers(
                  offers.concat([
                    newOffer({
                      specs: {},
                    }),
                  ]),
                )
              }
            >
              {"+ Add a quote"}
            </button>
            <button className="btn sm" disabled={props.finding || !b.product} onClick={props.find}>
              {props.finding ? "Loading…" : "Reload supplier data"}
            </button>
          </div>
        </div>
      </div>
      {offers.map((o) => (
        <OfferCard
          key={o.id}
          o={o}
          musts={musts(b)}
          update={(n) => props.setOffers(offers.map((x) => (x.id === o.id ? n : x)))}
          remove={() => props.setOffers(offers.filter((x) => x.id !== o.id))}
        />
      ))}
      {Foot(props.go, "new", "compare", "Compare suppliers", !offers.length)}
    </div>
  );
}
function Compare(props) {
  const b = props.brief,
    offs = props.offs;
  const p = Object.assign({}, b, {
      disc: {},
      ship: {},
    }),
    ev = useMemo(() => evaluate(offs, p), [b, offs]),
    w = ev.ranked[0];
  if (!offs.length)
    return (
      <div>
        {Head("compare", "Compare suppliers", "Nothing to compare yet.")}
        {Empty(
          "No suppliers yet",
          "Add at least one supplier quote to see a comparison.",
          "Add suppliers",
          () => props.go("suppliers"),
        )}
      </div>
    );
  const cheap = ev.rows.filter((r) => r.o.price != null).sort((x, y) => x.c.unit - y.c.unit)[0];
  return (
    <div>
      {Head(
        "compare",
        "Compare suppliers",
        b.qty +
          " × " +
          b.product +
          (b.budget > 0 ? " · budget " + usd(b.budget) : "") +
          " · needed within " +
          b.dl +
          " days",
      )}
      {w ? (
        <div className="card hero">
          <div>
            <span className="tag">{"Recommended"}</span>
            <h2>{w.o.name}</h2>
            <p className={"note" + " layout-03"}>
              {usd2(w.c.unit) + " per unit · delivers in " + w.o.lead + " days"}
            </p>
          </div>
          <div className="layout-13">
            <div className="big">{usd(w.c.total)}</div>
            <div className="note">{"known total cost"}</div>
          </div>
        </div>
      ) : null}
      <Ranking ev={ev} p={p} />
      {cheap && cheap.bad.length ? (
        <p className="note">
          {"Tip: the cheapest unit price (" +
            cheap.o.name +
            ", " +
            usd2(cheap.c.unit) +
            ") is excluded. " +
            cheap.bad[0] +
            ". Test whether changing quantity or deadline brings it back in the next step."}
        </p>
      ) : null}
      {Foot(props.go, "suppliers", "sandbox", "Test scenarios")}
    </div>
  );
}
function Evidence(props) {
  const offs = props.offs,
    M = musts(props.brief);
  const legend = (
    <div className="card">
      <h3 className="layout-14">{"How to read the labels"}</h3>
      <div className="grid g2">
        <p className={"note" + " layout-02"}>
          {Chip("e")}
          {" A value you entered. "}
          {Chip("v")}
          {" Checked against a source. "}
          {Chip("i")}
          {" Estimated. "}
          {Chip("d")}
          {" Static demo data."}
        </p>
        <p className={"note" + " layout-02"}>
          {Chip("u")}
          {" Missing. "}
          {Chip("s")}
          {" Source is more than 14 days old."}
        </p>
      </div>
    </div>
  );
  return (
    <div>
      <h1>{"Evidence & sources"}</h1>
      <p className="sub">
        {"Every number comes with a quality label so you know what's confirmed and what's not."}
      </p>
      {legend}
      {!offs.length
        ? Empty(
            "No suppliers yet",
            "Evidence appears here once you add suppliers.",
            "Add suppliers",
            () => props.go("suppliers"),
          )
        : null}
      {offs.map((o) => {
        const fs = fsOf(o);
        const rows = [
          [
            "Unit price",
            o.price == null
              ? "Not given"
              : usd2(o.price) +
                (o.tierQty && o.tierPct
                  ? " (−" + o.tierPct + "% from " + o.tierQty + " units)"
                  : ""),
            fs.price,
          ],
          [
            "Shipping",
            o.shipType === "flat" && o.shipAmt != null
              ? usd(o.shipAmt) + " flat"
              : o.shipType === "unit" && o.shipAmt != null
                ? usd2(o.shipAmt) + " per unit"
                : "Not listed",
            fs.ship,
          ],
          ["Minimum order", (o.moq || 1) + " units", fs.moq],
          ["Delivery time", o.lead == null ? "Not given" : o.lead + " days", fs.lead],
        ].concat(
          M.map((m) => [
            m,
            specOf(o, m) === true ? "Yes" : specOf(o, m) === false ? "No" : "Not confirmed",
            specOf(o, m) == null ? "u" : fs.spec,
          ]),
        );
        return (
          <div className="card" key={o.id}>
            <div className="layout-15">
              <h2>{o.name}</h2>
              <span className="note">
                {o.got
                  ? "Retrieved " + o.got
                  : o.static
                    ? "Static demo data"
                    : o.sample
                      ? "AI-generated sample"
                      : "Entered by you"}
              </span>
            </div>
            <div className={"note" + " layout-16"}>
              {o.url && !o.static ? (
                <a href={o.url} target={"_blank"} rel={"noopener noreferrer"}>
                  {o.url}
                </a>
              ) : o.static ? (
                "Placeholder link: this is static demo data, not a real listing."
              ) : o.sample ? (
                "No real source: this is an illustrative sample."
              ) : (
                "No source link added."
              )}
            </div>
            <div className="scroll">
              <table>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r[0]}>
                      <td className={"note" + " layout-17"}>{r[0]}</td>
                      <td>{r[1]}</td>
                      <td className="n">{Chip(r[2])}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function Sandbox(props) {
  const brief = props.brief,
    sim = props.sim,
    setSim = props.setSim,
    offs = props.offs;
  const p = sim,
    ev = useMemo(() => evaluate(offs, p), [sim, offs]);
  const [a, setA] = useState(0),
    [b, setB] = useState(0);
  if (!offs.length)
    return (
      <div>
        {Head("sandbox", "Test scenarios", "Nothing to test yet.")}
        {Empty("No suppliers yet", "Add supplier quotes first.", "Add suppliers", () =>
          props.go("suppliers"),
        )}
      </div>
    );
  const clean = Object.assign({}, brief, {
    disc: {},
    ship: {},
  });
  const baseW = evaluate(offs, clean).ranked[0];
  const aid = offs.find((o) => o.id === +a) ? +a : offs[0].id,
    bid = offs.find((o) => o.id === +b) ? +b : (offs[1] || offs[0]).id;
  const A = offs.find((o) => o.id === aid),
    B = offs.find((o) => o.id === bid);
  const be = aid !== bid ? breakEven(A, B, p) : null;
  const t = offs.find((o) => o.id === sim.target) ? sim.target : offs[0].id,
    upd = (o) => setSim(Object.assign({}, sim, o));
  const text = explain(offs, clean, p);
  const wid = baseW ? baseW.o.id : t,
    wname = baseW ? baseW.o.name : offs[0].name;
  const presets = [
    [
      "Order 25% more",
      {
        qty: Math.max(1, Math.round(brief.qty * 1.25)),
      },
    ],
    [
      "Allow 7 more days",
      {
        dl: brief.dl + 7,
      },
    ],
    [
      "Ask " + wname.split(" ")[0] + " for 8% off",
      {
        target: wid,
        disc: {
          [wid]: 8,
        },
      },
    ],
    [
      "Prioritize speed",
      {
        pr: "speed",
      },
    ],
  ];
  const qmax = Math.max(100, brief.qty * 3),
    dmax = Math.max(60, brief.dl * 2);
  return (
    <div>
      {Head(
        "sandbox",
        "Test scenarios",
        "See how the best option changes when you adjust quantity, deadline or price. Pick a quick scenario or use the sliders.",
      )}
      <div className="card">
        <label>{"Quick scenarios"}</label>
        <div className="pills">
          {presets.map((x) => (
            <button className="pill" key={x[0]} onClick={() => upd(x[1])}>
              {x[0]}
            </button>
          ))}
          <button
            className={"pill" + " layout-06"}
            onClick={() =>
              setSim(
                Object.assign({}, brief, {
                  disc: {},
                  ship: {},
                  target: t,
                }),
              )
            }
          >
            {"Reset"}
          </button>
        </div>
        <div className={"why" + " layout-18"}>
          <h3>{"What changed"}</h3>
          <p className="layout-01">{text}</p>
        </div>
        <div className="grid g2">
          {field(
            ["Quantity: ", <b key={1}>{sim.qty + " units"}</b>],
            <input
              type={"range"}
              min={1}
              max={qmax}
              step={Math.max(1, Math.round(qmax / 100))}
              value={sim.qty}
              onChange={(e) =>
                upd({
                  qty: +e.target.value,
                })
              }
            />,
          )}
          {field(
            ["Needed within: ", <b key={1}>{sim.dl + " days"}</b>],
            <input
              type={"range"}
              min={1}
              max={dmax}
              value={sim.dl}
              onChange={(e) =>
                upd({
                  dl: +e.target.value,
                })
              }
            />,
          )}
          {field(
            "Negotiate with",
            <select
              value={t}
              onChange={(e) =>
                upd({
                  target: +e.target.value,
                })
              }
            >
              {opts(offs)}
            </select>,
          )}
          {field(
            "What matters most?",
            <select
              value={sim.pr}
              onChange={(e) =>
                upd({
                  pr: e.target.value,
                })
              }
            >
              {prOpts()}
            </select>,
          )}
          {field(
            ["Discount: ", <b key={1}>{(sim.disc[t] || 0) + "%"}</b>],
            <input
              type={"range"}
              min={0}
              max={15}
              value={sim.disc[t] || 0}
              onChange={(e) =>
                upd({
                  disc: Object.assign({}, sim.disc, {
                    [t]: +e.target.value,
                  }),
                })
              }
            />,
            "A what-if only; not a confirmed price",
          )}
          {field(
            "Shipping cost (" + SYM + ")",
            <input
              type={"number"}
              placeholder={"Use listed price"}
              value={sim.ship[t] != null ? sim.ship[t] : ""}
              onChange={(e) => {
                const s = Object.assign({}, sim.ship);
                if (e.target.value === "") delete s[t];
                else s[t] = +e.target.value;
                upd({
                  ship: s,
                });
              }}
            />,
            "Leave blank to use the listed shipping",
          )}
        </div>
      </div>
      <Ranking ev={ev} p={p} />
      <div className="card">
        <h2 className="layout-19">{"At what quantity does one supplier beat another?"}</h2>
        <p className={"note" + " layout-20"}>{"Break-even analysis"}</p>
        <div className="grid g2">
          <select value={aid} onChange={(e) => setA(e.target.value)}>
            {opts(offs)}
          </select>
          <select value={bid} onChange={(e) => setB(e.target.value)}>
            {opts(offs)}
          </select>
        </div>
        <p className="layout-12">
          {aid === bid
            ? "Pick two different suppliers."
            : be
              ? [
                  <b key={1}>{be.before.name}</b>,
                  " is cheaper below ",
                  <b key={2}>{be.q + " units"}</b>,
                  "; from " + be.q + " units, ",
                  <b key={3}>{be.cheaper.name}</b>,
                  " is cheaper (shipping, volume discounts and fees included).",
                ]
              : "No crossover under the current assumptions."}
        </p>
      </div>
      {Foot(props.go, "compare", "nego", "Prepare negotiation")}
    </div>
  );
}
function Negotiate(props) {
  const sim = props.sim,
    brief = props.brief,
    offs = props.offs;
  const p = Object.assign({}, brief, {
    disc: {},
    ship: {},
  });
  const ev = evaluate(offs, p),
    lead = ev.ranked[0] || ev.rows[0];
  const [id, setId] = useState(lead ? lead.o.id : 0),
    [msg, setMsg] = useState(null),
    [copied, setCopied] = useState(false);
  if (!offs.length)
    return (
      <div>
        {Head("nego", "Prepare your negotiation", "Nothing to negotiate yet.")}
        {Empty("No suppliers yet", "Add supplier quotes first.", "Add suppliers", () =>
          props.go("suppliers"),
        )}
      </div>
    );
  const row = ev.rows.find((r) => r.o.id === +id) || ev.rows[0];
  const musts_ = musts(brief);
  const comps = ev.rows.filter(
    (r) => r.o.id !== row.o.id && r.o.price != null && !musts_.some((m) => r.o.specs[m] !== true),
  );
  const bench = comps.length
    ? Math.min.apply(
        null,
        comps.map((r) => r.c.unit),
      )
    : null;
  const open =
    Math.round(Math.min(row.c.unit * 0.95, bench == null ? Infinity : bench) * 100) / 100;
  const fall = ev.ranked.find((r) => r.o.id !== row.o.id);
  const draft =
    "Subject: Quote request, " +
    p.qty +
    " × " +
    brief.product +
    "\n\nHello " +
    row.o.name +
    " team,\n\nWe plan to order " +
    p.qty +
    " units of " +
    brief.product +
    " and need delivery within " +
    p.dl +
    " days. Your listed price is " +
    usd2(row.c.unit) +
    " per unit, " +
    usd(row.c.total) +
    " known total" +
    (row.c.partial ? " (shipping not yet confirmed)" : " with shipping") +
    ".\n\nComparable offers we have reviewed start at " +
    (bench ? usd2(bench) : "a similar range") +
    " per unit at this volume. Could you offer " +
    usd2(open) +
    " per unit, or equivalent terms such as free shipping or an earlier dispatch date?\n\nIf a volume commitment helps, we are open to discussing a larger order. Please also confirm lead time and any fees not shown on the listing.\n\nKind regards,\n" +
    props.user.name;
  const line = (k, v) => (
    <tr key={k}>
      <td className="note">{k}</td>
      <td className="n">{v}</td>
    </tr>
  );
  return (
    <div>
      {Head(
        "nego",
        "Prepare your negotiation",
        "We suggest an opening offer based on competing quotes. It's a starting point, not a prediction that the supplier will agree.",
      )}
      <div className="grid g2">
        <div className="card">
          {field(
            "Supplier",
            <select
              value={row.o.id}
              onChange={(e) => {
                setId(e.target.value);
                setMsg(null);
              }}
            >
              {opts(offs)}
            </select>,
          )}
          <table>
            <tbody>
              {line("Listed unit price", usd2(row.c.unit))}
              {line("Best competing price", bench ? usd2(bench) : "—")}
              {line("Suggested opening offer", <b>{usd2(open)}</b>)}
              {line("Possible saving (estimate)", usd((row.c.unit - open) * p.qty))}
              {line("If they say no, go to", fall ? fall.o.name : "No other option")}
            </tbody>
          </table>
          <p className="note">
            {
              "Other terms to ask for: free shipping, split delivery, payment terms, a price lock for repeat orders."
            }
          </p>
          {row.o.sample || row.o.static ? (
            <p className="note">
              {"Note: this supplier is demo data, so the draft is for practice only."}
            </p>
          ) : null}
        </div>
        <div className="card">
          <label>{"Message draft (you can edit it)"}</label>
          <textarea value={msg == null ? draft : msg} onChange={(e) => setMsg(e.target.value)} />
          <p className="note">
            {"Nothing is sent from this app. Copy the message and send it yourself."}
          </p>
          <button
            className="btn"
            onClick={() => {
              try {
                navigator.clipboard.writeText(msg == null ? draft : msg);
              } catch (e) {}
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
          >
            {copied ? "Copied ✓" : "Copy message"}
          </button>
        </div>
      </div>
      {Foot(props.go, "sandbox", "ledger", "Record savings")}
    </div>
  );
}
function Ledger(props) {
  const brief = props.brief,
    led = props.led,
    offs = props.offs,
    ev = evaluate(
      offs,
      Object.assign({}, brief, {
        disc: {},
        ship: {},
      }),
    );
  const set = (id, k, v) => {
    const r = ev.rows.find((x) => x.o.id === id),
      cur = Object.assign({}, led[id] || {}, {
        [k]: v === "" ? null : +v,
      });
    cur.potential = cur.quote ? Math.max(r.c.total - cur.quote, 0) : null;
    cur.realized = cur.final ? r.c.total - cur.final : null;
    props.setLed(
      Object.assign({}, led, {
        [id]: cur,
      }),
    );
  };
  const cell = (r, k) => (
    <td className="n">
      <input
        className="layout-21"
        type={"number"}
        placeholder={SYM}
        value={(led[r.o.id] || {})[k] == null ? "" : led[r.o.id][k]}
        onChange={(e) => set(r.o.id, k, e.target.value)}
      />
    </td>
  );
  return (
    <div>
      {Head(
        "ledger",
        "Record savings",
        "Enter the quote you receive and the final price you pay. Savings count as confirmed only after a final price is entered.",
      )}
      {ev.ranked.length ? (
        <div className="card scroll">
          <table>
            <thead>
              <tr>
                <th>{"Supplier"}</th>
                <th className="n">{"Listed total"}</th>
                <th className="n">{"Quote received"}</th>
                <th className="n">{"Final price paid"}</th>
                <th className="n">{"Estimated saving"}</th>
                <th className="n">{"Confirmed saving"}</th>
              </tr>
            </thead>
            <tbody>
              {ev.ranked.slice(0, 3).map((r) => {
                const l = led[r.o.id] || {};
                return (
                  <tr key={r.o.id}>
                    <td>
                      <b>{r.o.name}</b>
                    </td>
                    <td className="n">{usd(r.c.total)}</td>
                    {cell(r, "quote")}
                    {cell(r, "final")}
                    <td className="n">{l.potential != null ? usd(l.potential) + " *" : "—"}</td>
                    <td className={"n " + (l.realized > 0 ? "good" : "")}>
                      {l.realized != null ? usd(l.realized) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        Empty(
          "Nothing to record yet",
          "Once at least one supplier qualifies, you can record quotes and prices here.",
          "Add suppliers",
          () => props.go("suppliers"),
        )
      )}
      <p className="note">{"* Estimated savings are hypothetical until a purchase is recorded."}</p>
      {Foot(props.go, "nego", "home", "Back to home")}
    </div>
  );
}

/* ---- Login ---- */
function Login(props) {
  const [mode, setMode] = useState("in"),
    [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [pw, setPw] = useState(""),
    [show, setShow] = useState(false),
    [err, setErr] = useState("");
  const submit = (e) => {
    e.preventDefault();
    if (mode === "up" && name.trim().length < 2) return setErr("Please enter your name.");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setErr("Enter a valid email address.");
    if (pw.length < 6) return setErr("Password must be at least 6 characters.");
    const nm =
      name.trim() ||
      email
        .split("@")[0]
        .replace(/[._-]+/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
    props.onLogin({
      name: nm,
      email: email,
    });
  };
  const demo = () =>
    props.onLogin({
      name: "Demo Buyer",
      email: "demo@vendormind.app",
    });
  return (
    <div className="login">
      <div className="lp">
        <div className={"brand" + " layout-22"}>
          <span className="logo">{"V"}</span>
          {"VendorMind"}
        </div>
        <h1>{"Buy smarter, not just cheaper."}</h1>
        <p>
          {
            "Describe what you need to buy, compare suppliers on total cost, test what-if scenarios and walk into every negotiation with evidence."
          }
        </p>
        <ul className="layout-23">
          <li>{"Works for any product you type in"}</li>
          <li>{"Total cost, not just sticker price"}</li>
          <li>{"See how the best choice changes, instantly"}</li>
        </ul>
      </div>
      <div className="lf">
        <form onSubmit={submit} noValidate={true}>
          <h2>{mode === "in" ? "Sign in" : "Create your account"}</h2>
          <p className={"note" + " layout-24"}>
            {mode === "in"
              ? "Welcome back. Enter your details to continue."
              : "Start comparing suppliers in minutes."}
          </p>
          {err ? <div className="err">{err}</div> : null}
          {mode === "up"
            ? field(
                "Full name",
                <input
                  value={name}
                  autoComplete={"name"}
                  onChange={(e) => setName(e.target.value)}
                />,
              )
            : null}
          {field(
            "Work email",
            <input
              type={"email"}
              value={email}
              autoComplete={"email"}
              placeholder={"you@company.com"}
              onChange={(e) => setEmail(e.target.value)}
            />,
          )}
          <div className="f">
            <label>{"Password"}</label>
            <div className="pw">
              <input
                type={show ? "text" : "password"}
                value={pw}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                onChange={(e) => setPw(e.target.value)}
              />
              <button type={"button"} onClick={() => setShow(!show)}>
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <button className="btn full" type={"submit"}>
            {mode === "in" ? "Sign in" : "Create account"}
          </button>
          <div className="or">{"or"}</div>
          <button className="btn ghost full" type={"button"} onClick={demo}>
            {"Continue with demo account"}
          </button>
          <p className={"note" + " layout-25"}>
            {mode === "in" ? "New here? " : "Already have an account? "}
            <button
              className="link"
              type={"button"}
              onClick={() => {
                setMode(mode === "in" ? "up" : "in");
                setErr("");
              }}
            >
              {mode === "in" ? "Create an account" : "Sign in"}
            </button>
          </p>
          <p className={"hint" + " layout-26"}>
            {
              "Prototype sign-in: no real account or password is stored. Any valid email and a 6+ character password works."
            }
          </p>
        </form>
      </div>
    </div>
  );
}

/* ---- App shell ---- */
function readUser() {
  try {
    return JSON.parse(localStorage.getItem("vm_user"));
  } catch (e) {
    return null;
  }
}
function saveUser(u) {
  try {
    u ? localStorage.setItem("vm_user", JSON.stringify(u)) : localStorage.removeItem("vm_user");
  } catch (e) {}
}
const fresh = (b) =>
  Object.assign({}, b, {
    disc: {},
    ship: {},
    target: null,
  });
function App() {
  const [user, setUser] = useState(readUser),
    [pg, setPg] = useState("home"),
    [brief, setBrief] = useState(BLANK),
    [led, setLed] = useState({}),
    [offers, setOffers] = useState([]);
  const [sim, setSim] = useState(fresh(BLANK));
  const [finding, setFinding] = useState(false),
    [notice, setNotice] = useState("");
  const offs = useMemo(() => offers.map(norm), [offers]);
  if (!user)
    return (
      <Login
        onLogin={(u) => {
          saveUser(u);
          setUser(u);
        }}
      />
    );
  SYM = brief.cur;
  const go = (k) => {
    setPg(k);
    window.scrollTo(0, 0);
  };
  const onBrief = (b) => {
    setBrief(b);
    setSim(fresh(b));
  };
  const loadDemo = (d) => {
    setBrief(d.brief);
    setSim(fresh(d.brief));
    setOffers(d.offers);
    setLed({});
  };
  const find = async () => {
    setFinding(true);
    setNotice("");
    const r = await fetchOffers(brief);
    setOffers((prev) =>
      prev.filter((o) => !o.static && !o.live && !o.sample && !o.demo).concat(r.offers),
    );
    setSim(fresh(brief));
    setNotice(r.note);
    setFinding(false);
    go("suppliers");
  };
  const idx = STEPS.findIndex((s) => s[0] === pg);
  const page =
    pg === "home" ? (
      <Home go={go} led={led} user={user} brief={brief} offers={offers} />
    ) : pg === "new" ? (
      <NewPurchase
        brief={brief}
        setBrief={onBrief}
        go={go}
        loadDemo={loadDemo}
        find={find}
        finding={finding}
      />
    ) : pg === "suppliers" ? (
      <Suppliers
        brief={brief}
        offers={offers}
        setOffers={setOffers}
        go={go}
        find={find}
        finding={finding}
        notice={notice}
      />
    ) : pg === "compare" ? (
      <Compare brief={brief} offs={offs} go={go} />
    ) : pg === "evidence" ? (
      <Evidence brief={brief} offs={offs} go={go} />
    ) : pg === "sandbox" ? (
      <Sandbox brief={brief} sim={sim} setSim={setSim} offs={offs} go={go} />
    ) : pg === "nego" ? (
      <Negotiate brief={brief} sim={sim} offs={offs} user={user} go={go} />
    ) : (
      <Ledger brief={brief} led={led} setLed={setLed} offs={offs} go={go} />
    );
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          <span className="logo">{"V"}</span>
          {"VendorMind"}
        </div>
        <button className={"nv" + (pg === "home" ? " on" : "")} onClick={() => go("home")}>
          {"Home"}
        </button>
        <div className="sec">{"Purchase steps"}</div>
        {STEPS.map((s, i) => (
          <button
            className={"nv" + (pg === s[0] ? " on" : i < idx ? " done" : "")}
            key={s[0]}
            onClick={() => go(s[0])}
          >
            <span className="num">{i < idx ? "✓" : i + 1}</span>
            {s[1]}
          </button>
        ))}
        <div className="sec">{"Reference"}</div>
        <button className={"nv" + (pg === "evidence" ? " on" : "")} onClick={() => go("evidence")}>
          {"Evidence & sources"}
        </button>
        <div className="me">
          <b>{user.name}</b>
          {user.email}
          <div>
            <button
              onClick={() => {
                saveUser(null);
                setUser(null);
                setPg("home");
              }}
            >
              {"Sign out"}
            </button>
          </div>
        </div>
      </aside>
      <main>
        <div className="banner">
          {
            "Prototype: supplier data is static demo data for now (a live feed will replace it). Nothing is sent to suppliers."
          }
        </div>
        {page}
      </main>
    </div>
  );
}

export default App;
