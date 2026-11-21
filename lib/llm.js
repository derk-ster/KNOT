'use strict';
// Provider dispatcher: OpenAI first (if configured), Groq fallback (if configured), honest error otherwise.
// All AI features call this instead of a vendor client, so switching providers is one place.
const openai = require('./openai');
const groq = require('./groq');
const aiusage = require('./aiusage');

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
  const models = { openai: process.env.OPENAI_MODEL || null, groq: process.env.GROQ_API_KEY ? 'openai/gpt-oss-120b' : null };
  return { ai: openai.enabled() || groq.enabled(), provider: openai.enabled() ? 'openai' : (groq.enabled() ? 'groq' : null), aiModels: models };
}

module.exports = { chatJson, status, enabled: () => openai.enabled() || groq.enabled() };
