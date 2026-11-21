'use strict';
// What a KNOT bot is allowed to remember about a person, and nothing more.
// Everything here comes from two honest places: the profile the member stored, and the messages
// that member typed in THIS room. Nothing is guessed, nothing is carried in from another room, and
// nothing is kept on disk: the block is built when a reply is written and thrown away after.
// The local (no AI) lines use the same block, so remembering is not a feature of the model alone.
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
const first = name => String(name || 'Someone').split(' ')[0];

// Words that say nothing about a topic. Kept short on purpose: the point is to surface what the
// person keeps talking about, not to do linguistics.
const STOP = new Set(`the and for with that this from have has had what when where which your you are was were will would could should can cant dont doesnt didnt im ive ill youre weve theyre about just like some more than them then there here they our his her its not but all any out get got make made help someone anyone everyone somebody anybody nobody people person thing things really very much also into over under after before while want need know think going gonna lets let me my our us who how why did does doing been being own same very only also too now new get put take tell said say ask asked work works working time times day days week weeks good great thanks thank hi hello hey yeah okay ok well still even back bring bring take give look come keep start finish worry worried going`.split(/\s+/).filter(Boolean));

// The words a person keeps coming back to. Derived only from what they typed, so a bot can say
// "you mentioned the poster earlier" and be right about it.
function topicsOf(texts, limit = 5) {
  const count = new Map();
  for (const t of texts || []) {
    for (const w of String(t || '').toLowerCase().match(/[a-z][a-z'-]{3,}/g) || []) {
      const k = w.replace(/['-]+$/, '');
      if (k.length < 4 || STOP.has(k)) continue;
      count.set(k, (count.get(k) || 0) + 1);
    }
  }
  return [...count.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(e => e[0]);
}

// The stored profile fields, in the words the profile itself uses.
function memberFacts(m) {
  const bits = [];
  if (!m) return '';
  if (m.city) bits.push(`in ${m.city}`);
  if (m.modeText && !/^joined member$/i.test(m.modeText)) bits.push(`meets ${String(m.modeText).toLowerCase()}`);
  const skills = (m.skillLabels || []).filter(Boolean);
  if (skills.length) bits.push(`offers ${skills.join(', ')}`);
  const days = m.availabilityDays || [];
  if (days.length) bits.push(`free ${days.map(cap).join(', ')}`);
  else if (m.availabilityText && !/not listed|unknown/i.test(m.availabilityText)) bits.push(`free ${String(m.availabilityText).toLowerCase()}`);
  return bits.join('; ');
}

// A message belongs to the person whose pid matches, using the same rule the room uses for "you":
// an account message carries authorAccountId, a guest message carries authorId.
function sameAuthor(x, pid) {
  if (!pid || !x) return false;
  if (x.authorAccountId) return 'a:' + x.authorAccountId === pid;
  return x.authorId != null && String(x.authorId) === pid;
}

// The person's own earlier messages in this room, oldest first, without repeats.
function ownMessages(room, pid, limit = 8) {
  const mine = (room && room.messages ? room.messages : []).filter(x => x && x.kind === 'user' && sameAuthor(x, pid));
  const seen = new Set();
  const out = [];
  for (const m of mine.slice(-limit * 2)) {
    const t = clip(m.text, 140);
    const k = t.toLowerCase();
    if (!t || seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out.slice(-limit);
}

// Everything a bot may know about the person asking. `me` is the room member record (name, city,
// modeText, skillLabels, availabilityDays), `pid` is that member's id in the room.
function memoryFor({ room, me, pid } = {}) {
  const said = ownMessages(room, pid);
  const name = me && me.name ? first(me.name) : 'they';
  return { name, fullName: (me && me.name) || null, facts: memberFacts(me), said, topics: topicsOf(said) };
}

// The block that goes into a prompt. Short on purpose: a long one costs tokens and gets ignored.
function memoryBlock(mem, { saidLines = 5 } = {}) {
  if (!mem) return '';
  const lines = [];
  if (mem.facts) lines.push(`About ${mem.name}: ${mem.facts}.`);
  if (mem.said.length) {
    lines.push(`What ${mem.name} has already said in this room (remember it, build on it, never ask for it again):`);
    for (const s of mem.said.slice(-saidLines)) lines.push('- ' + s);
  }
  if (mem.topics.length) lines.push(`Topics ${mem.name} keeps coming back to: ${mem.topics.join(', ')}.`);
  return lines.join('\n');
}

module.exports = { memoryFor, memoryBlock, memberFacts, ownMessages, topicsOf, sameAuthor, first };
