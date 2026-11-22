#!/usr/bin/env node
'use strict';
// Lists the model ids your OpenAI key can use, so OPENAI_MODEL and OPENAI_FAST_MODEL can be picked
// from real names. Run locally: `npm run ai:models`. Prints only ids, never the key.
require('../lib/env');

(async () => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) { console.log('FAIL: no OPENAI_API_KEY in .env or the environment.'); process.exit(1); }
  const r = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: 'Bearer ' + key } });
  if (!r.ok) { console.log(`FAIL: OpenAI answered ${r.status}. A 401 means the key was refused.`); process.exit(1); }
  const j = await r.json();
  const ids = (j.data || []).map(m => m.id).sort();
  const chat = ids.filter(id => /^(gpt-|o\d|chatgpt-)/.test(id) && !/(realtime|audio|tts|transcribe|image|embedding|moderation|search)/.test(id));
  console.log(`${ids.length} models visible to this key. Chat-capable candidates:`);
  chat.forEach(id => console.log('  ' + id));
  console.log('\nSet OPENAI_MODEL (smart tier) and OPENAI_FAST_MODEL (fast tier) to two of these, then run npm run ai:check.');
})().catch(e => { console.log('FAIL: ' + e.message); process.exit(1); });
