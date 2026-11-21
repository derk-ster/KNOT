'use strict';
// Server-side Groq client. The key never leaves this process and is never sent to the browser.
const URL_ = 'https://api.groq.com/openai/v1/chat/completions';
const MODELS = { smart: process.env.GROQ_MODEL || 'openai/gpt-oss-120b', fast: process.env.GROQ_FAST_MODEL || 'openai/gpt-oss-20b' };
const enabled = () => Boolean(process.env.GROQ_API_KEY);

// Returns the parsed JSON object the model produced. Throws on any failure (callers must handle it honestly).
async function chatJson({ system, messages, tier = 'fast', maxTokens = 600 }) {
  if (!enabled()) throw new Error('AI is not configured');
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(URL_, {
      method: 'POST', signal: ctl.signal,
      headers: { Authorization: 'Bearer ' + process.env.GROQ_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODELS[tier], reasoning_effort: 'low', response_format: { type: 'json_object' }, max_completion_tokens: maxTokens, temperature: 0.4, messages: [{ role: 'system', content: system }, ...messages] })
    });
    if (!r.ok) throw new Error(r.status === 429 ? 'The AI is busy right now' : `The AI service returned ${r.status}`);
    const j = await r.json();
    const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    return JSON.parse(txt);
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'The AI took too long to answer' : (e.message || 'The AI request failed'));
  } finally { clearTimeout(timer); }
}
module.exports = { chatJson, enabled, MODELS };
