'use strict';
// Server-side OpenAI client. The key never leaves this process and is never sent to the browser.
// OPENAI_MODEL / OPENAI_FAST_MODEL must be set explicitly (no invented model names); the moderation
// model defaults to omni-moderation-latest. Every call's token usage is recorded for the budget.
const BASE = 'https://api.openai.com/v1';
const aiusage = require('./aiusage');

const enabled = () => Boolean(process.env.OPENAI_API_KEY);
const modelFor = tier => tier === 'fast' ? process.env.OPENAI_FAST_MODEL : process.env.OPENAI_MODEL;
const moderationModel = () => process.env.OPENAI_MODERATION_MODEL || 'omni-moderation-latest';

async function chatJson({ system, messages, tier = 'fast', maxTokens = 600, feature = 'chat' }) {
  if (!enabled()) throw new Error('AI is not configured');
  const model = modelFor(tier);
  if (!model) throw new Error('OPENAI_MODEL must be set in the environment to use AI features');
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(BASE + '/chat/completions', {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, response_format: { type: 'json_object' }, max_completion_tokens: maxTokens, messages: [{ role: 'system', content: system }, ...messages] })
    });
    if (!r.ok) throw new Error(r.status === 429 ? 'The AI is busy right now' : `The AI service returned ${r.status}`);
    const j = await r.json();
    aiusage.record({ feature, model, usage: j.usage }).catch(() => {});
    const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return JSON.parse(txt);
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The AI took too long to answer' : (e.message || 'The AI request failed'));
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

module.exports = { chatJson, moderate, moderateImage, enabled, moderationModel: () => moderationModel() };
