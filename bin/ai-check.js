#!/usr/bin/env node
'use strict';
// Live check of the OpenAI setup: one tiny call per tier, printed plainly. Run locally with your
// .env in place: `npm run ai:check`. Exit code 0 only when every configured tier answers.
require('../lib/env');
const openai = require('../lib/openai');

(async () => {
  if (!openai.enabled()) {
    console.log('FAIL: no OPENAI_API_KEY in .env or the environment.');
    process.exit(1);
  }
  const smart = await openai.ping('smart');
  const fastModel = openai.modelFor('fast');
  const fast = fastModel && fastModel !== smart.model ? await openai.ping('fast') : null;
  const line = (label, r) => {
    if (!r) return console.log(`${label}: same model as smart (${smart.model || 'none'})`);
    console.log(r.ok ? `${label}: ok  model=${r.model}  ${r.ms} ms  reply="${r.reply}"` : `${label}: FAIL  model=${r.model || 'none'}  ${r.error}`);
  };
  line('smart tier', smart);
  line('fast tier ', fast);
  const ok = smart.ok && (!fast || fast.ok);
  console.log(ok ? 'AI check passed. The app will answer with the model, not the local fallback.' : 'AI check failed. Fix the line above, then run again.');
  process.exit(ok ? 0 : 1);
})();
