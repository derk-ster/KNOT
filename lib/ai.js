'use strict';
// AI features: (1) the Finder chat that turns a short conversation into a goal for the matcher,
// (2) the small Help bot that answers "where is X?" and navigates. People shown always come from the
// local matcher and profile data, never from model text.
const { chatJson, enabled } = require('./groq');
const { SKILLS, matchGoal } = require('./match');
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
  const out = await chatJson({ system: FINDER_SYSTEM + ctx, messages, tier: 'smart', maxTokens: 500 });
  const reply = clip(out.reply, 400) || 'Tell me what you want to do and who you need.';
  const goal = clip(out.goal, 300) || null;
  if (!goal) return { reply, goal: null, result: null };
  const result = matchGoal({ goal, me: me || {}, relaxed: [] });
  return { reply, goal, result: { interpreted: result.interpreted, results: result.results, empty: result.empty } };
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
When action is a page, reply with what you are doing, like "Opening My groups." Pick the page that answers the user's question as "action" (for example "how do I find my groups?" → "groups"). Use "none" only for pure explanations like how to create a group.
Output JSON only: {"reply": string, "action": "home"|"finder"|"groups"|"profile"|"none"}`;

function localHelp(q) {
  const s = q.toLowerCase();
  const go = k => ({ action: k, reply: k === 'groups' ? 'Opening your groups.' : k === 'finder' ? 'Opening the AI Finder.' : k === 'profile' ? 'Opening your profile.' : 'Taking you home.' });
  if (/\b(my )?groups?\b|\brooms?\b|\bchats?\b(?!.*find)/.test(s) && !/create|make|start/.test(s)) return go('groups');
  if (/\bai\b|finder|chat.*find|find.*chat|talk/.test(s)) return go('finder');
  if (/profile|skill|offer|my name|availab|city/.test(s)) return go('profile');
  if (/create|make a group|start a group|checkbox|select|tick|join/.test(s)) return { action: 'none', reply: 'Find matches on Home, tick “Add to group” on people you like, then press Create group.' };
  if (/home|start|goal|back|main/.test(s)) return go('home');
  return { action: 'none', reply: 'I can take you to Home, AI Finder, My groups or your profile. What do you need?' };
}

const NEXT_RE = /\bnext\b|what now|what do i (?:do|click|press)|what should i|i(?:'m| am) stuck|\bstuck\b|where do i start|get started|how (?:do|does) (?:this|it) work/i;
async function helpTurn({ history, context }) {
  const messages = cleanHistory(history);
  if (!messages.length || messages[messages.length - 1].role !== 'user') throw Object.assign(new Error('Ask a question first.'), { status: 400 });
  const last = messages[messages.length - 1].content;
  // "What's next?" is answered from the app's own state (no AI needed): short, exact, and it highlights the control.
  const nx = context && context.next && HINTS[context.next.target] ? context.next : null;
  if (NEXT_RE.test(last) && nx) return { reply: HINTS[nx.target], action: 'none', hash: null, highlight: nx.target, source: 'app' };
  let out, source = 'ai';
  try {
    if (!enabled()) throw new Error('off');
    out = await chatJson({ system: HELP_SYSTEM, messages, tier: 'fast', maxTokens: 300 });
  } catch { out = localHelp(messages[messages.length - 1].content); source = 'local'; }
  let action = PAGES[out.action] ? out.action : 'none';
  if (action === 'none' && source === 'ai') { const l = localHelp(messages[messages.length - 1].content); if (l.action !== 'none') action = l.action; }
  let reply = clip(out.reply, 220) || 'How can I help?';
  if (action !== 'none') {
    const p = PAGES[action];
    reply = `Opening ${p.name}. To get there yourself: ${p.how}.` + (action === 'home' ? '' : ' To come back: top bar → Home.');
  }
  return { reply, action, hash: action !== 'none' ? PAGES[action].hash : null, source };
}

module.exports = { finderTurn, helpTurn, localHelp };
