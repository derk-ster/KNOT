'use strict';
// The bots have to use the configured model, and they have to keep talking when there is no key or
// the call fails. Both paths are exercised here with the provider stubbed, so no network call and no
// API key is needed. The stub is installed BEFORE lib/ai.js and lib/demo.js are required, because
// they take their copy of the provider at load time.
const test = require('node:test');
const assert = require('node:assert');

const llm = require('../lib/llm');
let aiOn = true;
let calls = [];
let next = async () => ({ reply: 'From the model: start with the poster, then the edit.' });
llm.enabled = () => aiOn;
llm.chatJson = async (opts) => { calls.push(opts); return next(opts); };

const ai = require('../lib/ai');
const demo = require('../lib/demo');

const makeRoom = () => ({
  id: 'r1', title: 'Short film crew', goal: 'Shoot a short film in Plano.', aiMode: 'on-demand',
  members: [{
    pid: 'a:1', name: 'Ada Lopez', city: 'Plano', modeText: 'in person or online',
    skillLabels: ['video editing'], availabilityText: 'Saturday', availabilityDays: ['saturday']
  }],
  demoMembers: [{
    name: 'Maya Okafor', city: 'Plano', modeText: 'in person or online',
    skillLabels: ['directing'], availabilityText: 'Sunday', availabilityDays: ['sunday']
  }],
  messages: [
    { kind: 'user', authorAccountId: '1', authorName: 'Ada Lopez', text: 'I want to finish the poster by Friday.' },
    { kind: 'user', authorAccountId: '1', authorName: 'Ada Lopez', text: 'Who can help with the edit?' }
  ]
});
const meOf = room => room.members[0];

test('the room helper calls the configured model and gives it what it remembers', async () => {
  aiOn = true; calls = [];
  next = async () => ({ reply: 'Start with the poster, then hand the edit to Ada.' });
  const room = makeRoom();
  const out = await ai.roomAssistant({ room, me: meOf(room), mePid: 'a:1', question: 'What should we do first?' });
  assert.equal(out.source, 'ai', 'the model answer is the one used');
  assert.match(out.reply, /Start with the poster/);
  assert.equal(calls.length, 1, 'exactly one model call');
  const sys = calls[0].system;
  assert.match(sys, /Ada/, 'the asking member is named');
  assert.match(sys, /video editing/, 'her stored profile is in the prompt');
  assert.match(sys, /poster by Friday/, 'what she said earlier in this room is in the prompt');
  assert.match(sys, /topic|poster/i, 'the thread itself is in the prompt');
});

test('a failing model still leaves an answer in the room, built from stored facts', async () => {
  aiOn = true;
  next = async () => { throw new Error('The AI service returned 500'); };
  const room = makeRoom();
  const out = await ai.roomAssistant({ room, me: meOf(room), mePid: 'a:1', question: 'who can help with the edit?' });
  assert.equal(out.source, 'local', 'the plain answer is used, and it says so');
  assert.ok(out.reply.length > 20, 'a real sentence, not an empty string');
  assert.match(out.reply, /video editing|directing|Saturday|Sunday|Plano|goal|poster|edit/i, 'it cites stored room facts');
  assert.match(out.reply, /\?/, 'it still moves the group on');
});

test('the helper never says the same thing twice', async () => {
  aiOn = true;
  const room = makeRoom();
  room.messages.push({ kind: 'assistant', authorName: 'KNOT AI', text: 'Start with the poster.' });
  next = async () => ({ reply: 'Start with the poster.' });
  const out = await ai.roomAssistant({ room, me: meOf(room), mePid: 'a:1', question: 'what first?' });
  assert.notEqual(out.reply, 'Start with the poster.', 'a repeated line is dropped');
  assert.equal(out.source, 'local');
});

test('without a key the helper still answers, and the answer is different each time', async () => {
  aiOn = false;
  const room = makeRoom();
  const first = await ai.roomAssistant({ room, me: meOf(room), mePid: 'a:1', question: 'who can help with the edit?' });
  assert.equal(first.source, 'local');
  room.messages.push({ kind: 'assistant', authorName: 'KNOT AI', text: first.reply });
  const second = await ai.roomAssistant({ room, me: meOf(room), mePid: 'a:1', question: 'who can help with the edit?' });
  assert.notEqual(second.reply, first.reply, 'the same question does not get the same sentence back');
});

test('the help bot never answers a second question with the first answer', async () => {
  aiOn = true;
  next = async () => ({ reply: 'Open My groups in the top bar.' });
  const history = [
    { role: 'user', content: 'where are my groups?' },
    { role: 'assistant', content: 'Open My groups in the top bar.' },
    { role: 'user', content: 'where are my groups?' }
  ];
  const out = await ai.helpTurn({ history, signedIn: true });
  assert.notEqual(out.reply, 'Open My groups in the top bar.', 'the repeated model line is thrown away');
  assert.equal(out.action, 'groups', 'it still takes the person to the page');
});

test('the plain help answers vary, so asking twice is not the same sentence', () => {
  const a = ai.localHelp('where are my groups?', true, { turn: 0 });
  const b = ai.localHelp('where are my groups?', true, { turn: 1 });
  assert.notEqual(a.reply, b.reply);
  assert.equal(a.action, 'groups');
  assert.equal(b.action, 'groups');
  const guest = ai.localHelp('where are my groups?', false, { turn: 0 });
  assert.match(guest.reply, /free account/i);
  assert.equal(guest.highlight, 'auth');
});

test('a demo profile is told what the person said, and answers them by name', async () => {
  aiOn = true; calls = [];
  next = async () => ({ reply: 'Ada, the poster first, then I can take the edit. Shall we start tonight?' });
  const room = makeRoom();
  const out = await demo.demoReply({ room, lastText: 'Who can help with the edit?', me: meOf(room), mePid: 'a:1' });
  assert.ok(out && out.name, 'a demo profile speaks');
  assert.match(out.text, /Ada/);
  const ask = calls[0].messages[0].content;
  assert.match(ask, /poster by Friday/, 'the profile is given what the person said earlier');
  assert.match(ask, /Maya|Okafor/, 'and its own stored profile');
});

test('with no key a demo profile still builds on what the person said', async () => {
  aiOn = false;
  const room = makeRoom();
  const lines = [];
  for (let i = 0; i < 6; i++) {
    const out = await demo.demoReply({ room, lastText: 'We need a poster and an edit by Friday.', me: meOf(room), mePid: 'a:1' });
    lines.push(out.text);
    room.messages.push({ kind: 'demo', authorName: out.name, text: out.text });
  }
  assert.ok(lines.every(l => l && l.length > 10), 'every turn is a real line');
  assert.ok(lines.slice(1).every(l => /\?/.test(l)), 'every turn asks or suggests');
  assert.ok(new Set(lines).size >= 4, 'the profile does not cycle back, got ' + new Set(lines).size);
  assert.ok(lines.some(l => /poster|friday|edit|video editing|saturday|plano/i.test(l)), 'it works from stored facts and the thread');
});
