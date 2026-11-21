'use strict';
// AI features: (1) the Finder chat that turns a short conversation into a goal for the matcher,
// (2) the small Help bot that answers "where is X?" and navigates. People shown always come from the
// local matcher and profile data, never from model text.
const { chatJson, enabled, status } = require('./llm');
const { SKILLS, SKILL_BY_ID, matchGoal, CITIES, DAYS } = require('./match');
const { HINTS } = require('./guide');

const SKILL_LIST = SKILLS.map(s => s.label).join(', ');
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
function cleanHistory(h) {
  return (Array.isArray(h) ? h : []).slice(-8).map(m => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', content: clip(m && m.content, 500) })).filter(m => m.content);
}

const FINDER_SYSTEM = `You are the KNOT Finder, a tiny chat that helps someone say what they want to do so KNOT can match them with people.
People can want help with work, school or just for fun. KNOT can match on these skills and hobbies: ${SKILL_LIST}. It also understands a city, "online" or "in person", and weekdays.
Rules: reply in at most 2 short sentences. Never name or invent people.
As soon as the user has said which skill they need (even with no city or day), STOP asking and set "goal" to one first-person sentence built ONLY from facts the user stated (example: "I can shoot a short film in Plano this Saturday and need someone who can edit."); your reply then just says you are checking matches. Do not ask about online vs in person unless the user raised it.
Only if the needed skill is still unknown, ask ONE short question (at most 2 questions in the whole chat) and set goal to null.
Output JSON only: {"reply": string, "goal": string|null}`;

async function finderTurn({ history, me }) {
  const messages = cleanHistory(history);
  if (!messages.length || messages[messages.length - 1].role !== 'user') throw Object.assign(new Error('Say something first.'), { status: 400 });
  const ctx = me && me.skills && me.skills.length ? `\n(The user offers: ${me.skills.join(', ')}.)` : '';
  const out = await chatJson({ system: FINDER_SYSTEM + ctx, messages, tier: 'smart', maxTokens: 500, feature: 'finder' });
  const reply = clip(out.reply, 400) || 'Tell me what you want to do and who you need.';
  const goal = clip(out.goal, 300) || null;
  if (!goal) return { reply, goal: null, result: null };
  const result = matchGoal({ goal, me: me || {}, relaxed: [] });
  return { reply, goal, result: { interpreted: result.interpreted, results: result.results, empty: result.empty } };
}

// ---- Structured goal interpretation (the "AI reading" behind a match) ----
// The LLM only maps the user's own words onto KNOT's fixed vocabularies. matchGoal validates every
// field and keeps whatever the local rules already found, so a hallucinated city or skill cannot
// enter the constraints. The response tells the user exactly which fields came from the AI reading.
const GOAL_SYSTEM = `You read a person's goal for KNOT and map ONLY what they actually said onto fixed vocabularies.
Skills (use exact ids, up to 3 needs and 2 offers): ${SKILLS.map(s => s.id + ' = ' + s.label).join('; ')}.
Cities (exact): ${CITIES.join(', ')}. mode: "online" or "in-person" (only if stated). days (subset of): ${DAYS.join(', ')}.
Rules: never invent a skill, city, mode or day they did not say. If unsure, leave the field empty.
Output JSON only: {"needs": string[], "offers": string[], "city": string, "mode": string, "days": string[]}`;

async function interpretGoal(goal, me) {
  goal = String(goal || '').slice(0, 500);
  if (!goal.trim()) throw Object.assign(new Error('Write a goal first.'), { status: 400 });
  let out = null;
  if (enabled()) {
    const ctx = me && me.skills && me.skills.length ? `\nThe person already offers: ${me.skills.join(', ')}.` : '';
    try { out = await chatJson({ system: GOAL_SYSTEM + ctx, messages: [{ role: 'user', content: goal }], tier: 'fast', maxTokens: 300, feature: 'interpret' }); } catch { out = null; }
  }
  const result = matchGoal({ goal, me: me || {}, relaxed: [], aiParsed: out });
  return { interpreted: result.interpreted, results: result.results, empty: result.empty, notice: result.notice, matcher: out ? 'ai-assisted local rules' : 'local-rules' };
}

// ---- In-room AI assistant (group AI toggle) ----
// ai_mode 'off': never runs. 'on-demand': runs when a member asks for it (the room's /ai command,
// which the client turns into askAi on the message before it posts).
// 'on': runs on every message. Answers from the room's real member profiles only; it is labeled
// "KNOT AI" in the room and never speaks as a human member.
const ROOM_SYSTEM = `You are KNOT AI, a helper inside a KNOT group room. You see the group's goal and its members' REAL stored profiles (name, city, mode, skills, availability). You are not a person and never pretend to be one.
Rules: answer in at most 3 short sentences, plain text. Use only the profiles given; if the profiles cannot answer it, say what is missing. Never invent availability, skills or people. If someone asks to meet in person, remind them to meet in public places and tell someone where they are going.
Output JSON only: {"reply": string}`;

async function roomAssistant({ room, meProfile, question, history }) {
  if (room.aiMode === 'off') throw Object.assign(new Error('AI is off for this group.'), { status: 403 });
  const q = clip(question, 300);
  if (!q) throw Object.assign(new Error('Ask something first.'), { status: 400 });
  const lines = [];
  lines.push(`Group: ${room.title}. Goal: ${clip(room.goal, 200)}`);
  for (const m of room.members) lines.push(`- ${m.name}: city ${m.city || 'unknown'}, ${m.modeText}, skills ${m.skillLabels.join(', ') || 'none listed'}, availability ${m.availabilityText}.`);
  for (const d of room.demoMembers) lines.push(`- ${d.name} (fictional demo profile): city ${d.city || 'unknown'}, ${d.modeText || ''}, skills ${(d.skillLabels || []).join(', ') || 'none listed'}, availability ${d.availabilityText || 'unknown'}.`);
  const recent = cleanHistory(history).slice(-6).map(m => `${m.role === 'assistant' ? 'KNOT AI' : 'member'}: ${m.content}`).join('\n');
  const system = ROOM_SYSTEM + '\n\n' + lines.join('\n') + (recent ? '\nRecent messages:\n' + recent : '');
  const out = await chatJson({ system, messages: [{ role: 'user', content: q }], tier: 'fast', maxTokens: 350, feature: 'room-assistant' });
  return { reply: clip(out.reply, 600) || 'I could not come up with an answer right now.' };
}

// ---- Help bot ----
const PAGES = {
  home: { hash: '#/', name: 'Home', how: 'top bar → Home' },
  finder: { hash: '#/finder', name: 'AI Finder', how: 'top bar → AI Finder' },
  groups: { hash: '#/groups', name: 'My groups', how: 'top bar → My groups' },
  profile: { hash: null, name: 'your profile', how: 'top bar → your name or the round avatar button' }
};
const HELP_SYSTEM = `You are KNOT's tiny help bot. Be extremely concise: ONE short sentence (max 20 words). Never use markdown.
KNOT lets people describe a goal, see up to three explained matches, tick people ("Add to group"), press "Create group", and chat in the group room.
Keep a relaxed, friendly tone; this is a fun demo.
Pages: "home" (type a goal, press Find my people; tap "You offer" to change what you offer), "finder" (AI Finder: a short chat that finds people for you), "groups" (My groups: every group you created, open one to chat), "profile" (your name, skills, free days, city).
Answer the actual question in your own words. Pick the page that answers it as "action" (for example "how do I find my groups?" → "groups"). Use "none" for pure explanations like how to create a group.
Output JSON only: {"reply": string, "action": "home"|"finder"|"groups"|"profile"|"none"}`;
// Guests can reach Home and the sign-in form and nothing else, so the bot is told that up front
// rather than sending them to a page that will only ask them to sign in.
const GUEST_NOTE = `\nThe person using this is NOT signed in. They can use Home and the sign-in form. Discover, the AI Finder, My groups and a profile need a free account, so when they ask for those, say so and point at the Sign in button in the top bar.`;

const MEMBER_ONLY = new Set(['finder', 'groups', 'profile']);
// The answers used when no model is configured or the model call fails. Each topic gets its own
// wording, and a guest is told what a guest can actually do, so the same sentence never comes back
// for every question.
const GUEST_NEEDS_ACCOUNT = {
  groups: 'Your groups live in My groups, and that needs a free account. Press Sign in in the top bar.',
  finder: 'The AI Finder needs a free account. Sign in from the top bar and it opens right up.',
  profile: 'Your skills, free days and city are on your profile, which needs a free account. Sign in from the top bar.'
};
function localHelp(q, signedIn = true) {
  const s = String(q || '').toLowerCase();
  const go = k => ({ action: k, reply: k === 'groups' ? 'Opening your groups.' : k === 'finder' ? 'Opening the AI Finder.' : k === 'profile' ? 'Opening your profile.' : 'Taking you home.' });
  const guest = k => ({ action: 'none', reply: GUEST_NEEDS_ACCOUNT[k], highlight: 'auth' });
  if (/\b(my )?groups?\b|\brooms?\b|\bchats?\b(?!.*find)/.test(s) && !/create|make|start/.test(s)) return signedIn ? go('groups') : guest('groups');
  if (/\bai\b|finder|chat.*find|find.*chat|talk/.test(s)) return signedIn ? go('finder') : guest('finder');
  if (/profile|skill|offer|my name|availab|city/.test(s)) return signedIn ? go('profile') : guest('profile');
  if (/sign in|sign up|log ?in|account|register/.test(s)) return signedIn ? { action: 'none', reply: 'You are already signed in. Your name in the top bar opens your profile.' } : { action: 'none', reply: 'Press Sign in in the top bar. You can sign in or create a free account from there.', highlight: 'auth' };
  if (/invite|share|code|link/.test(s)) return { action: 'none', reply: 'Open the group and press Copy next to the invite link. Anyone with it can join.' };
  if (/safe|meet|public|report|block/.test(s)) return { action: 'none', reply: 'Meet in public places the first time, and report or block anyone from their profile.' };
  if (/create|make a group|start a group|checkbox|select|tick|join/.test(s)) return { action: 'none', reply: 'Find matches on Home, tick “Add to group” on people you like, then press Create group.' };
  if (/home|start|goal|back|main/.test(s)) return go('home');
  if (/hello|hi\b|hey|thanks|thank you/.test(s)) return { action: 'none', reply: 'Hi. Ask me where something is, and I will point at it on the page.' };
  return { action: 'none', reply: 'I am not sure about that one. I can explain where groups, the AI Finder, your profile or the sign-in button are.' };
}

const NEXT_RE = /\bnext\b|what now|what do i (?:do|click|press)|what should i|i(?:'m| am) stuck|\bstuck\b|where do i start|get started|how (?:do|does) (?:this|it) work/i;
async function helpTurn({ history, context, signedIn }) {
  const messages = cleanHistory(history);
  if (!messages.length || messages[messages.length - 1].role !== 'user') throw Object.assign(new Error('Ask a question first.'), { status: 400 });
  const last = messages[messages.length - 1].content;
  const guest = signedIn === false;
  // "What's next?" is answered from the app's own state (no AI needed): short, exact, and it highlights the control.
  const nx = context && context.next && HINTS[context.next.target] ? context.next : null;
  if (NEXT_RE.test(last) && nx) return { reply: HINTS[nx.target], action: 'none', hash: null, highlight: nx.target, source: 'app' };
  let out, source = 'ai';
  try {
    if (!enabled()) throw new Error('off');
    out = await chatJson({ system: HELP_SYSTEM + (guest ? GUEST_NOTE : ''), messages, tier: 'fast', maxTokens: 300, feature: 'help' });
  } catch { out = localHelp(last, !guest); source = 'local'; }
  let action = PAGES[out.action] ? out.action : 'none';
  if (action === 'none' && source === 'ai') { const l = localHelp(last, !guest); if (l.action !== 'none') action = l.action; }
  let reply = clip(out.reply, 220) || 'How can I help?';
  // The bot's own words are the answer. Navigation is offered next to them, never written over them,
  // so two questions never get the same canned line back.
  if (guest && MEMBER_ONLY.has(action)) {
    action = 'none';
    reply += ' That needs a free account: Sign in in the top bar.';
  }
  const highlight = action !== 'none' ? action
    : (out.highlight === 'auth' || (out.highlight && HINTS[out.highlight]) ? out.highlight : null);
  return { reply, action, hash: action !== 'none' ? PAGES[action].hash : null, highlight, source };
}

module.exports = { finderTurn, helpTurn, localHelp, interpretGoal, roomAssistant, status };
