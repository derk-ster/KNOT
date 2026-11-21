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
