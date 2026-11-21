'use strict';
// KNOT local matcher. Deterministic keyword + constraint rules. NO AI model is used.
const profiles = require('../data/profiles.json');

const SKILLS = [
  { id: 'video-editing', label: 'video editing', verb: 'edit video', re: /\b(edit|edits|editing|editor|editors|premiere|davinci|final cut|post[- ]production)\b/i },
  { id: 'filming', label: 'filming', verb: 'shoot video', re: /\b(shoot|shooting|filming|filmmaker|camera|cameras|cinematograph\w*|videograph\w*|footage)\b|\b(?:can|could|to|who)\s+film\b/i },
  { id: 'sound-design', label: 'sound design', verb: 'do sound', re: /\b(sound|audio|foley|mixing)\b/i },
  { id: 'music-production', label: 'music production', verb: 'produce music', re: /\b(produce|producer|producing|production|beats?|ableton|songwriter|songwriting)\b/i },
  { id: 'vocals', label: 'vocals', verb: 'sing', re: /\b(vocals?|singer|sing|singing|vocalist)\b/i },
  { id: 'guitar', label: 'guitar', verb: 'play guitar', re: /\b(guitar|guitarist)\b/i },
  { id: 'web-dev', label: 'web development', verb: 'build websites', re: /\b(web ?dev\w*|website|front[- ]?end|react|developer|programmer|coder|coding)\b/i },
  { id: 'backend-ml', label: 'backend & data', verb: 'handle backend and data', re: /\b(back[- ]?end|python|machine learning|ml|data|apis?)\b/i },
  { id: 'ui-design', label: 'UI design', verb: 'design screens', re: /\b(designer|design|ui|ux|figma|wireframe\w*)\b/i },
  { id: 'photography', label: 'photography', verb: 'take photos', re: /\b(photograph\w*|photos?)\b/i },
  { id: 'scriptwriting', label: 'scriptwriting', verb: 'write scripts', re: /\b(script\w*|screenwrit\w*|writer|writing|storyboard\w*)\b/i },
  { id: 'acting', label: 'acting', verb: 'act', re: /\b(actor|actress|actors|acting|act)\b/i },
  { id: 'marketing', label: 'marketing', verb: 'do marketing', re: /\b(marketing|social media|promo\w*|tiktok|instagram)\b/i },
  { id: 'podcasting', label: 'podcasting', verb: 'host a podcast', re: /\b(podcast\w*|interviewer|interviews?)\b/i },
  { id: 'robotics', label: 'robotics', verb: 'build robots', re: /\b(robot\w*|arduino|electronics|soldering)\b/i },
  { id: 'game-dev', label: 'game development', verb: 'build games', re: /\b(game dev\w*|unity|godot|game designer)\b/i },
  { id: 'tutoring', label: 'tutoring', verb: 'tutor', re: /\b(tutor\w*|calculus|math|physics)\b/i },
  { id: 'basketball', label: 'basketball', verb: 'play basketball', re: /\b(basketball|hoops|pickup|pick-up|teammates?)\b/i },
  { id: 'illustration', label: 'illustration', verb: 'illustrate', re: /\b(illustrat\w*|drawing|artist|concept art|pixel art)\b/i },
  { id: 'project-mgmt', label: 'organizing', verb: 'organize', re: /\b(organi[sz]\w*|project manage\w*|planner|coordinat\w*)\b/i }
];
const SKILL_BY_ID = Object.fromEntries(SKILLS.map(s => [s.id, s]));

const TOPICS = [
  { id: 'film', label: 'film', re: /\b(film|films|movie|short|documentary|video|videos)\b/i },
  { id: 'music', label: 'music', re: /\b(music|song|songs|beat|beats|album|band|track|single)\b/i },
  { id: 'app', label: 'building an app', re: /\b(app|website|startup|prototype|software)\b/i },
  { id: 'hackathon', label: 'hackathons', re: /\b(hackathon|hackathons)\b/i },
  { id: 'basketball', label: 'basketball', re: /\b(basketball|hoops|pickup)\b/i },
  { id: 'podcast', label: 'podcasts', re: /\b(podcast\w*)\b/i },
  { id: 'robotics', label: 'robotics', re: /\b(robot\w*|arduino)\b/i },
  { id: 'game', label: 'games', re: /\b(game|games)\b/i },
  { id: 'study', label: 'studying', re: /\b(study|studying|exam|homework|calculus)\b/i },
  { id: 'photography', label: 'photography', re: /\b(photo|photos|photography)\b/i },
  { id: 'social', label: 'social media', re: /\b(social media|tiktok|instagram)\b/i }
];

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const CITIES = ['Plano', 'Dallas', 'Frisco', 'Richardson', 'Austin', 'Houston', 'Allen', 'McKinney', 'Irving', 'Garland', 'Fort Worth'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const first = name => name.split(' ')[0];
const list = arr => arr.length <= 1 ? (arr[0] || '') : arr.slice(0, -1).join(', ') + ' and ' + arr[arr.length - 1];

function detectSkills(text) {
  const t = String(text).replace(/sound design/gi, 'sound').replace(/game design/gi, 'game').replace(/pixel art/gi, 'illustration');
  return SKILLS.filter(s => s.re.test(t)).map(s => s.id);
}
function detectTopics(text) { return TOPICS.filter(t => t.re.test(text)).map(t => t.id); }

const NEED_RE = /\b(i (?:also )?need|needs?|looking for|looking to find|want(?:ing)? (?:someone|a|an|to find|help)|find (?:me )?(?:a|an|someone)|searching for|seeking|help with|who can)\b/i;
const OFFER_RE = /\bI (?:can|could|do|know|have|play|am)\b|\bI'm\b/i;

function parseGoal(goal, me) {
  goal = String(goal || '').slice(0, 500);
  const m = NEED_RE.exec(goal);
  let offers = [], needs = [];
  if (m) {
    const pre = goal.slice(0, m.index), post = goal.slice(m.index);
    if (OFFER_RE.test(pre)) offers = detectSkills(pre);
    needs = detectSkills(post).filter(id => !offers.includes(id));
  } else {
    const mine = new Set((me && me.skills) || []);
    needs = detectSkills(goal).filter(id => !mine.has(id));
  }
  const topics = detectTopics(goal);
  const lower = goal.toLowerCase();
  let city = CITIES.find(c => new RegExp('\\b' + c + '\\b', 'i').test(goal)) || null;
  const online = /\b(online|remote|remotely|virtual|over zoom|on discord)\b/i.test(goal);
  const inPerson = /\bin[- ]person\b|\bface[- ]to[- ]face\b|\bmeet ?up\b/i.test(goal);
  let mode = online ? 'online' : (inPerson ? 'in-person' : null);
  let days = DAYS.filter(d => new RegExp('\\b' + d + 's?\\b').test(lower));
  if (!days.length && /\bweekend\b/.test(lower)) days = ['saturday', 'sunday'];
  return { goal, offers, needs, topics, city: mode === 'online' ? null : city, mode, days };
}

function constraintList(p) {
  const out = [];
  if (p.mode) out.push({ key: 'mode', label: p.mode === 'online' ? 'Online' : 'In person' });
  if (p.city) out.push({ key: 'city', label: p.city });
  if (p.days.length) out.push({ key: 'day', label: p.days.length === 2 && p.days[0] === 'saturday' ? 'This weekend' : p.days.map(cap).join(' / ') });
  return out;
}
const RELAX_TEXT = { mode: p => p.mode === 'online' ? 'Allow in person' : 'Allow online', city: () => 'Any city', day: () => 'Any day' };

function check(prof, p, active) {
  const fails = [];
  if (active.has('mode')) {
    if (p.mode === 'in-person' && prof.mode === 'online') fails.push('mode');
    if (p.mode === 'online' && prof.mode === 'in-person') fails.push('mode');
  }
  if (active.has('city') && prof.city !== p.city) fails.push('city');
  let unknown = false;
  if (active.has('day')) {
    if (!prof.availability) unknown = true;
    else if (!p.days.some(d => prof.availability.days.includes(d))) fails.push('day');
  }
  return { fails, unknown };
}

function relevance(prof, p) {
  const have = prof.skills.map(s => s.id);
  const skillHits = p.needs.filter(id => have.includes(id));
  const topicHits = p.topics.filter(t => prof.goals.includes(t));
  const ok = p.needs.length ? skillHits.length > 0 : topicHits.length > 0;
  return { ok, skillHits, topicHits, score: skillHits.length * 3 + topicHits.length * 1.2 };
}

const dayLabel = days => days.length === 2 && days[0] === 'saturday' ? 'this weekend' : list(days.map(cap));

function describe(prof, p, rel, active, relaxedKeys, chk, me) {
  const f = first(prof.name);
  const skillText = id => { const s = prof.skills.find(x => x.id === id); return SKILL_BY_ID[id].label + (s.note ? ` (${s.note})` : ''); };
  const pairs = rel.skillHits.length
    ? rel.skillHits.map(id => ({ need: `You need ${SKILL_BY_ID[id].label}`, offer: `${f} offers ${skillText(id)}` }))
    : rel.topicHits.map(t => ({ need: `Your goal is about ${TOPICS.find(x => x.id === t).label}`, offer: `${f} wants to work on ${TOPICS.find(x => x.id === t).label}` }));

  const matchedDay = prof.availability && p.days.length ? p.days.find(d => prof.availability.days.includes(d)) : null;
  const meDays = (me && me.availability) || [];
  let reason = '';
  if (p.offers.length) reason += `You can ${list(p.offers.map(id => SKILL_BY_ID[id].verb))}. `;
  const what = rel.skillHits.length ? list(rel.skillHits.map(skillText)) : null;
  reason += what ? `${f} offers ${what}` : `${f} is also interested in ${list(rel.topicHits.map(t => TOPICS.find(x => x.id === t).label))}`;
  if (matchedDay) reason += meDays.includes(matchedDay) ? `, and you're both free ${cap(matchedDay)}` : ` and is free ${cap(matchedDay)}`;
  reason += '.';
  if (active.has('city') && prof.city === p.city) reason += ` ${f} is in ${prof.city}.`;

  const flags = [];
  if (chk.unknown) flags.push({ type: 'check', text: 'Availability unknown', explain: `${f} hasn't listed a schedule, so ${dayLabel(p.days)} is unconfirmed. Ask in the chat.` });
  if (active.has('city') && prof.mode === 'online') flags.push({ type: 'check', text: 'Online only', explain: `${f} is in ${prof.city} but prefers online meetups, so an in-person session isn't confirmed.` });
  if (relaxedKeys.has('day') && prof.availability && !p.days.some(d => prof.availability.days.includes(d))) flags.push({ type: 'check', text: `Not listed as free ${dayLabel(p.days)}`, explain: `${f} lists ${list(prof.availability.days.map(cap))}.` });
  if (relaxedKeys.has('mode') && p.mode && ((p.mode === 'in-person' && prof.mode === 'online') || (p.mode === 'online' && prof.mode === 'in-person'))) flags.push({ type: 'check', text: prof.mode === 'online' ? 'Online only' : 'In person only', explain: `${f} prefers ${prof.mode === 'online' ? 'online' : 'in-person'} meetups.` });
  if (relaxedKeys.has('city') && p.city && prof.city !== p.city) flags.push({ type: 'check', text: `Based in ${prof.city}`, explain: `You asked for ${p.city}.` });

  const modeText = { both: 'in person or online', 'in-person': 'in person only', online: 'online only' }[prof.mode];
  const evidence = [
    { label: 'Your goal needs', value: p.needs.length ? list(p.needs.map(id => SKILL_BY_ID[id].label)) : 'No specific skill found; matched on topic' },
    { label: `${f}'s skills`, value: prof.skills.map(s => SKILL_BY_ID[s.id].label + (s.note ? ` (${s.note})` : '')).join(', ') },
    { label: `${f}'s goals`, value: prof.goals.map(g => (TOPICS.find(t => t.id === g) || { label: g }).label).join(', ') },
    { label: `${f}'s city`, value: prof.city + (active.has('city') ? ` (you asked for ${p.city})` : '') },
    { label: `${f} meets`, value: modeText },
    { label: `${f}'s availability`, value: prof.availability ? `${prof.availability.days.map(cap).join(', ')} (${prof.availability.note})` : 'Not listed (unknown, not confirmed)' },
    { label: 'How this was decided', value: 'KNOT local rules: skill keywords plus your explicit constraints. No AI model was used.' }
  ];
  return {
    id: prof.id, name: prof.name, city: prof.city, modeText, bio: prof.bio,
    bring: prof.skills.map(s => SKILL_BY_ID[s.id].label + (s.note ? ` (${s.note})` : '')),
    reason, pairs, flags, evidence
  };
}

function matchGoal({ goal, me, relaxed }) {
  me = me || {};
  const p = parseGoal(goal, me);
  // What you offer = skills in your profile plus anything you said you can do in the goal.
  p.offers = [...new Set([...p.offers, ...((me.skills || []).filter(id => SKILL_BY_ID[id] && !p.needs.includes(id)))])].slice(0, 4);
  const cons = constraintList(p);
  const relaxedKeys = new Set((relaxed || []).filter(k => cons.some(c => c.key === k)));
  const active = new Set(cons.map(c => c.key).filter(k => !relaxedKeys.has(k)));
  const interpreted = {
    needs: p.needs.map(id => ({ id, label: SKILL_BY_ID[id].label })),
    offers: p.offers.map(id => ({ id, label: SKILL_BY_ID[id].label })),
    topics: p.topics,
    constraints: cons.map(c => ({ ...c, relaxed: relaxedKeys.has(c.key) }))
  };

  const relevant = profiles.map(prof => ({ prof, rel: relevance(prof, p) })).filter(x => x.rel.ok);
  const eligible = [];
  for (const x of relevant) {
    const chk = check(x.prof, p, active);
    if (!chk.fails.length) eligible.push({ ...x, chk });
  }
  const results = eligible
    .map(x => ({ x, d: describe(x.prof, p, x.rel, active, relaxedKeys, x.chk, me) }))
    .sort((a, b) => (b.x.rel.score - a.x.rel.score) || (a.d.flags.length - b.d.flags.length) || a.d.name.localeCompare(b.d.name))
    .slice(0, 3).map(o => o.d);

  let empty = null;
  if (!results.length) {
    if (!relevant.length) {
      const hint = (p.needs.length || p.topics.length)
        ? 'No one in the demo community offers that yet. Try a different skill or rephrase your goal.'
        : "I couldn't tell which skill you're looking for. Try something like \"I need someone who can edit video\".";
      empty = { reason: 'skill', message: hint, options: [] };
    } else {
      const options = [];
      for (const c of cons) {
        if (!active.has(c.key)) continue;
        const a2 = new Set(active); a2.delete(c.key);
        const count = relevant.filter(x => !check(x.prof, p, a2).fails.length).length;
        if (count) options.push({ key: c.key, text: RELAX_TEXT[c.key](p), count, label: c.label });
      }
      const wanted = p.needs.length ? list(p.needs.map(id => SKILL_BY_ID[id].label)) : 'that topic';
      const limits = cons.filter(c => active.has(c.key)).map(c => c.label).join(' + ');
      empty = {
        reason: 'constraints',
        message: options.length
          ? `No one offering ${wanted} fits ${limits}. ${relevant.length} ${relevant.length === 1 ? 'person offers' : 'people offer'} it, so one of your requirements is the limit.`
          : `No one offering ${wanted} fits all of: ${limits}. Several requirements together are the limit.`,
        options
      };
    }
  }
  return { interpreted, results, empty, matcher: 'local-rules', considered: profiles.length, relevant: relevant.length };
}

function topicPlan(topics) {
  if (topics.includes('film')) return 'Agree on a 60-second idea, a short shot list, and who brings which gear.';
  if (topics.includes('music')) return 'Pick one reference track and sketch a 30-second idea together.';
  if (topics.includes('app') || topics.includes('hackathon')) return 'Write the problem in one sentence and sketch three screens.';
  if (topics.includes('basketball')) return 'Choose a court and a time for a first run.';
  if (topics.includes('podcast')) return 'Outline episode one in five bullet points.';
  if (topics.includes('robotics')) return 'List the parts you already own and pick a first small build.';
  if (topics.includes('study')) return 'Pick the first topic and the exact problems to work through.';
  return 'Write down what "done" looks like for your first session.';
}

function buildAssist(room) {
  const p = parseGoal(room.goal, {});
  const members = room.members;
  const owner = members.find(m => m.you) || members[0];
  const others = members.filter(m => !m.you);
  const withDays = others.filter(m => m.availabilityDays);
  let common = null;
  if (withDays.length) {
    const sets = withDays.map(m => m.availabilityDays);
    common = sets[0].filter(d => sets.every(s => s.includes(d)));
  }
  const unknown = others.filter(m => !m.availabilityDays).map(m => first(m.name));
  let step1;
  if (common && common.length) step1 = `Pick a time. ${list(common.map(cap))} ${common.length > 1 ? 'work' : 'works'} for everyone who listed a schedule.` + (unknown.length ? ` ${list(unknown)} ${unknown.length > 1 ? "haven't" : "hasn't"} shared theirs yet, so please confirm.` : '');
  else step1 = 'Pick a time. Everyone please share the days you are free so we can find an overlap.' + (unknown.length ? ` (${list(unknown)}: we don't have your schedule yet.)` : '');
  const roles = others.map(m => `${first(m.name)} (${m.skillLabels.length ? list(m.skillLabels.slice(0, 2)) : 'open to help'})`);
  const step2 = `Split roles. ${roles.length ? 'Based on profiles: ' + list(roles) + '.' : ''} ${first(owner.name)} drives the plan.`.replace(/\s+/g, ' ');
  const text = `Hi everyone! I'm ${first(owner.name)}. Here's our goal: "${room.goal}"\n\nA simple way to start:\n1. ${step1}\n2. ${step2}\n3. First step. ${topicPlan(p.topics)}\n\nEdit anything that doesn't fit. What do you think?`;
  return { text, source: 'template' };
}

module.exports = { profiles, SKILLS, SKILL_BY_ID, matchGoal, buildAssist, parseGoal, cap };
