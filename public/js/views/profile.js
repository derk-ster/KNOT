// Your profile, as a page. Everything here is saved to your account and is what matching reads.
// Sign out is a plain row at the bottom of the page, so nothing sits on top of it.
import { $, $$, esc, avatar, icon, toast, navigate, imageLimit, resizeImage } from '../ui.js';
import { api } from '../api.js';
import { state, myProfile, isSignedIn } from '../state.js';
import { DAYS, STATE_NAMES, placesIn, stateOf } from '../geo.js';
import { askConfirm } from '../dialog.js';
import { paintHeader } from '../components/header.js';

export function renderProfile() {
  if (!isSignedIn()) return navigate('#/');
  const p = myProfile();
  const me = state.me;
  const picked = new Set(p.skills);
  $('#main').innerHTML = `
  <section class="page narrow">
    <h1 tabindex="-1" id="pageH1" class="page-title">Your profile</h1>
    <p class="lead">Everything here is saved to your account and follows you across devices. Matching reads it.</p>

    <form id="profileForm" class="form" novalidate>
      <section class="panel-block">
        <h2>Picture</h2>
        <div class="avatar-row">
          <span id="pictureSlot">${avatar(p.name || 'You', p.avatar, 'lg')}</span>
          <div>
            <label class="btn ghost sm file-btn">Upload picture<input id="pAvatar" type="file" accept="image/png,image/jpeg,image/webp" class="sr"></label>
            <p class="hint" id="pAvatarNote">PNG, JPEG or WebP. Large pictures are shrunk for you.</p>
          </div>
        </div>
      </section>

      <section class="panel-block">
        <div class="field">
          <label for="pName">Display name <span class="req">(required)</span></label>
          <input id="pName" type="text" maxlength="40" autocomplete="nickname" value="${esc(p.name)}" aria-describedby="pNameErr">
          <p class="msg err" id="pNameErr" role="alert" hidden></p>
        </div>
        <div class="field">
          <label for="pBio">Short bio <span class="opt">(optional)</span></label>
          <input id="pBio" type="text" maxlength="300" value="${esc(p.bio)}" placeholder="One line about you">
        </div>
      </section>

      <section class="panel-block">
        <h2>What you offer</h2>
        <p class="hint">Pick at least one skill or hobby, or type your own below.</p>
        <div class="chip-row" id="pSkills">${state.skills.map(s => `
          <label class="toggle"><input type="checkbox" value="${esc(s.id)}" ${picked.has(s.id) ? 'checked' : ''}><span>${esc(s.label)}</span></label>`).join('')}</div>
        <div class="field">
          <label for="pCustom">Something else?</label>
          <input id="pCustom" type="text" maxlength="40" autocomplete="off" value="${esc(p.custom || '')}" placeholder="e.g. ukulele, speedrunning, sourdough">
        </div>
        <p class="msg err" id="pSkillsErr" role="alert" hidden></p>
      </section>

      <section class="panel-block">
        <h2>What you look for <span class="opt">(up to 3)</span></h2>
        <div class="chip-row" id="pInterestChips"></div>
        <div class="input-row"><input id="pInterest" type="text" maxlength="40" autocomplete="off" placeholder="e.g. filmmaking, chess, running"><button type="button" class="btn ghost sm" id="pInterestAdd">Add</button></div>
        <div class="field">
          <label for="pGoals">What you want to work on <span class="opt">(optional)</span></label>
          <input id="pGoals" type="text" maxlength="300" value="${esc(p.goals)}" placeholder="e.g. make a short film this spring">
        </div>
      </section>

      <section class="panel-block">
        <h2>Where and when</h2>
        <div class="grid-2">
          <div class="field">
            <label for="pState">State</label>
            <select id="pState"><option value="">Any state</option>${Object.keys(STATE_NAMES).map(k => `<option value="${k}" ${stateOf(p.city) === k ? 'selected' : ''}>${esc(STATE_NAMES[k])}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label for="pCity">City</label>
            <input id="pCity" type="text" maxlength="60" list="pCityList" autocomplete="off" value="${esc(p.city)}" placeholder="Start typing, or type your own">
            <datalist id="pCityList"></datalist>
          </div>
        </div>
        <fieldset class="field">
          <legend>Days you are usually free</legend>
          <div class="chip-row" id="pDays">${DAYS.map(x => `<label class="toggle"><input type="checkbox" value="${x}" ${p.availability.includes(x) ? 'checked' : ''}><span>${esc(x.slice(0, 3).replace(/^./, c => c.toUpperCase()))}</span></label>`).join('')}</div>
        </fieldset>
        <fieldset class="field">
          <legend>Meeting preference</legend>
          <div class="chip-row">${[['both', 'Either'], ['in-person', 'In person'], ['online', 'Online']].map(([v, l]) => `<label class="toggle"><input type="radio" name="pMode" value="${v}" ${p.mode === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
        </fieldset>
      </section>

      <p class="msg err" id="pErr" role="alert" hidden></p>
      <div class="save-bar">
        <button type="submit" class="btn primary" id="pSave">Save profile</button>
        <a class="btn ghost" href="#/">Cancel</a>
      </div>
    </form>

    <section class="panel-block account-block">
      <h2>Account</h2>
      <p class="hint">Email: <strong>${esc(me.email || '')}</strong>. It is never shown to other members.</p>
      <div class="account-actions">
        <button type="button" class="btn ghost" data-action="signout">Sign out</button>
        <button type="button" class="btn ghost danger-text" id="pDelete">Delete my account</button>
      </div>
    </section>
  </section>`;
  $('#pageH1').focus({ preventScroll: true });

  paintInterests(p.interests);
  paintCities();
  $('#pState').addEventListener('change', paintCities);
  $('#pCity').addEventListener('focus', paintCities);
  $('#pAvatar').addEventListener('change', onPicture);
  $('#pDelete').addEventListener('click', onDelete);
  $('#profileForm').addEventListener('submit', onSave);
}

// The city list follows the state; the box still takes any city typed in.
function paintCities() {
  const code = $('#pState').value;
  const list = $('#pCityList');
  list.innerHTML = placesIn(code).sort((a, b) => a.localeCompare(b)).map(c => `<option value="${esc(c)}"></option>`).join('');
  $('#pCity').placeholder = code ? `Major cities in ${STATE_NAMES[code]} are suggested` : 'Start typing, or type your own';
}

let interests = [];
function paintInterests(list) {
  interests = [...list].slice(0, 3);
  const box = $('#pInterestChips');
  const paint = () => {
    box.innerHTML = interests.length ? interests.map((x, i) => `<span class="tag strong">${esc(x)}<button type="button" class="tag-x" data-rm="${i}" aria-label="Remove ${esc(x)}">${icon.x}</button></span>`).join('') : '<span class="hint">None yet.</span>';
    $$('[data-rm]', box).forEach(b => b.addEventListener('click', () => { interests.splice(Number(b.dataset.rm), 1); paint(); }));
    $('#pInterestAdd').closest('.input-row').hidden = interests.length >= 3;
  };
  const add = () => {
    const inp = $('#pInterest'); const v = inp.value.trim();
    if (v && !interests.includes(v) && interests.length < 3) interests.push(v);
    inp.value = ''; paint();
  };
  $('#pInterestAdd').addEventListener('click', add);
  $('#pInterest').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add(); } });
  paint();
}

async function onPicture() {
  const input = $('#pAvatar');
  const file = input.files && input.files[0];
  const note = $('#pAvatarNote');
  if (!file) return;
  note.textContent = 'Checking the picture…';
  try {
    const dataUrl = await resizeImage(file, 512, imageLimit(400));
    state.me = await api('/api/auth/avatar', { method: 'POST', body: { image: dataUrl } });
    $('#pictureSlot').innerHTML = avatar(state.me.name, state.me.profile.avatar, 'lg');
    note.textContent = 'Picture saved.';
    paintHeader();
  } catch (ex) {
    note.textContent = ex.message;
  }
  input.value = '';
}

async function onSave(e) {
  e.preventDefault();
  const err = $('#pErr'); err.hidden = true;
  const name = $('#pName').value.trim();
  const skills = $$('#pSkills input:checked').map(i => i.value);
  const custom = $('#pCustom').value.trim();
  $('#pNameErr').hidden = true; $('#pSkillsErr').hidden = true;
  if (!name) { $('#pNameErr').textContent = 'Enter a display name so people know who you are.'; $('#pNameErr').hidden = false; $('#pName').focus(); return; }
  const btn = $('#pSave'); btn.disabled = true; btn.textContent = 'Saving…';
  try {
    if (custom) {
      const r = await api('/api/skills/map', { method: 'POST', body: { text: custom } });
      if (!r.ids || !r.ids.length) throw new Error(`KNOT could not match "${custom}" to anything yet. Try another word, or pick a skill above.`);
      r.ids.forEach(id => { if (!skills.includes(id)) skills.push(id); });
    }
    if (!skills.length) { $('#pSkillsErr').textContent = 'Pick a skill or hobby above, or type your own.'; $('#pSkillsErr').hidden = false; return; }
    state.me = await api('/api/auth/me', {
      method: 'PATCH',
      body: {
        name, skills, interests,
        bio: $('#pBio').value.trim(), goals: $('#pGoals').value.trim(),
        city: $('#pCity').value.trim(),
        availability: $$('#pDays input:checked').map(i => i.value),
        mode: ($('input[name=pMode]:checked') || { value: 'both' }).value
      }
    });
    paintHeader();
    toast('Profile saved. Matching uses it straight away.', 'ok');
  } catch (ex) {
    err.textContent = ex.message; err.hidden = false;
    if (ex.message.toLowerCase().includes('password')) $('#pName').focus();
  } finally { btn.disabled = false; btn.textContent = 'Save profile'; }
}

async function onDelete() {
  const ok = await askConfirm({ title: 'Delete your account?', body: 'Your email is removed and your name is cleared. This cannot be undone.', yes: 'Delete my account', no: 'Keep my account', danger: true });
  if (!ok) return;
  try {
    state.me = await api('/api/auth/delete-account', { method: 'POST', body: {} });
    state.rooms = [];
    paintHeader();
    toast('Account deleted. You are browsing as a guest.');
    navigate('#/');
  } catch (ex) {
    const err = $('#pErr'); err.textContent = ex.message; err.hidden = false;
  }
}
