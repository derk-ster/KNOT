'use strict';
// Maps free text ("ukulele", "speedrunning", "baking sourdough") to the closest skills KNOT knows.
// Uses the AI when available, with a local keyword fallback so it never blocks the demo.
const { chatJson, enabled } = require('./groq');
const { SKILLS, SKILL_BY_ID, closestSkills } = require('./match');

const LIST = SKILLS.map(s => `${s.id}: ${s.label}`).join('\n');
const SYSTEM = `You map an activity to the closest items in KNOT's skill list. The activity can be for work, school or pure fun.
If the text is a sentence, map the main activity the person wants to do or needs ("I need a ukulele teacher" means guitar, not tutoring).
Pick up to 2 ids from this list (use "anything" only if nothing is even loosely related):
${LIST}
Output JSON only: {"ids": string[], "note": string}. "note" is one short friendly sentence, no more than 14 words, saying what you matched it to.`;

async function mapSkill(text) {
  text = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  const local = closestSkills(text);
  if (!text) return { ids: [], source: 'none' };
  if (enabled()) {
    try {
      const out = await chatJson({ system: SYSTEM, messages: [{ role: 'user', content: text }], tier: 'fast', maxTokens: 250 });
      const ids = (Array.isArray(out.ids) ? out.ids : []).filter(id => SKILL_BY_ID[id]).slice(0, 2);
      if (ids.length) return { ids, note: String(out.note || '').slice(0, 140), source: 'ai' };
    } catch { /* fall through to local rules */ }
  }
  return { ids: local, source: 'local' };
}
module.exports = { mapSkill };
