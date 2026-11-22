'use strict';
// Provider dispatcher: OpenAI first (if configured), Groq fallback (if configured), honest error otherwise.
// All AI features call this instead of a vendor client, so switching providers is one place.
// status() says what is actually usable, not just what is configured: a key with no model is
// "no-model", and a key the provider refused is "rejected". The UI shows those states in plain words.
const openai = require('./openai');
const groq = require('./groq');
const aiusage = require('./aiusage');

let lastCheck = null; // { at, ok, tier, model, ms, error } from the boot check or ai:check

async function chatJson(opts = {}) {
  const gate = await aiusage.gate();
  if (!gate.ok) throw Object.assign(new Error(gate.reason), { status: 429 });
  aiusage.warnIfNeeded().catch(() => {});
  const providers = openai.enabled() ? [openai, groq] : (groq.enabled() ? [groq] : []);
  let lastErr;
  for (const p of providers) {
    try { return await p.chatJson(opts); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('AI is not configured');
}

function status() {
  let state = 'off', provider = null, model = null;
  if (openai.enabled()) {
    provider = 'openai';
    model = openai.modelFor('smart');
    if (!openai.modelFor('smart') && !openai.modelFor('fast')) state = 'no-model';
    else state = 'ready';
    if (openai.isRejected()) state = 'rejected';
  } else if (groq.enabled()) {
    provider = 'groq'; model = groq.MODELS.smart; state = 'ready';
  }
  return {
    ai: state === 'ready', state, provider, model,
    aiModels: { openai: openai.modelFor('smart') || null, openaiFast: openai.modelFor('fast') || null, groq: groq.enabled() ? groq.MODELS.smart : null },
    lastCheck
  };
}

// Runs one tiny call per configured tier and remembers the result for status(). Never throws.
async function healthCheck() {
  if (!openai.enabled()) return null;
  const smart = await openai.ping('smart');
  const fast = openai.modelFor('fast') === openai.modelFor('smart') ? null : await openai.ping('fast');
  lastCheck = { at: new Date().toISOString(), ok: smart.ok && (!fast || fast.ok), smart, fast };
  return lastCheck;
}

module.exports = { chatJson, status, healthCheck, enabled: () => openai.enabled() || groq.enabled() };
