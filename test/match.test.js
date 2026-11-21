'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { matchGoal, buildAssist, parseGoal } = require('../lib/match');

const judgeGoal = 'I want to make a short film in Plano and need someone who can edit.';
const onlineGoal = 'I want to make a short film online and need someone who can edit.';

test('judge goal: returns editing matches with grounded reasons', () => {
  const r = matchGoal({ goal: judgeGoal, me: {}, relaxed: [] });
  assert.ok(r.results.length >= 1 && r.results.length <= 3);
  assert.ok(r.results.some(x => x.name === 'Maya Okafor'), 'Maya (Plano, video editing, free weekend) should match');
  const maya = r.results.find(x => x.name === 'Maya Okafor');
  assert.ok(/edit/.test(maya.reason), 'reason references the actual skill');
  assert.ok(maya.pairs.some(p => /video editing/i.test(p.need) && /offers/i.test(p.offer)));
  assert.ok(r.interpreted.needs.some(n => n.id === 'video-editing'));
});

test('judge goal: Plano requirement is an active constraint', () => {
  const r = matchGoal({ goal: judgeGoal, me: {}, relaxed: [] });
  const city = r.interpreted.constraints.find(c => c.key === 'city');
  assert.ok(city && !city.relaxed && city.label === 'Plano');
  // Online-only Priya must not be presented without her "Online only" caveat.
  const priya = r.results.find(x => x.name === 'Priya Raman');
  if (priya) assert.ok(priya.flags.some(f => /Online only/.test(f.text)));
});

test('editing goal to online: results react meaningfully', () => {
  const r = matchGoal({ goal: onlineGoal, me: {}, relaxed: [] });
  const city = r.interpreted.constraints.find(c => c.key === 'city');
  assert.ok(!city, 'no city constraint when the goal says online');
  const mode = r.interpreted.constraints.find(c => c.key === 'mode');
  assert.ok(mode && !mode.relaxed && mode.label === 'Online');
  // Online-only profiles are now first-class matches, not flagged.
  const priya = r.results.find(x => x.name === 'Priya Raman');
  if (priya) assert.ok(!priya.flags.some(f => /Online only/.test(f.text)));
});

test('empty and nonsense goals never crash and explain themselves', () => {
  for (const g of ['', 'xyzzy qwerty flurb', 'aaaaaaaa']) {
    const r = matchGoal({ goal: g, me: {}, relaxed: [] });
    assert.ok(Array.isArray(r.results));
    assert.ok(r.results.length || r.empty, 'either results or an explanation');
  }
});

test('hard constraints: online-only profile excluded from in-person city match', () => {
  // Theo is Dallas in-person; Iris is Austin online-only. In-person + Dallas should exclude Iris.
  const r = matchGoal({ goal: 'I want to shoot a film in person in Dallas and need a camera operator.', me: {}, relaxed: [] });
  assert.ok(!r.results.some(x => x.name === 'Iris Vega'));
});

test('availability unknown is flagged, never invented', () => {
  // Priya offers video editing in Plano but lists no schedule; a Saturday goal must say "unknown".
  const r = matchGoal({ goal: 'I need someone who can edit video in Plano on Saturday.', me: {}, relaxed: [] });
  const priya = r.results.find(x => x.name === 'Priya Raman');
  if (priya) assert.ok(priya.flags.some(f => /Availability unknown/.test(f.text)));
  // And a relaxed-result run must never invent a day for her either.
  const evidence = r.results.flatMap(x => x.evidence.filter(e => /availability/i.test(e.label)).map(e => e.value));
  assert.ok(evidence.length === 0 || evidence.every(v => !/every day|always|any time/i.test(v)), 'no invented availability');
});

test('buildAssist uses only stored group facts', () => {
  const out = buildAssist({
    goal: 'I want to make a short film and need someone who can edit.',
    members: [
      { name: 'Derek', you: true, skillLabels: ['filming'], availabilityDays: null, availabilityText: 'You' },
      { name: 'Maya Okafor', city: 'Plano', skillLabels: ['video editing'], availabilityDays: ['saturday'], availabilityText: 'Free: Saturday' }
    ]
  });
  assert.equal(out.source, 'template');
  assert.ok(out.text.includes('short film'));
  assert.ok(out.text.includes('Maya'));
  assert.ok(/Saturday/.test(out.text), 'shared availability comes from stored data');
});

test('parseGoal extracts city, mode and days', () => {
  const p = parseGoal('I can film in Plano this Saturday and need someone who can edit.');
  assert.equal(p.city, 'Plano');
  assert.ok(p.needs.includes('video-editing'));
  assert.ok(p.offers.includes('filming'));
  assert.ok(p.days.includes('saturday'));
});
