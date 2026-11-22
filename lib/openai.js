'use strict';
// Server-side OpenAI client. The key never leaves this process and is never sent to the browser.
// OPENAI_MODEL / OPENAI_FAST_MODEL must be set explicitly (no invented model names); the moderation
// model defaults to omni-moderation-latest. Every call's token usage is recorded for the budget.
const BASE = 'https://api.openai.com/v1';
const aiusage = require('./aiusage');

const enabled = () => Boolean(process.env.OPENAI_API_KEY);
// One model is enough: a tier with no model of its own uses the other tier's model, and the status
// says so. Nothing is invented; with neither variable set, modelFor returns null and status reports it.
const modelFor = tier => {
  const smart = process.env.OPENAI_MODEL || null, fast = process.env.OPENAI_FAST_MODEL || null;
  return tier === 'fast' ? (fast || smart) : (smart || fast);
};
const moderationModel = () => process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest';
// Set when the key itself is refused (401). Cleared by the next successful call.
let rejected = false;
const isRejected = () => rejected;

async function chatJson({ system, messages, tier = 'fast', maxTokens = 600, feature = 'chat' }) {
  if (!enabled()) throw new Error('AI is not configured');
  const model = modelFor(tier);
  if (!model) throw Object.assign(new Error('AI needs a model. Set OPENAI_MODEL in the environment.'), { code: 'no-model' });
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(BASE + '/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages] })
    });
    if (r.status === 401) rejected = true;
    if (!r.ok) throw Object.assign(new Error(r.status === 429 ? 'The AI is busy right now' : `The AI service returned ${r.status}`), { status: r.status });
    rejected = false;
    const j = await r.json();
    aiusage.record({ feature, model, usage: j.usage }).catch(() => {});
    const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return JSON.parse(txt);
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The AI took too long to answer' : (e.message || 'The AI request failed'));
  } finally { clearTimeout(timer); }
}

// A one-token call that proves the key and the model work. Used at boot and by `npm run ai:check`.
// Returns { ok, tier, model, ms, error }; never throws.
async function ping(tier = 'smart') {
  const model = modelFor(tier);
  const started = Date.now();
  if (!enabled()) return { ok: false, tier, model, ms: 0, error: 'No OPENAI_API_KEY is set.' };
  if (!model) return { ok: false, tier, model: null, ms: 0, error: 'No model is set. Set OPENAI_MODEL (or OPENAI_FAST_MODEL).' };
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(BASE + '/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, max_completion_tokens: 16, messages: [{ role: 'user', content: 'Reply with the single word ok.' }] })
    });
    const body = await r.json().catch(() => ({}));
    if (r.status === 401) rejected = true;
    if (!r.ok) return { ok: false, tier, model, ms: Date.now() - started, error: (body.error && body.error.message) || `HTTP ${r.status}` };
    rejected = false;
    const txt = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
    return { ok: true, tier, model, ms: Date.now() - started, reply: String(txt || '').slice(0, 40) };
  } catch (e) {
    return { ok: false, tier, model, ms: Date.now() - started, error: e.name === 'AbortError' ? 'Timed out after 15 s' : e.message };
  } finally { clearTimeout(timer); }
}

// Returns { flagged, categories } from OpenAI's moderation endpoint, or null when unconfigured.
// Categories use the openai/* namespace of omni-moderation-latest.
async function moderate(text) {
  if (!enabled()) return null;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(BASE + '/moderations', {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: moderationModel(), input: String(text || '').slice(0, 2000) })
    });
    if (!r.ok) return null; // moderation is best-effort; local prefilter still applies
    const j = await r.json();
    const res = j.results && j.results[0];
    if (!res) return null;
    const categories = Object.entries(res.categories || {}).filter(([, v]) => v).map(([k]) => k);
    return { flagged: !!res.flagged, categories };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// Image moderation for profile pictures. Returns { flagged, categories } from the moderation
// endpoint, or null when unconfigured/unreachable. A failed check means the image is never shown.
async function moderateImage(dataUrl) {
  if (!enabled()) return null;
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(BASE + '/moderations', {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: moderationModel(), input: [{ type: 'image_url', image_url: { url: String(dataUrl).slice(0, 700 * 1024) } }] })
    });
    if (!r.ok) return null;
    const j = await r.json();
    const res = j.results && j.results[0];
    if (!res) return null;
    const categories = Object.entries(res.categories || {}).filter(([, v]) => v).map(([k]) => k);
    return { flagged: !!res.flagged, categories };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

// KNOT is a place for people to share pictures, not a courtroom. Only the categories that are
// illegal or that sexualise minors stop a picture; an ordinary photo of a face, a poster, a game or
// a beach never does, whatever the provider's overall flag says.
const IMAGE_REFUSE = ['sexual/minors', 'illicit/violent', 'hate/threatening', 'harassment/threatening'];
function imageRefusal(result) {
  if (!result || !result.flagged) return null;
  const hit = (result.categories || []).filter(c => IMAGE_REFUSE.includes(c));
  return hit.length ? hit : null;
}

module.exports = { chatJson, ping, moderate, moderateImage, imageRefusal, enabled, modelFor, isRejected, moderationModel: () => moderationModel() };
