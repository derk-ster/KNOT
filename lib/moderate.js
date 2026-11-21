'use strict';
// Message moderation: a local prefilter that always runs, plus OpenAI's moderation endpoint when
// configured. A held message is NOT posted to the room; it is filed as an automatic report for a
// human (group owner / organizer) to review. Held content is never shown to other members.
const openai = require('./openai');

// Always-hold patterns: sexual content involving minors, direct threats, meeting-unsafety solicitation.
const HARD_PATTERNS = [
  { re: /\b(child|kid|minor|teen|underage|13|14|15|16|17)[\s\S]{0,40}\b(sex|sexual|nudes?|porn|explicit|erotic)\b/i, why: 'Sexual content involving minors' },
  { re: /\b(sex|sexual|nudes?|porn|explicit|erotic)[\s\S]{0,40}\b(child|kid|minor|teen|underage)\b/i, why: 'Sexual content involving minors' },
  { re: /\b(kill|murder|hurt|shoot|stab)\s+(you|u|him|her|them|yourself)\b/i, why: 'Threat of violence' },
  { re: /\bi('ll| will)\s+(kill|murder|hurt)\s+you\b/i, why: 'Threat of violence' },
  { re: /\b(send|share|give)\s+(me\s+)?(your\s+)?(home\s+)?address\b.{0,30}\b(alone|tonight|now|secret|don'?t tell)\b/i, why: 'Unsafe meeting pressure' },
  { re: /\bdon'?t tell (your )?(parents?|mom|dad|anyone)\b/i, why: 'Secrecy pressure (common grooming pattern)' },
  { re: /\b(wanna|want to|let'?s)\s+(meet)\b.{0,30}\b(secret|alone|no one knows|without telling)\b/i, why: 'Unsafe meeting pressure' }
];

// Attempted off-platform contact is not a hold, just discouraged; KNOT keeps contact on-platform
// so reports and blocks can work. Referral links/contact dumps get flagged for review instead.
const REVIEW_PATTERNS = [
  { re: /\b(cashapp|venmo|zelle|paypal\.me|bitcoin|btc address)\b/i, why: 'Payment solicitation' },
  { re: /https?:\/\/(?!knot-)[^\s]{12,}/i, why: 'External link' },
  { re: /\b(my|here'?s my)\s+(snap|snapchat|instagram|insta|whatsapp|telegram|kik)\b/i, why: 'Off-platform contact' }
];

async function checkMessage(text) {
  const t = String(text || '');
  for (const p of HARD_PATTERNS) if (p.re.test(t)) return { action: 'hold', reason: p.why, source: 'local', categories: [p.why] };
  const review = [];
  for (const p of REVIEW_PATTERNS) if (p.re.test(t)) review.push(p.why);
  const ai = await openai.moderate(t);
  if (ai && ai.flagged) {
    const serious = ai.categories.filter(c => /sexual\/minors|violence|self-harm|harassment\/threatening/i.test(c));
    if (serious.length) return { action: 'hold', reason: 'Content flagged as: ' + serious.join(', '), source: 'openai', categories: ai.categories };
    return { action: 'allow', review: [...new Set([...review, ...ai.categories])], reason: null, source: 'openai', categories: ai.categories };
  }
  return { action: 'allow', review, reason: null, source: review.length ? 'local' : 'none', categories: [] };
}

module.exports = { checkMessage, HARD_PATTERNS, REVIEW_PATTERNS };
