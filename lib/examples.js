'use strict';
// Personalised example goals. Built from the user's goal (what they need) or, failing that, their
// profile skills, and always checked against the real matcher so every example returns people.
const { profiles, SKILL_BY_ID, parseGoal, matchGoal, cap } = require('./match');

const COMPLEMENTS = {
  'filming': ['video-editing', 'sound-design', 'scriptwriting', 'acting'],
  'video-editing': ['filming', 'sound-design', 'music-production'],
  'sound-design': ['video-editing', 'music-production', 'podcasting'],
  'music-production': ['vocals', 'guitar', 'sound-design'],
  'vocals': ['music-production', 'guitar'], 'guitar': ['vocals', 'music-production'],
  'web-dev': ['ui-design', 'backend-ml', 'marketing'], 'backend-ml': ['web-dev', 'ui-design'],
  'ui-design': ['web-dev', 'game-dev', 'backend-ml'], 'game-dev': ['illustration', 'sound-design', 'ui-design'],
  'illustration': ['game-dev', 'ui-design', 'marketing'], 'photography': ['marketing', 'illustration', 'video-editing'],
  'scriptwriting': ['filming', 'acting', 'video-editing'], 'acting': ['filming', 'scriptwriting'],
  'marketing': ['ui-design', 'photography', 'web-dev'], 'podcasting': ['sound-design', 'marketing'],
  'robotics': ['backend-ml', 'web-dev'], 'tutoring': ['project-mgmt'], 'project-mgmt': ['web-dev', 'ui-design'],
  'basketball': ['basketball', 'fitness'], 'gaming': ['board-games', 'game-dev', 'gaming'], 'board-games': ['gaming', 'cooking'],
  'cooking': ['board-games', 'volunteering', 'travel'], 'hiking': ['photography', 'travel', 'fitness'], 'fitness': ['hiking', 'basketball', 'dance'],
  'dance': ['djing', 'fitness'], 'chess': ['reading', 'gaming'], 'crafts': ['illustration', 'podcasting'], 'reading': ['languages', 'chess'],
  'travel': ['photography', 'hiking', 'cooking'], 'languages': ['travel', 'cooking'], 'volunteering': ['project-mgmt', 'cooking'],
  'djing': ['dance', 'music-production'], 'skateboarding': ['photography', 'fitness'], 'anime': ['illustration', 'gaming'],
  'startups': ['web-dev', 'ui-design', 'marketing'], 'speaking': ['startups', 'podcasting'], 'anything': ['hiking', 'board-games', 'cooking']
};
const DEFAULTS = ['I can shoot a short film in Plano this Saturday and need someone who can edit.', 'I want to find people to play board games in Plano this Friday.', 'I want a hiking buddy this Saturday.'];
const day = d => cap(d);

function pool(skillId) { return profiles.filter(p => p.skills.some(s => s.id === skillId)); }
const hash = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

function forNeed(need, mySkills, seed) {
  const label = SKILL_BY_ID[need].label, out = [];
  const ps = pool(need); if (!ps.length) return out;
  const pick = i => ps[(hash(seed) + i) % ps.length];
  const sched = ps.filter(p => p.availability && p.availability.days.length && p.mode !== 'online');
  if (sched.length) { const p = sched[hash(seed) % sched.length]; out.push(`I need someone who can help with ${label} in ${p.city} this ${day(p.availability.days[0])}.`); }
  if (ps.some(p => p.mode !== 'in-person')) out.push(`I’m working on a side project online and need help with ${label}.`);
  const mine = (mySkills || []).find(id => id !== need && SKILL_BY_ID[id]);
  if (mine) out.push(`I can ${SKILL_BY_ID[mine].verb} and need someone for ${label}.`);
  else out.push(`Looking for a teammate who can do ${label} for a weekend project.`);
  void pick; return out;
}

function examplesFor({ goal, skills, limit = 3 }) {
  skills = (skills || []).filter(id => SKILL_BY_ID[id]);
  const parsed = parseGoal(goal || '', { skills });
  let needs = parsed.needs.slice(0, 2), basis = 'goal';
  if (!needs.length) {
    needs = [...new Set(skills.flatMap(id => COMPLEMENTS[id] || []))].filter(id => !skills.includes(id) || id === 'basketball').slice(0, 2);
    basis = 'profile';
  }
  let list = [];
  needs.forEach((n, i) => { list.push(...forNeed(n, skills, (goal || '') + n).slice(0, i ? 1 : 3)); });
  list = [...new Set(list)].filter(g => matchGoal({ goal: g, me: { skills }, relaxed: [] }).results.length > 0).slice(0, limit);
  if (!list.length) return { examples: DEFAULTS, basis: 'default', label: 'Try an example' };
  const names = needs.map(n => SKILL_BY_ID[n].label).join(' and ');
  return { examples: list, basis, label: basis === 'goal' ? `Examples for ${names}` : `Examples for you, based on your skills` };
}
module.exports = { examplesFor, DEFAULTS };
