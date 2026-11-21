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

// No AI configured, or the call failed: a plain line built from the stored profile, rotated by how
// much this profile has already said so the room does not read the same sentence twice.
function localReply(member, room) {
  const name = first(member);
  const skill = (member.skillLabels || [])[0];
  const days = member.availabilityDays || [];
  const lines = [];
  if (skill) lines.push(`Hi, ${name} here. I can take the ${skill} part. What do you want to start with?`);
  if (days.length) lines.push(`${name} here. I am free ${days.join(' or ')}, so that works for me.`);
  if (member.city) lines.push(`${name} here. I am in ${member.city} and happy to pitch in.`);
  lines.push('Count me in. What is the first thing we should do?');
  const said = (room.messages || []).filter(m => m.kind === 'demo' && m.authorName === member.name).length;
  return lines[said % lines.length];
}

const DEMO_SYSTEM = `You are a FICTIONAL demo profile in a KNOT group chat. You are sample data, not a real person, and you never claim otherwise.
Write the next chat message from the named profile: at most 2 short sentences, plain text, friendly, no markdown.
Use ONLY the facts listed about the profile (city, how they meet, skills, free days). Never invent a skill, a place, a plan, a link or a meeting. Never ask for personal details, money or a private meetup. Move the group forward by offering the one thing this profile can do.
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
  return { name: member.name, text: text || localReply(member, room) };
}

module.exports = { demoReply, pickSpeaker, localReply, facts };
