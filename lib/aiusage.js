'use strict';
// AI spend tracking for every model call. One shared budget with hard stop / warn thresholds,
// env-configurable. When per-token pricing is unknown for a model, a call-count cap keeps the
// budget honest instead of guessing dollars. Stored via the shared store so all instances agree.
const store = require('./store');

const DEFAULTS = {
  budgetUsd: 25,   // KNOT_AI_BUDGET_USD
  warnUsd: 20,     // KNOT_AI_WARN_USD
  stopUsd: 23      // KNOT_AI_STOP_USD
};
const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : d; };
function limits() {
  return {
    budgetUsd: num(process.env.KNOT_AI_BUDGET_USD, DEFAULTS.budgetUsd),
    warnUsd: num(process.env.KNOT_AI_WARN_USD, DEFAULTS.warnUsd),
    stopUsd: num(process.env.KNOT_AI_STOP_USD, DEFAULTS.stopUsd),
    maxCallsDay: num(process.env.KNOT_AI_MAX_CALLS_DAY, 600) // fallback when pricing is unknown
  };
}
// Dollars per 1M tokens, from KNOT_AI_PRICING (JSON: {"model-prefix":{"in":x,"out":y}}).
// Known OpenAI families get a conservative default so the budget is a real number, not a shrug.
const DEFAULT_PRICING = {
  'gpt-4o-mini': { in: 0.2, out: 0.8 },
  'gpt-4o': { in: 2.5, out: 10 },
  'gpt-4.1-mini': { in: 0.4, out: 1.6 },
  'gpt-4.1': { in: 2, out: 8 },
  'gpt-5-mini': { in: 0.25, out: 2 },
  'gpt-5-nano': { in: 0.1, out: 0.4 },
  'gpt-5': { in: 1.25, out: 10 },
  'omni-moderation': { in: 0, out: 0 },
  'openai/gpt-oss-20b': { in: 0.1, out: 0.5 },
  'openai/gpt-oss-120b': { in: 0.15, out: 0.75 }
};
function pricingFor(model) {
  let custom = {};
  try { custom = JSON.parse(process.env.KNOT_AI_PRICING || '{}'); } catch {}
  const m = String(model || '').toLowerCase();
  for (const [prefix, p] of Object.entries(custom)) if (m.startsWith(prefix.toLowerCase()) && p) return p;
  for (const [prefix, p] of Object.entries(DEFAULT_PRICING)) if (m.startsWith(prefix)) return p;
  return null;
}
function estimateCost(model, promptTokens, completionTokens) {
  const p = pricingFor(model);
  if (!p) return null; // honest: unknown pricing -> budget enforced by call count instead
  return ((promptTokens || 0) * p.in + (completionTokens || 0) * p.out) / 1e6;
}

async function record({ feature, model, usage }) {
  if (!usage) return;
  const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;
  const completionTokens = usage.completion_tokens || usage.output_tokens || 0;
  if (!promptTokens && !completionTokens) return;
  const estCost = estimateCost(model, promptTokens, completionTokens);
  try { await store.addAiUsage({ feature, model, promptTokens, completionTokens, estCost }); } catch {}
}

// Gate before a call: after the stop threshold (or the daily call cap), refuse with a plain message.
async function gate() {
  const L = limits();
  let t;
  try { t = await store.aiUsageTotals(); } catch { return { ok: true }; }
  const spent = t.estCost;
  if (spent != null && spent >= L.stopUsd) return { ok: false, reason: `The AI budget for this launch is spent ($${spent.toFixed(2)} of $${L.budgetUsd}). KNOT still works without AI features.` };
  if (spent == null && t.callsToday >= L.maxCallsDay) return { ok: false, reason: `The AI call cap for today (${L.maxCallsDay}) is reached. KNOT still works without AI features.` };
  return { ok: true, spent, warn: spent != null && spent >= L.warnUsd };
}
// Warn once per process when crossing the warn threshold.
let warned = false;
async function warnIfNeeded() {
  const L = limits();
  try {
    const t = await store.aiUsageTotals();
    if (t.estCost != null && t.estCost >= L.warnUsd && !warned) {
      warned = true;
      console.log(`[ai-usage] WARN: $${t.estCost.toFixed(2)} spent of $${L.budgetUsd} budget`);
    }
  } catch {}
}
module.exports = { record, gate, warnIfNeeded, estimateCost, limits };
