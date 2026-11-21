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
const quote = (s, n) => { const t = clip(s, n); return t.length < String(s == null ? '' : s).replace(/\s+/g, ' ').trim().length ? t + '…' : t; };
const first = (m) => String(m.name || 'Someone').split(' ')[0];

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
  const said = (room.messages || []).filter(m => m.kind === 'demo' && m.authorName === member.name).length;
  // What to answer about: a word from the message that the thread keeps returning to. Quoting a whole
  // sentence back reads like a machine; naming the topic reads like a person, so when there is no
  // topic word the line answers in its own words instead.
  const saidLower = String(lastText || '').toLowerCase();
  const subject = (mem && mem.topics || []).find(t => saidLower.includes(t)) || null;
  // The first thing a profile says is a greeting; after that it is part of the thread.
  if (!said) return `Hi, ${name} here.${skill ? ` I can help with ${skill}.` : ''} What should we start with?`;
  const ideas = [];
  if (skill) {
    if (subject) ideas.push(`On ${subject}: yes. I can help with ${skill} if we start there. Who else is in?`);
    ideas.push(`Good point. I can help with ${skill} if we start there. Who else is in?`);
    ideas.push(`My suggestion is we start with ${skill} and decide the rest after. Does that work?`);
    ideas.push(`That works for me. Want me to take ${skill} this week?`);
    ideas.push(`${cap(skill)} is my part, so put me down for that. What is the one thing we finish first?`);
  }
  if (days.length) {
    const free = days.map(cap).join(' or ');
    ideas.push(`I am free ${free}, so we can meet then. Should we set a time?`);
    ideas.push(`I could meet ${free}${skill ? ` and take ${skill}` : ''}. Is that too soon?`);
  }
  if (city) ideas.push(`I am in ${city}, so a meetup there works for me. Shall we pick a place?`);
  // What the other person said earlier in this room. Their own words, so nothing is made up, and it
  // is what makes a demo profile feel like it is following the thread rather than starting again.
  if (mem && mem.topics && mem.topics.length) {
    const topic = mem.topics[0];
    ideas.push(`You mentioned ${topic} earlier, ${mem.name}. Should I pick that up?`);
    ideas.push(`We never settled ${topic}. Want me to take a first pass at it?`);
  }
  if (mem && mem.said && mem.said.length) {
    const saidBefore = quote(mem.said[mem.said.length - 1], 60);
    ideas.push(`You said "${saidBefore}", so I would start there. What do you want me to do first?`);
    ideas.push(`Going back to "${saidBefore}": who else needs to agree before we start?`);
  }
  if (mem && mem.name && mem.name !== 'they') ideas.push(`Over to you, ${mem.name}: which of these do you want first?`);
  ideas.push(`Good point. What is the first thing we should have done by the end of the week?`);
  ideas.push(`Count me in. Should we split this into two small steps and start with the first?`);
  ideas.push(`Who else can help with this, and what do we need from them?`);
  ideas.push(`Let us keep it simple: one small thing this week, then we look again. What should it be?`);
  // The choice moves with the newest message, the profile's own name and the line before it, so two
  // profiles answering the same message do not land on the same sentence.
  const before = [...(room.messages || [])].reverse().find(m => m.kind === 'demo');
  let h = 0;
  for (const ch of `${name}|${subject || clip(lastText, 60)}|${before ? before.text : ''}`) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  const start = (said * 3 + h) % ideas.length;
  const rotated = ideas.slice(start).concat(ideas.slice(0, start));
  let pick = rotated[0];
  if (before && pick === before.text && rotated.length > 1) pick = rotated[1];
  // When a real person is in the thread, the line has to be about what they just said. If the pick
  // shares no word with their message, take the next idea that does.
  if (mem) {
    const words = new Set((clip(lastText, 140).toLowerCase().match(/[a-z]{4,}/g) || []).filter(w => !STOPWORDS.has(w)));
    const refers = s => [...words].some(w => s.toLowerCase().includes(w));
    if (words.size && !refers(pick)) {
      const alts = rotated.filter(x => refers(x) && (!before || x !== before.text));
      if (alts.length) pick = alts[(room.messages || []).length % alts.length];
    }
  }
  return pick;
}

const DEMO_SYSTEM = `You are a FICTIONAL demo profile in a KNOT group chat. You are sample data, not a real person, and you never claim otherwise.
Write the next chat message from the named profile: at most 2 short sentences, plain text, friendly, no markdown.
Use ONLY the facts listed about the profile (city, how they meet, skills, free days) and what the other people in the room have actually typed. Never invent a skill, a place, a plan, a link or a meeting. Never ask for personal details, money or a private meetup.
You are part of a conversation that is already going, so read the last messages before you write:
- Answer what was just said, in your own words. Never open with a greeting after your first message.
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
      const said = (room.messages || []).filter(m => m.kind === 'demo' && m.authorName === member.name).map(m => String(m.text).toLowerCase().trim());
      if (text && said.includes(text.toLowerCase().trim())) text = null;
    } catch { text = null; }
  }
  return { name: member.name, text: text || localReply(member, room, lastText, mem) };
}

module.exports = { demoReply, pickSpeaker, localReply, facts };
