'use strict';
// The fictional demo profiles have to carry a conversation: greet once, answer the newest message,
// suggest a next step, and never fall back to the opening line. No AI is configured here, so these
// are the local lines the server writes when it has no model to call.
const test = require('node:test');
const assert = require('node:assert');
const { localReply, pickSpeaker } = require('../lib/demo');

const maya = { name: 'Maya Okafor', city: 'Plano', skillLabels: ['video editing'], availabilityDays: ['saturday', 'sunday'] };

test('demo profiles greet once, answer the thread and suggest a next step', () => {
  const room = { messages: [] };
  const lines = [];
  for (let i = 1; i <= 12; i++) {
    const line = localReply(maya, room, 'message ' + i + ' about the short film');
    lines.push(line);
    room.messages.push({ kind: 'demo', authorName: maya.name, text: line });
  }
  assert.match(lines[0], /^Hi, Maya here\./, 'the first line is the greeting');
  assert.ok(lines.slice(1).every(l => !/^Hi, Maya here/.test(l)), 'the greeting is never used again');
  assert.ok(lines.slice(1).every(l => /\?/.test(l)), 'every later turn ends by asking or suggesting');
  assert.ok(new Set(lines).size >= 7, 'the lines do not cycle back to the opening, got ' + new Set(lines).size);
  assert.ok(lines.slice(1).every(l => /plano|video editing|saturday|sunday|week|step|help/i.test(l)), 'every line comes from the profile or the thread');
});

test('a profile with no skill or days still takes part', () => {
  const bare = { name: 'Kai Nakamura' };
  const room = { messages: [{ kind: 'demo', authorName: 'Kai Nakamura', text: 'Hi, Kai here. What should we start with?' }] };
  const line = localReply(bare, room, 'who can help with the poster?');
  assert.ok(line && line.length > 10, 'a line is always written');
  assert.ok(/\?/.test(line), 'it still moves the group on');
  assert.ok(!/undefined|null/.test(line), 'no missing field leaks into the sentence');
});

test('the speaker rotates, so one profile does not do all the talking', () => {
  const demos = [{ name: 'Maya Okafor' }, { name: 'Kai Nakamura' }];
  const room = { demoMembers: demos, messages: [{ kind: 'demo', authorName: 'Maya Okafor', text: 'one' }] };
  assert.equal(pickSpeaker(room).name, 'Kai Nakamura', 'whoever has spoken least gets the turn');
  assert.equal(pickSpeaker({ demoMembers: [], messages: [] }), null, 'no demo profiles means no speaker');
});

// A burst of turns is what the server writes after a member speaks, so every profile in it is
// answering the line before. Three introductions in a row is the thing people noticed first.
const kai = { name: 'Kai Nakamura', city: 'Plano', skillLabels: ['gaming'], availabilityDays: ['saturday', 'sunday'] };
const priya = { name: 'Priya Raman', city: 'Plano', skillLabels: ['video editing', 'marketing'] };

function burst(members, opening) {
  const room = { demoMembers: members, messages: [{ kind: 'user', authorName: 'Sam', text: opening }] };
  const said = [];
  for (let i = 0; i < Math.min(3, members.length); i++) {
    const speaker = pickSpeaker(room);
    const last = room.messages[room.messages.length - 1].text;
    const line = localReply(speaker, room, last, null);
    said.push({ who: speaker.name, text: line });
    room.messages.push({ kind: 'demo', authorName: speaker.name, text: line });
  }
  return said;
}

test('only the first profile greets, the rest answer the line before them', () => {
  const said = burst([maya, kai, priya], 'I want to film my bike rides with a drone.');
  assert.match(said[0].text, /^Hi, /, 'the room is opened once');
  assert.ok(said.slice(1).every(l => !/^Hi, /.test(l.text)), 'nobody else introduces themselves: ' + JSON.stringify(said.map(l => l.text)));
});

test('a question from the member is answered from the profile, not with a nod', () => {
  const room = { demoMembers: [maya, kai, priya], messages: [{ kind: 'user', authorName: 'Sam', text: 'Who can edit the footage?' }] };
  const line = localReply(maya, room, 'Who can edit the footage?', null);
  assert.match(line, /video editing/, 'the profile offers the skill it actually lists, got: ' + line);
  assert.match(line, /\?/, 'and still asks something back');
});

test('two profiles do not put their hand up for the same skill', () => {
  const room = {
    demoMembers: [maya, kai, priya],
    messages: [
      { kind: 'user', authorName: 'Sam', text: 'Who can edit the footage?' },
      { kind: 'demo', authorName: 'Maya Okafor', text: 'I can take video editing. Should I start on that this week?' }
    ]
  };
  const lines = [0, 1, 2].map(i => localReply(priya, room, 'Who can edit the footage?', null) + ' ' + i);
  assert.ok(lines.every(l => !/I can (take|cover) video editing/.test(l)), 'the claim already made is respected: ' + JSON.stringify(lines));
  assert.ok(lines.some(l => /marketing/.test(l)), 'the profile offers its other skill instead: ' + JSON.stringify(lines));
});

test('no two profiles in a burst use the same sentence with the name swapped', () => {
  const said = burst([maya, kai, priya], 'I have a script idea too.');
  const shape = s => String(s).toLowerCase().replace(/maya|kai|priya/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
  assert.equal(new Set(said.map(l => shape(l.text))).size, said.length, 'the shapes differ: ' + JSON.stringify(said.map(l => l.text)));
});
