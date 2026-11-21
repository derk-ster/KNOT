'use strict';
// The fictional demo profiles in a sandbox group, talking. They are sample data, not people, and
// nothing here lets them pass for one: the server picks who speaks and writes the line, every
// message is stored with kind 'demo' and shown with a Demo tag, and the local fallback builds its
// lines only from the stored demo profile (city, mode, skills, free days), so no fact about a
// fictional person is invented. This is separate from KNOT AI in lib/ai.js: that is a labeled
// assistant, these are the group's pretend members.
const { chatJson, enabled } = require('./llm');
const { checkMessage } = require('./moderate');

const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
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
// the days and the city are the profile's own stored fields.
function localReply(member, room, lastText) {
  const name = first(member);
  const skills = (member.skillLabels || []).map(s => String(s).toLowerCase());
  const skill = skills[0];
  const days = member.availabilityDays || [];
  const city = member.city || '';
  const said = (room.messages || []).filter(m => m.kind === 'demo' && m.authorName === member.name).length;
  const quoted = clip(lastText, 70);
  // The first thing a profile says is a greeting; after that it is part of the thread.
  if (!said) return `Hi, ${name} here.${skill ? ` I can help with ${skill}.` : ''} What should we start with?`;
  const ideas = [];
  if (skill) {
    ideas.push(`On "${quoted}": yes. I can help with ${skill} if we start there. Who else is in?`);
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
  ideas.push(`Good point. What is the first thing we should have done by the end of the week?`);
  ideas.push(`Count me in. Should we split this into two small steps and start with the first?`);
  ideas.push(`Who else can help with this, and what do we need from them?`);
  ideas.push(`Let us keep it simple: one small thing this week, then we look again. What should it be?`);
  // The choice moves with the newest message, the profile's own name and the line before it, so two
  // profiles answering the same message do not land on the same sentence.
  const before = [...(room.messages || [])].reverse().find(m => m.kind === 'demo');
  let h = 0;
  for (const ch of `${name}|${quoted}|${before ? before.text : ''}`) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  let pick = ideas[(said * 3 + h) % ideas.length];
  if (before && pick === before.text) pick = ideas[(ideas.indexOf(pick) + 1) % ideas.length];
  return pick;
}

const DEMO_SYSTEM = `You are a FICTIONAL demo profile in a KNOT group chat. You are sample data, not a real person, and you never claim otherwise.
Write the next chat message from the named profile: at most 2 short sentences, plain text, friendly, no markdown.
Use ONLY the facts listed about the profile (city, how they meet, skills, free days). Never invent a skill, a place, a plan, a link or a meeting. Never ask for personal details, money or a private meetup. Move the group forward by offering the one thing this profile can do, and always end with a concrete suggestion or a question the group can answer. Read the recent messages first: reply to what was just said, never repeat a sentence this profile has already used, and do not greet the room again after the first message.
Output JSON only: {"reply": string}`;

// Returns { name, text } for the demo profile that should speak next, or null when the room has
// none. Throws nothing: a missing or failing AI just falls back to the local line.
async function demoReply({ room, lastText }) {
  const member = pickSpeaker(room);
  if (!member) return null;
  let text = null;
  if (enabled()) {
    try {
      const recent = (room.messages || []).slice(-6).map(m => `${m.authorName}: ${clip(m.text, 160)}`).join('\n');
      const system = `${DEMO_SYSTEM}\n\nYou are ${member.name}. Your profile: ${facts(member)}.`;
      const ask = `Group: ${room.title}. Goal: ${clip(room.goal, 200)}.` +
        (recent ? `\nRecent messages:\n${recent}` : '') +
        `\n\nThe newest message: ${clip(lastText, 300)}\nWrite ${first(member)}'s next message.`;
      const out = await chatJson({ system, messages: [{ role: 'user', content: ask }], tier: 'fast', maxTokens: 200, feature: 'demo-reply' });
      text = clip(out && out.reply, 400) || null;
      // Model output gets the same check as a member's message: if it would be held, the plain
      // local line is used instead, so nothing held ever reaches the room.
      if (text && (await checkMessage(text).catch(() => null) || {}).action === 'hold') text = null;
    } catch { text = null; }
  }
  return { name: member.name, text: text || localReply(member, room, lastText) };
}

module.exports = { demoReply, pickSpeaker, localReply, facts };
