'use strict';
// The fictional demo profiles in a sandbox group, talking. They are sample data, not people, and
// nothing here lets them pass for one: the server picks who speaks and writes the line, every
// message is stored with kind 'demo' and shown with a Demo tag, and the local fallback builds its
// lines only from the stored demo profile (city, mode, skills, free days), so no fact about a
// fictional person is invented. This is separate from KNOT AI in lib/ai.js: that is a labeled
// assistant, these are the group's pretend members.
const { chatJson, enabled } = require('./llm');
const { checkMessage } = require('./moderate');
const { memoryFor, memoryBlock } = require('./memory');

const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
// Words that carry no topic, so "the line has to be about what they said" does not match on "want".
const STOPWORDS = new Set('want need have this that with from your some what should start about they them then there here will would could just like make made take help keep good point first week thing things'.split(' '));
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
// A quote cut short says so, so nobody reads a chopped word as the whole sentence.
const quote = (s, n) => {
  const full = String(s == null ? '' : s).replace(/\s+/g, ' ').trim().replace(/[\s.,;:!?]+$/, '');
  const t = clip(full, n);
  return t.length < full.length ? t.replace(/[\s.,;:!?]+$/, '') + '…' : t;
};
const first = (m) => String(m.name || 'Someone').split(' ')[0];
// Does the message ask for a thing the profile lists? "video editing" has to answer "who can edit
// the footage", so the comparison is on word stems ("editing" / "edit") and never on the whole label.
const stem = w => String(w).toLowerCase().replace(/[^a-z]/g, '');
const hasWord = (text, label) => String(label || '').toLowerCase().split(/[^a-z]+/).filter(w => w.length >= 4)
  .some(w => { const s = stem(w).replace(/(ing|ed|es|s)$/, ''); return s.length >= 3 && new RegExp(`\\b${s}`, 'i').test(text); });

// Whoever has spoken least so far gets the next turn, so one profile does not do all the talking.
function pickSpeaker(room) {
  const demos = room.demoMembers || [];
  if (!demos.length) return null;
  const said = new Map(demos.map(d => [d.name, 0]));
  for (const m of room.messages || []) {
    if (m.kind === 'demo' && said.has(m.authorName)) said.set(m.authorName, said.get(m.authorName) + 1);
  }
  return demos.slice().sort((a, b) => said.get(a.name) - said.get(b.name))[0];
}

// The whole of what a demo profile is allowed to know about itself.
function facts(member) {
  const bits = [];
  if (member.city) bits.push(`city ${member.city}`);
  if (member.modeText) bits.push(`meets ${member.modeText}`);
  if ((member.skillLabels || []).length) bits.push(`skills ${member.skillLabels.join(', ')}`);
  if (member.availabilityText) bits.push(`free ${String(member.availabilityText).toLowerCase()}`);
  return bits.join('; ') || 'no details on file';
}

// No AI configured, or the call failed: a plain line built from the stored profile. It follows the
// newest message, offers the one thing this profile can do, and suggests a next step, so a demo
// group keeps moving instead of greeting each other forever. Nothing here is invented: the skill,
// the days and the city are the profile's own stored fields, and anything about the other person is
// something they typed in this room themselves.
function localReply(member, room, lastText, mem) {
  const name = first(member);
  // "up for anything (free spirit)" is a label with a note in brackets; the sentence reads better
  // without the note, and the words before it are still the profile's own.
  const plain = s => String(s).toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').trim();
  const skills = (member.skillLabels || []).map(plain).filter(Boolean);
  const skill = skills[0];
  const days = member.availabilityDays || [];
  const city = member.city || '';
  const msgs = room.messages || [];
  const demos = msgs.filter(m => m.kind === 'demo');
  const said = demos.filter(m => m.authorName === member.name).length;
  // A greeting only opens the room, once: the first demo line anyone says. Inside a burst the
  // profiles answer the line before them, so three profiles in a row do not all introduce themselves.
  if (!said && !demos.length) return `Hi, ${name} here.${skill ? ` I can help with ${skill}.` : ''} What should we start with?`;

  const last = clip(lastText, 200);
  const lower = last.toLowerCase();
  // Whose line is being answered: the member's, or another fictional profile in the same burst.
  // Reading it the wrong way round is what makes a profile answer itself.
  const newest = msgs.length ? msgs[msgs.length - 1] : null;
  const answeringProfile = !!(newest && newest.kind === 'demo' && clip(newest.text, 200) === last);
  const lastAsk = /\?\s*$/.test(last) || /^(who|what|when|where|how|which|can|could|should|do|does|is|are|any)\b/i.test(last);
  const asksWho = /\b(who|anyone|someone|else|team|group)\b/i.test(last);
  const asksWhen = /\b(when|day|days|time|week|weekend|free|meet)\b/i.test(last);
  const asksWhere = /\b(where|place|meetup|city|park|spot|somewhere)\b/i.test(last);
  const mentioned = skills.find(s => hasWord(lower, s)) || null;
  const names = (room.demoMembers || []).map(d => first({ name: d.name }));

  const ideas = [];
  const add = s => { if (s && !ideas.includes(s)) ideas.push(s); };
  // A question gets an answer from the profile's own stored fields, not a nod: that is the whole
  // point of a group where everyone can talk. These are kept apart so a question is never answered
  // with a generic "who else is in?".
  const answers = [];
  const answer = s => { if (s && !answers.includes(s) && !ideas.includes(s)) answers.push(s); };
  if (!answeringProfile && lastAsk) {
    if (mentioned) answer(`I can take ${mentioned}. Should I start on that this week?`);
    else if (asksWho && skill) answer(`I can cover ${skill}. Who else do we still need?`);
    if (asksWhen && days.length) answer(`I am free ${days.map(cap).join(' or ')}, so that works for me. Does it work for you?`);
    if (asksWhere && city) answer(`I am in ${city}, so meeting there is easy. Is that close for you?`);
  }
  // A skill another profile has already put its hand up for is theirs: offering it again reads like
  // nobody is listening, so the skill ideas step back and the line agrees or asks instead.
  const claimed = !!(skill && demos.slice(-8).some(m => m.authorName !== member.name && hasWord(m.text, skill)));
  if (skill && !claimed) {
    add(`Good point. I can help with ${skill} if we start there. Who else is in?`);
    add(`My suggestion is we start with ${skill} and decide the rest after. Does that work?`);
    add(`That works for me. Want me to take ${skill} this week?`);
    add(`${cap(skill)} is my part, so put me down for that. What is the one thing we finish first?`);
  }
  if (claimed) {
    const owner = demos.slice(-8).reverse().find(m => m.authorName !== member.name && hasWord(m.text, skill));
    const ownerName = first({ name: owner.authorName });
    // A second skill is still this profile's to offer, so the room does not stall on one claim.
    const spare = skills.slice(1).find(s => !demos.slice(-8).some(m => m.authorName !== member.name && hasWord(m.text, s)));
    if (spare) add(`${ownerName} has ${skill} covered, so I can take ${spare}. Does that work?`);
    else add(`${ownerName} has ${skill} covered, so I can pick up something else. What is left?`);
  }
  if (days.length) {
    const free = days.map(cap).join(' or ');
    add(`I am free ${free}, so we can meet then. Should we set a time?`);
    add(`I could meet ${free}${skill ? ` and take ${skill}` : ''}. Is that too soon?`);
  }
  if (city) add(`I am in ${city}, so a meetup there works for me. Shall we pick a place?`);

  // Another profile just spoke, so answer them: agree, build on it, or answer their question.
  // Never speak for them, and never quote a line that is itself a quote or an introduction.
  if (answeringProfile && newest) {
    const who = first({ name: newest.authorName });
    const theirLine = clip(newest.text, 60).replace(/[?.!]+$/, '');
    const quotable = !/["“]|^(hi|hey|hello)\b/i.test(theirLine) &&
      !names.some(n => n !== name && theirLine.includes(n)) &&
      !demos.slice(-20).some(m => String(m.text || '').toLowerCase().includes(theirLine.toLowerCase().slice(0, 24)));
    // Answer what they actually asked, by name, from this profile's stored fields.
    if (mentioned) answer(`I can take ${mentioned}, ${who}. Should I start on that this week?`);
    else if (asksWho && skill && !claimed) answer(`I can cover ${skill}, ${who}. Who else do we still need?`);
    else if (asksWho && claimed) answer(`${who}, I can take whatever is left over. What still needs a hand?`);
    if (asksWhen && days.length) answer(`${days.map(cap).join(' or ')} works for me, ${who}. Shall we lock that in?`);
    if (asksWhere && city) answer(`${city} is easy for me, ${who}. Shall we meet there?`);
    if (skill && !claimed) add(`${who} is right. I can take ${skill}, so who does the rest?`);
    if (quotable) add(`${who} said "${quote(theirLine, 50)}". I am in on that. What is the first step?`);
    else add(`${who} makes a fair point. I am in on that. What is the first step?`);
    add(`Agreed with ${who}. Should we put a day on this before it drifts?`);
  }

  // What the member said earlier in this room, in their own words. Their line is quoted only when it
  // is a statement: quoting a question back ("You said "Who can fly it?"") answers nothing.
  if (!answeringProfile && mem && mem.said && mem.said.length) {
    const saidBefore = quote(mem.said[mem.said.length - 1], 60);
    const quoted = !/\?\s*$/.test(saidBefore) &&
      !demos.slice(-20).some(m => String(m.text || '').toLowerCase().includes(saidBefore.toLowerCase().slice(0, 24)));
    if (quoted) add(`Going back to "${saidBefore}": who else needs to agree before we start?`);
    if (quoted) add(`We never settled "${saidBefore}". Want me to take a first pass at it?`);
  }
  if (!answeringProfile && mem && mem.name && mem.name !== 'they' && !/^guest\b/i.test(mem.name)) {
    add(`Over to you, ${mem.name}: which of these do you want first?`);
  }
  add(`Good point. What is the first thing we should have done by the end of the week?`);
  add(`Count me in. Should we split this into two small steps and start with the first?`);
  add(`Who else can help with this, and what do we need from them?`);
  add(`Let us keep it simple: one small thing this week, then we look again. What should it be?`);

  // The choice moves with the newest message, the profile's own name and the line before it, so two
  // profiles answering the same message do not land on the same sentence.
  const before = demos.length ? demos[demos.length - 1] : null;
  let h = 0;
  for (const ch of `${name}|${last}|${before ? before.text : ''}`) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  const rotate = list => { const s = (said * 3 + h) % list.length; return list.slice(s).concat(list.slice(0, s)); };
  const rotated = rotate(ideas);
  // Nothing this room has just heard again, from any profile: in a burst of turns the profiles
  // answer each other, so the line two turns back matters as much as the one before it.
  const heard = new Set(demos.slice(-20).map(m => String(m.text || '').trim()));
  // Two profiles in a row saying the same sentence with one word swapped ("Want me to take video
  // editing this week?" then "Want me to take gaming this week?", or "Agreed with Maya..." then
  // "Agreed with Kai...") still reads like a machine, so the sentence is compared with the other
  // profiles' names taken out, and a candidate whose opening words the room just heard is passed over.
  const shape = s => String(s).toLowerCase()
    .replace(new RegExp(`\\b(${[name].concat(names).join('|')})\\b`, 'gi'), ' ')
    .replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
  const shapes = new Set(demos.slice(-8).map(m => shape(m.text)));
  const fresh = x => !heard.has(x) && !shapes.has(shape(x));
  // A question is answered before anything else, so the room never leaves one hanging.
  const answerFirst = rotate(answers).filter(fresh);
  let pick = answerFirst[0] || rotated.find(fresh) || rotated.find(x => !heard.has(x)) || rotated[0];
  // The line has to be about what was just said. If the pick shares no word with it, take the next
  // idea that does: a room where nobody follows the last line is what people notice first.
  if (!answers.includes(pick)) {
    // Words that carry the topic of the last line. Names and everyday verbs are left out, or
    // "works for me" would count as following the thread.
    const weak = new Set(['works', 'work', 'meet', 'meetup', 'place', 'pick', 'lock', 'sounds', 'sure',
      'right', 'count', 'split', 'keep', 'share', 'agree', 'agreed', 'take', 'taking', 'start', 'starting']);
    const words = new Set((last.toLowerCase().match(/[a-z]{4,}/g) || [])
      .filter(w => !STOPWORDS.has(w) && !weak.has(w) && !names.some(n => n.toLowerCase() === w)));
    const refers = s => [...words].some(w => s.toLowerCase().includes(w));
    if (words.size && !refers(pick)) {
      const alts = rotated.filter(x => refers(x) && fresh(x));
      if (alts.length) pick = alts[(msgs.length) % alts.length];
    }
  }
  return pick;
}

const DEMO_SYSTEM = `You are a FICTIONAL demo profile in a KNOT group chat. You are sample data, not a real person, and you never claim otherwise.
Write the next chat message from the named profile: at most 2 short sentences, plain text, friendly, no markdown.
Use ONLY the facts listed about the profile (city, how they meet, skills, free days) and what the other people in the room have actually typed. Never invent a skill, a place, a plan, a link or a meeting. Never ask for personal details, money or a private meetup.
You are part of a conversation that is already going, so read the last messages before you write:
- Answer what was just said, in your own words. Never open with a greeting after your first message.
- Other fictional profiles are in this room with you. You can answer them by name, agree with them or push back, and build on what they said, so the group talks to each other and not only to the member. Never speak for them or put words in their mouth, and never claim to be anyone but the named profile.
- Remember what the other person told the room. If they said what they want to make, or when they are free, treat it as known: build on it, bring it back up, and never ask for it again.
- Bring up one topic the group has not settled (a time, a place, who does what), or one thing that follows from what the other person said.
- Always end with a concrete suggestion or a question the other person can answer.
- Never repeat a sentence you have already used in this room.
Output JSON only: {"reply": string}`;

// Returns { name, text } for the demo profile that should speak next, or null when the room has
// none. Throws nothing: a missing or failing AI just falls back to the local line.
// `me`/`mePid` are the member who just spoke, so the profile can answer them by name and remember
// what they said earlier in the room.
async function demoReply({ room, lastText, me, mePid }) {
  const member = pickSpeaker(room);
  if (!member) return null;
  const mem = memoryFor({ room, me, pid: mePid });
  let text = null;
  if (enabled()) {
    try {
      const recent = (room.messages || []).slice(-8).map(m => `${m.authorName}: ${clip(m.text, 160)}`).join('\n');
      const mine = (room.messages || []).filter(m => m.kind === 'demo' && m.authorName === member.name).slice(-3).map(m => '- ' + clip(m.text, 140)).join('\n');
      const system = `${DEMO_SYSTEM}\n\nYou are ${member.name}. Your profile: ${facts(member)}.` +
        (mine ? `\n\nWhat you have already said in this room (do not repeat it):\n${mine}` : '');
      const block = memoryBlock(mem);
      const ask = `Group: ${room.title}. Goal: ${clip(room.goal, 200)}.` +
        (recent ? `\nRecent messages:\n${recent}` : '') +
        (block ? `\n\n${block}` : '') +
        `\n\nThe newest message: ${clip(lastText, 300)}\nWrite ${first(member)}'s next message.`;
      const out = await chatJson({ system, messages: [{ role: 'user', content: ask }], tier: 'fast', maxTokens: 220, feature: 'demo-reply' });
      text = clip(out && out.reply, 400) || null;
      // Model output gets the same check as a member's message: if it would be held, the plain
      // local line is used instead, so nothing held ever reaches the room.
      if (text && (await checkMessage(text).catch(() => null) || {}).action === 'hold') text = null;
      // A profile that says the same sentence twice is exactly what people noticed, so a repeat of
      // its own last line is dropped in favour of the local one.
      // Not its own last line again, and not a line another profile has just used either.
      const said = (room.messages || []).filter(m => m.kind === 'demo').map(m => String(m.text).toLowerCase().trim());
      if (text && said.includes(text.toLowerCase().trim())) text = null;
    } catch { text = null; }
  }
  return { name: member.name, text: text || localReply(member, room, lastText, mem) };
}

module.exports = { demoReply, pickSpeaker, localReply, facts };
