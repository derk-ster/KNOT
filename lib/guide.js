'use strict';
// Shared "what should the user do next?" vocabulary. The server decides the situation-specific next
// step; the browser maps each target to a control and highlights it. Short hints only.
const HINTS = {
  goal: 'Type what you want to do in the box.',
  find: 'Press Find my people.',
  profile: 'Add your name and one skill.',
  need: 'Edit your goal, or tap an example.',
  offer: 'Change what you offer.',
  relax: 'Relax a requirement to see more people.',
  pick: 'Press Add to group on someone you like.',
  create: 'Press Create group.',
  open: 'Open the full matches.',
  assist: 'Press Help us get started.',
  finderInput: 'Tell the finder what you want to do.'
};
const step = (target, also = []) => ({ target, also, hint: HINTS[target] });

function fromMatch({ goal, hasProfile, results, empty }) {
  if (!goal) return step('goal');
  if (!hasProfile) return step('profile');
  if (empty) return empty.reason === 'skill' && !(empty.options && empty.options.length) && /couldn't tell/.test(empty.message) ? step('need', ['offer']) : step(empty.options && empty.options.length ? 'relax' : 'offer', empty.options && empty.options.length ? ['offer'] : ['need']);
  return results && results.length ? step('pick') : step('goal');
}
const fromFinder = out => (out && out.result ? step('open') : step('finderInput'));
const fromRoom = room => (room && room.messages && room.messages.length ? null : step('assist'));

module.exports = { HINTS, step, fromMatch, fromFinder, fromRoom };
