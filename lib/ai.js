'use strict';
// AI features: (1) the Finder chat that turns a short conversation into a goal for the matcher,
// (2) the small Help bot that answers "where is X?" and navigates. People shown always come from the
// local matcher and profile data, never from model text.
const { chatJson, enabled, status } = require('./llm');
const { SKILLS, SKILL_BY_ID, matchGoal, CITIES, DAYS } = require('./match');
const { HINTS } = require('./guide');
const { memoryFor, memoryBlock, first } = require('./memory');
const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);

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
const ROOM_SYSTEM = `You are KNOT AI, a helper inside a KNOT group room. You are not a person and never pretend to be one.
You are joining a conversation that is already going, so read it before you answer.
Rules:
- Answer the newest message first, in at most 3 short sentences, plain text, no markdown.
- Remember what people told you in this room and use it. If someone said they can edit video, or are free on Saturday, that is now a fact: build on it, and never ask for it again.
- Refer to what was just said so the reply belongs to this thread, then push it one step forward.
- Bring up one thing the group has not settled yet (a time, a place, who does what), or one topic that follows from what members said.
- End with one concrete question the group can answer, or one concrete suggestion. Never end with "let me know".
- Never repeat a sentence you have already used in this room, and never give the same answer twice.
- Use only the profiles and messages given. Never invent availability, skills, places or people. If something is missing, say what is missing.
- If someone asks to meet in person, remind them to meet in public places and tell someone where they are going.
- You may add ONE more short message as "follow" when you have a concrete suggestion, idea or question that adds to the answer, which is what the group is asking for when they ask for more, for a plan or for ideas. Leave "follow" null when the answer says everything. Never use it to repeat or rephrase the reply, and never to greet.
Output JSON only: {"reply": string, "follow": string|null}`;

// Normalised text, for spotting a reply that is the same as one already in the room.
const flat = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// The answer used when no model is configured or the call fails. It is not a canned "sorry": it is
// built from the room's stored profiles and the person's own earlier messages, so the helper still
// answers the question and still moves the group on. /ai must never leave the room with silence.
function localRoomReply({ room, me, pid, question, memory }) {
  const mem = memory || memoryFor({ room, me, pid });
  const q = String(question || '').toLowerCase();
  const people = [...(room.members || []), ...(room.demoMembers || [])].filter(m => m && m.name);
  const skillOf = m => (m.skillLabels || []).filter(Boolean).map(s => String(s).toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean);
  const named = m => first(m.name);
  // `direct` answers the question that was actually asked, from stored fields only. When one of
  // those fits it wins, so "who can help?" never comes back with a topic instead of a name.
  const direct = [];
  const who = people.find(m => skillOf(m).some(s => s.split(' ')[0].length > 3 && q.includes(s.split(' ')[0])));
  if (who) {
    const skill = skillOf(who)[0];
    direct.push(`${named(who)} lists ${skill}, so that part is covered. What should the first small step be?`);
    direct.push(`For that, ${named(who)} is the one who offers ${skill}. Shall we put ${named(who)} on it this week?`);
  }
  const free = people.filter(m => (m.availabilityDays || []).length);
  if (/when|time|day|meet|schedul|week|availab/.test(q) && free.length) {
    const p = free[0];
    direct.push(`${named(p)} is free ${p.availabilityDays.map(cap).join(', ')}, so that is the window to aim for. Does it suit you?`);
  }
  if (/who|help|need|someone|anyone|else|team|group/.test(q)) {
    const list = people.filter(m => skillOf(m).length).slice(0, 3).map(m => `${named(m)} (${skillOf(m)[0]})`);
    if (list.length) direct.push(`From the profiles here: ${list.join(', ')}. Which of those do you want first?`);
    else direct.push(`The people in this group have no skills listed yet, so tell me what you need and I will say who fits. What do you need?`);
  }
  const goal = clip(room.goal, 90);
  if (goal && /first|next|start|step|plan|do\b|stuck|idea|suggest/.test(q)) {
    direct.push(`The group's goal is "${goal}". Which single step gets you closest this week?`);
    direct.push(`For "${goal}", I would pick one small piece and name who does it. Which piece?`);
  }
  // `open` is what the helper brings up when the question was open rather than a request for a fact:
  // the person's own earlier words, the topic they keep returning to, and the goal.
  const open = [];
  if (mem.topics.length) open.push(`You mentioned ${mem.topics[0]} earlier, ${mem.name}. Should we make that this week's step?`);
  if (mem.said.length) open.push(`You already said "${clip(mem.said[mem.said.length - 1], 70)}", so I would keep that as the plan. What is still missing from it?`);
  if (goal) open.push(`The group's goal is "${goal}". Which single step gets us closest this week?`);
  open.push('Pick the smallest thing you can finish this week and name who does it. Which one is it?');
  open.push('Tell me the goal in one line and I will turn it into steps. What is the goal?');
  // Vary the choice, and never repeat the last thing KNOT AI said: a line it already used is taken
  // out of the pool before the pick, and if that empties the direct answers the open ones are used.
  const last = [...(room.messages || [])].reverse().find(m => m.kind === 'assistant');
  const fresh = list => list.filter(x => !(last && flat(x) === flat(last.text)));
  let ideas = fresh(direct.length ? direct : open);
  if (!ideas.length) ideas = fresh(open);
  if (!ideas.length) ideas = open;
  const said = (room.messages || []).filter(m => m.kind === 'assistant').length;
  let h = 0;
  for (const ch of `${q}|${mem.name}|${last ? last.text : ''}`) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return ideas[(said + h) % ideas.length];
}

// Asking for more is asking for another message, not a longer one. Without a model the helper still
// adds one concrete suggestion, built from the room's stored facts, so "/plan", "what else" and
// "give me ideas" get a second line to work with instead of the same answer said again.
const MORE_RE = /\bmore\b|what else|anything else|suggest|idea|ideas|plan|next step|steps|advice|recommend|elaborate|go on/i;
function localRoomFollow({ room, me, pid, question, memory, reply }) {
  if (!MORE_RE.test(String(question || ''))) return null;
  const mem = memory || memoryFor({ room, me, pid });
  const people = [...(room.members || []), ...(room.demoMembers || [])].filter(m => m && m.name);
  const skillOf = m => (m.skillLabels || []).filter(Boolean).map(s => String(s).toLowerCase().replace(/\s*\([^)]*\)\s*$/, '').trim()).filter(Boolean);
  const skilled = people.filter(m => skillOf(m).length);
  const free = people.filter(m => (m.availabilityDays || []).length);
  const ideas = [];
  if (skilled.length) ideas.push(`${first(skilled[0].name)} could take ${skillOf(skilled[0])[0]} first. Shall I put that at the top of the plan?`);
  if (free.length) ideas.push(`Aim for ${free[0].availabilityDays.map(cap).join(' or ')}: that is when ${first(free[0].name)} is free. Does that work?`);
  const goal = clip(room.goal, 80);
  if (goal) ideas.push(`For "${goal}", name one small piece and who does it. Which piece is first?`);
  ideas.push('One small step first, then the next. What is the smallest thing you can finish this week?');
  const last = [...(room.messages || [])].reverse().find(m => m.kind === 'assistant');
  const fresh = ideas.filter(x => flat(x) !== flat(reply) && !(last && flat(x) === flat(last.text)));
  if (!fresh.length) return null;
  return fresh[(String(question || '').length + String(mem.name || '').length) % fresh.length];
}

async function roomAssistant({ room, me, mePid, question, history }) {
  if (room.aiMode === 'off') throw Object.assign(new Error('AI is off for this group.'), { status: 403 });
  const q = clip(question, 300);
  if (!q) throw Object.assign(new Error('Ask something first.'), { status: 400 });
  const mem = memoryFor({ room, me, pid: mePid });
  const lines = [];
  lines.push(`Group: ${room.title}. Goal: ${clip(room.goal, 200)}`);
  for (const m of room.members || []) lines.push(`- ${m.name}: city ${m.city || 'unknown'}, ${m.modeText}, skills ${(m.skillLabels || []).join(', ') || 'none listed'}, availability ${m.availabilityText}.`);
  for (const d of room.demoMembers || []) lines.push(`- ${d.name} (fictional demo profile): city ${d.city || 'unknown'}, ${d.modeText || ''}, skills ${(d.skillLabels || []).join(', ') || 'none listed'}, availability ${d.availabilityText || 'unknown'}.`);
  const block = memoryBlock(mem);
  if (block) lines.push('\n' + block);
  // The thread itself, with who said what, so the answer belongs to the conversation.
  const thread = (room.messages || []).slice(-10).map(m => `${m.kind === 'assistant' ? 'KNOT AI' : (m.authorName || 'member')}: ${clip(m.text, 180)}`).join('\n')
    || cleanHistory(history).slice(-6).map(m => `${m.role === 'assistant' ? 'KNOT AI' : 'member'}: ${m.content}`).join('\n');
  if (thread) lines.push('\nThe conversation so far:\n' + thread);
  const mine = (room.messages || []).filter(m => m.kind === 'assistant').slice(-4).map(m => '- ' + clip(m.text, 160)).join('\n');
  if (mine) lines.push(`\nWhat you have already said here (do not repeat it, build on it):\n${mine}`);
  lines.push(`\n${mem.fullName ? mem.fullName : 'The member'} now says: ${q}`);
  lines.push('Write KNOT AI\'s reply.');
  const system = ROOM_SYSTEM + '\n\n' + lines.join('\n');
  let reply = null, follow = null, source = 'local';
  const before = (room.messages || []).filter(m => m.kind === 'assistant').map(m => flat(m.text));
  if (enabled()) {
    try {
      // The helper is asked to be the smartest voice in the room: a member asked it something on
      // purpose, so it gets the bigger model rather than the cheap one.
      const out = await chatJson({ system, messages: [{ role: 'user', content: q }], tier: 'smart', maxTokens: 400, feature: 'room-assistant' });
      const got = clip(out && out.reply, 600);
      // A model that repeats itself is worse than the local answer, so a repeat is dropped.
      if (got && !before.includes(flat(got))) {
        reply = got; source = 'ai';
        // The helper may add one more message when it has something to add. It is held to the same
        // rule as the answer: never the same thing twice, and never a second greeting.
        const extra = clip(out && out.follow, 300);
        if (extra && !before.includes(flat(extra)) && flat(extra) !== flat(got)) follow = extra;
      }
    } catch { reply = null; }
  }
  if (!reply) {
    reply = localRoomReply({ room, me, pid: mePid, question: q, memory: mem });
    follow = localRoomFollow({ room, me, pid: mePid, question: q, memory: mem, reply });
  }
  return { reply, follow, source };
}

// ---- Help bot ----
// Every place the help bot can send someone. `hash` is the route it opens, `dialog` a panel that
// opens over the page, and `name` is how the destination reads inside a sentence.
const PAGES = {
  home: { hash: '#/', name: 'Home' },
  discover: { hash: '#/discover', name: 'Discover' },
  finder: { hash: '#/finder', name: 'the AI Finder' },
  groups: { hash: '#/groups', name: 'My groups' },
  profile: { hash: null, dialog: 'profile', name: 'your profile' }
};
// A question that asks where something is, or asks to be taken to it, is a request to be moved:
// the answer opens the page. The same page named in a how-to question is only offered as a link.
const NAV_RE = /\btake me\b|\bbring me\b|\bsend me\b|\bget me\b|\bwhere\b|\bopen (?:my|the|up)\b|\bgo(?:ing)? to\b|\bshow me\b|\bnavigate\b|\bjump to\b|\bi want to (?:see|go|open)\b/i;
const HELP_SYSTEM = `You are KNOT's tiny help bot. Be extremely concise: ONE short sentence (max 20 words). Never use markdown.
KNOT lets people describe a goal, see up to three explained matches, tick people ("Add to group"), press "Create group", and chat in the group room.
Keep a relaxed, friendly tone; this is a fun demo.
Pages: "home" (type a goal, press Find my people; tap "You offer" to change what you offer), "discover" (public groups and other members), "finder" (AI Finder: a short chat that finds people for you), "groups" (My groups: every group you created, open one to chat), "profile" (your name, skills, free days, city).
Answer the actual question in your own words. Pick the page that answers it as "action" (for example "how do I find my groups?" → "groups"). Use "none" for pure explanations like how to create a group.
When they ask to be taken somewhere ("take me to my groups", "where is my profile"), still answer in your own words and set that page: KNOT opens it for them.
If they name one of their own groups, put its exact title in "group" and use "groups" as the action. Leave "group" null otherwise.
Output JSON only: {"reply": string, "action": "home"|"discover"|"finder"|"groups"|"profile"|"none", "group": string|null}`;
// Guests can reach Home and the sign-in form and nothing else, so the bot is told that up front
// rather than sending them to a page that will only ask them to sign in.
const GUEST_NOTE = `\nThe person using this is NOT signed in. They can use Home and the sign-in form. Discover, the AI Finder, My groups and a profile need a free account, so when they ask for those, say so and point at the Sign in button in the top bar.`;

const MEMBER_ONLY = new Set(['discover', 'finder', 'groups', 'profile']);

// A member can ask for one of their own groups by name ("take me to the camping group"), so the
// titles they own are matched before any page is: that question is about a room, not the list of
// rooms. A title only counts when the whole title appears, or when at least half its meaningful
// words do and the question is a request to go somewhere, so "who can help me film in Plano?" never
// opens a group called "Plano film crew".
const TITLE_NOISE = new Set(['the', 'and', 'for', 'with', 'our', 'group', 'groups', 'chat', 'room', 'crew', 'team']);
const titleWords = s => (String(s || '').toLowerCase().match(/[a-z0-9]{3,}/g) || []).filter(w => !TITLE_NOISE.has(w));
function findGroup(q, groups, partial = true) {
  const text = String(q || '').toLowerCase();
  if (!text || !Array.isArray(groups)) return null;
  let best = null;
  for (const g of groups) {
    if (!g || !g.id || !g.title) continue;
    const title = String(g.title).toLowerCase();
    const w = titleWords(g.title);
    const hit = w.filter(x => text.includes(x)).length;
    const exact = title.length > 2 && text.includes(title);
    const score = w.length ? hit / w.length : 0;
    if (!exact && !(partial && hit && score >= 0.5)) continue;
    if (!best || (exact && !best.exact) || (exact === best.exact && score > best.score)) best = { g, exact, score };
  }
  return best ? best.g : null;
}
// The model names a group by its title; a local answer already carries the group it matched.
const groupFrom = (val, groups) => !val ? null
  : (typeof val === 'object' ? (groups.find(g => g.id === String(val.id)) || null) : findGroup(val, groups));

// The answers used when no model is configured or the model call fails. Every topic carries several
// phrasings, and the same question asked again gets the next one, so the bot never answers two
// questions with the same sentence. `member` topics are the ones a guest cannot open.
const HELP_ANSWERS = [
  {
    test: /\b(my )?groups?\b|\brooms?\b|\bchats?\b(?!.*find)/, unless: /create|make|start/, member: true, action: 'groups',
    say: ['Opening your groups.', 'Your groups are in My groups, so I will take you there.', 'Everything you made or joined lives in My groups. Opening it now.'],
    guestSay: [
      'Your groups live in My groups, and that needs a free account. Press Sign in in the top bar.',
      'My groups needs a free account, so sign in from the top bar first and it is all there.',
      'To see your groups you need a free account. Sign in is the button in the top bar.'
    ]
  },
  {
    test: /\bai\b|finder|chat.*find|find.*chat|talk/, member: true, action: 'finder',
    say: ['Opening the AI Finder.', 'The AI Finder is the chat that finds people for you. Taking you there.', 'You describe what you want to do and the AI Finder does the looking. Opening it.'],
    guestSay: [
      'The AI Finder needs a free account. Sign in from the top bar and it opens right up.',
      'The AI Finder is for members, so it needs a free account. Sign in from the top bar.',
      'That one needs a free account too. Press Sign in in the top bar and the AI Finder opens.'
    ]
  },
  {
    test: /discover|explore|browse|public group|other group|see who is (?:on|here)/, member: true, action: 'discover',
    say: ['Opening Discover.', 'Discover is where the public groups and other members are. Taking you there.', 'Opening Discover so you can see what is going on.'],
    guestSay: [
      'Discover is for members, so it needs a free account. Press Sign in in the top bar.',
      'Public groups open up once you have a free account. Sign in from the top bar.',
      'To browse Discover you need a free account. Sign in is the button in the top bar.'
    ]
  },
  {
    test: /profile|skill|offer|my name|availab|city/, member: true, action: 'profile',
    say: ['Opening your profile.', 'Your skills, free days and city are on your profile. Taking you there.', 'Your profile is where you set what you offer and when you are free. Opening it.'],
    guestSay: [
      'Your skills, free days and city are on your profile, which needs a free account. Sign in from the top bar.',
      'Your profile needs a free account. Sign in from the top bar and it is yours to fill in.',
      'A profile needs a free account. Sign in in the top bar and you can add skills, days and a city.'
    ]
  },
  {
    test: /sign in|sign up|signin|log ?in|account|register/,
    say: ['You are already signed in. Your name in the top bar opens your profile.', 'You are signed in already, so nothing to do there. The top bar has every page.'],
    guestSay: ['Press Sign in in the top bar. You can sign in or create a free account from there.', 'Sign in is the button in the top bar, and it also creates a free account.'],
    highlight: 'auth'
  },
  {
    test: /invite|share|code|link/,
    say: ['Open the group and press Copy next to the invite link. Anyone with it can join.', 'Every group has an invite link. Copy it from the group and send it to whoever should join.']
  },
  {
    test: /safe|meet|public|report|block/,
    say: ['Meet in public places the first time, and report or block anyone from their profile.', 'Pick a public place for a first meet, and use Report or Block on a profile if something feels off.']
  },
  {
    test: /create|make a group|start a group|checkbox|select|tick|join/,
    say: ['Find matches on Home, tick “Add to group” on people you like, then press Create group.', 'Match yourself on Home, add the people you want, and press Create group. That opens the chat.']
  },
  {
    test: /home|start|goal|back|main/, action: 'home',
    say: ['Taking you home.', 'Home is where you type a goal. Opening it.', 'Opening Home, where a goal turns into matches.']
  },
  {
    test: /hello|hi\b|hey|thanks|thank you/,
    say: ['Hi. Ask me where something is, and I will point at it on the page.', 'Hello. Ask me where a page or a button is and I will take you to it.', 'Hey. I can find the page you want or tell you the next step.']
  }
];
// The last line of defence: still varied, so the bot never repeats itself even for a question it
// does not recognise.
const HELP_FALLBACK = [
  'I am not sure about that one. I can explain where groups, the AI Finder, your profile or the sign-in button are.',
  'I did not catch that. Try me on groups, the AI Finder, your profile, invites or safety.',
  'That one is beyond me. I am best at finding pages: Home, My groups, the AI Finder and your profile.'
];
function localHelp(q, signedIn = true, opts = {}) {
  const s = String(q || '').toLowerCase();
  const turn = Math.abs(Number(opts.turn) || 0);
  const avoid = String(opts.avoid || '');
  const choose = (list) => {
    if (!list || !list.length) return '';
    let pick = list[turn % list.length];
    if (avoid && pick === avoid && list.length > 1) pick = list[(turn + 1) % list.length];
    return pick;
  };
  // One of their own groups, asked for by name, comes before any page: "take me to the camping
  // group" is about one room, and My groups would be the wrong place to land.
  const group = signedIn === false ? null : findGroup(q, opts.groups, NAV_RE.test(s));
  if (group) {
    return { action: 'room', group, reply: choose([`Opening ${group.title}.`, `Taking you to ${group.title}.`, `${group.title} is opening now.`]) };
  }
  for (const t of HELP_ANSWERS) {
    if (!t.test.test(s)) continue;
    if (t.unless && t.unless.test(s)) continue;
    // A guest gets the guest wording for every topic that has one, and it varies the same way.
    const list = signedIn === false && t.guestSay ? t.guestSay : t.say;
    if (t.member && !signedIn) return { action: 'none', reply: choose(list), highlight: 'auth' };
    const out = { action: t.action || 'none', reply: choose(list) };
    if (t.highlight) out.highlight = t.highlight;
    return out;
  }
  return { action: 'none', reply: choose(HELP_FALLBACK) };
}

const NEXT_RE = /\bnext\b|what now|what do i (?:do|click|press)|what should i|i(?:'m| am) stuck|\bstuck\b|where do i start|get started|how (?:do|does) (?:this|it) work/i;
async function helpTurn({ history, context, signedIn }) {
  const messages = cleanHistory(history);
  if (!messages.length || messages[messages.length - 1].role !== 'user') throw Object.assign(new Error('Ask a question first.'), { status: 400 });
  const last = messages[messages.length - 1].content;
  const guest = signedIn === false;
  // What the bot has already said in this conversation, so it never answers with a line it used.
  const said = messages.filter(m => m.role === 'assistant').map(m => m.content);
  const lastSaid = said.length ? said[said.length - 1] : '';
  const turn = said.length;
  // "What's next?" is answered from the app's own state (no AI needed): short, exact, and it highlights the control.
  const nx = context && context.next && HINTS[context.next.target] ? context.next : null;
  if (NEXT_RE.test(last) && nx) return { reply: HINTS[nx.target], action: 'none', hash: null, highlight: nx.target, source: 'app' };
  // The member's own groups, so "take me to the camping group" can open that room and the model can
  // name a group it recognises instead of sending them to the list.
  const groups = (context && Array.isArray(context.groups) ? context.groups : []).slice(0, 40)
    .filter(g => g && g.id && g.title).map(g => ({ id: String(g.id), title: clip(g.title, 80) }));
  let out, source = 'ai';
  try {
    if (!enabled()) throw new Error('off');
    const system = HELP_SYSTEM + (guest ? GUEST_NOTE : '') +
      (groups.length ? `\nTheir groups: ${groups.map(g => g.title).join('; ')}.` : '');
    out = await chatJson({ system, messages, tier: 'fast', maxTokens: 300, feature: 'help' });
  } catch { out = localHelp(last, !guest, { turn, avoid: lastSaid, groups }); source = 'local'; }
  let action = PAGES[out.action] ? out.action : 'none';
  let group = guest ? null : groupFrom(out.group, groups);
  if (action === 'none' && !group && source === 'ai') {
    const l = localHelp(last, !guest, { turn, avoid: lastSaid, groups });
    if (l.group) group = l.group;
    else if (l.action !== 'none') action = l.action;
  }
  let reply = clip(out.reply, 220) || 'How can I help?';
  // A model that answers the second question with the first answer is the bug people notice, so a
  // repeat is thrown away and the local line for this question is used instead.
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (source === 'ai' && said.some(s => norm(s) === norm(reply))) {
    const l = localHelp(last, !guest, { turn, avoid: lastSaid, groups });
    reply = l.reply;
    source = 'local';
    if (!group && l.group) group = l.group;
    if (action === 'none' && !group && l.action !== 'none') action = l.action;
  }
  // A group named in the question itself is the surest sign of where they want to be, so it is
  // checked last and wins over a page the model guessed.
  if (!group && !guest) group = findGroup(last, groups, NAV_RE.test(last));
  // The bot's own words are the answer. Navigation is offered next to them, never written over them,
  // so two questions never get the same canned line back.
  if (guest && MEMBER_ONLY.has(action)) {
    action = 'none';
    reply += ' That needs a free account: Sign in in the top bar.';
  }
  const dest = group ? { action: 'room', hash: '#/room/' + group.id, label: `the group "${group.title}"`, dialog: null }
    : (action !== 'none' ? { action, hash: PAGES[action].hash, label: PAGES[action].name, dialog: PAGES[action].dialog || null } : null);
  const highlight = dest ? (HINTS[dest.action] ? dest.action : null)
    : (out.highlight === 'auth' || (out.highlight && HINTS[out.highlight]) ? out.highlight : null);
  // `navigate` is the difference between "here is where it is" and "here you go": a question that
  // asks where something is, or asks to be taken to it, gets the page opened for them.
  return {
    reply,
    action: dest ? dest.action : 'none',
    hash: dest ? dest.hash : null,
    label: dest ? dest.label : null,
    dialog: dest ? dest.dialog : null,
    navigate: !!(dest && NAV_RE.test(last)),
    highlight,
    source
  };
}

module.exports = { finderTurn, helpTurn, localHelp, localRoomReply, interpretGoal, roomAssistant, status };
