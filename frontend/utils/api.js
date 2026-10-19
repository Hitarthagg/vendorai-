// Use the Vite proxy in development and a same-origin /api proxy in production.
// Provider credentials belong only in backend/.env.
async function post(path, body) {
  const response = await fetch(`/api/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Request failed (${response.status}).`);
  }
  return data;
}

export function toApiBrief(form) {
  const deadlineDays = form.deadline
    ? Math.ceil(
        (new Date(`${form.deadline}T23:59:59`).getTime() - Date.now()) /
          86_400_000,
      )
    : null;
  if (deadlineDays !== null && (!Number.isFinite(deadlineDays) || deadlineDays < 1)) {
    throw new Error("Choose a future delivery deadline.");
  }

  const mandatorySpecs = (form.specs || "")
    .split(/[,\n]/)
    .map((spec) => spec.trim())
    .filter(Boolean);
  const priorities = form.priorities || [];
  const cost = priorities.includes("Total cost");
  const speed = priorities.includes("Lead time");

  return {
    product: form.product.trim(),
    quantity: Number(form.quantity),
    budget: form.budget === "" ? null : Number(form.budget),
    currency: form.currency || "INR",
    deadlineDays,
    mandatorySpecs,
    priority: cost && speed ? "balanced" : speed ? "speed" : "cost",
    region: form.location?.trim() || null,
  };
}

export const researchSuppliers = (brief) =>
  post("research", { brief, fixtureOnly: false });

export const evaluateOffers = (research) =>
  post("evaluate", {
    briefId: research.briefId,
    brief: research.brief,
    offers: research.offers,
  });

export const runScenario = (research, changes) =>
  post("scenario", {
    briefId: research.briefId,
    brief: research.brief,
    offers: research.offers,
    changes,
  });

export const negotiate = (research, supplierId) =>
  post("negotiate", {
    briefId: research.briefId,
    brief: research.brief,
    offers: research.offers,
    supplierId,
  });
