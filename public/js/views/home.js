// Home. Guests get the landing page: what KNOT is, and how to start. Members get a working home: the goal
// box, the matches, the groups they could join, and what they offer and look for, which matching reads.
import { $, $$, esc, icon } from '../ui.js';
import { api } from '../api.js';
import { state, isSignedIn, myProfile, skillLabel } from '../state.js';
import { goalBox, wireGoal, findPeople, renderResults } from './match.js';

export function renderHome() {
  if (!isSignedIn()) return renderLanding();
  return renderMemberHome();
}

function renderLanding() {
  $('#main').innerHTML = `
  <div class="landing">
    <section class="hero">
      <img class="hero-knot" src="assets/art/hero-knot.png" width="1200" height="311" alt="" aria-hidden="true">
      <div class="hero-copy">
        <h1>Find your <span class="hero-accent">people</span>.<br>Make it <span class="hero-strong">happen.</span></h1>
        <p class="hero-sub">Find people who share your interests, build groups, and turn ideas into something real.</p>
        <div class="hero-actions">
          <button type="button" class="btn primary lg" data-action="signup">Create free account</button>
          <button type="button" class="btn ghost lg" data-action="signin">Sign in</button>
        </div>
        <p class="fine">KNOT is for members 18 and over.</p>
      </div>
      <img class="float f1" src="assets/art/float/laptop.png" width="64" alt="" aria-hidden="true">
      <img class="float f2" src="assets/art/float/heart.png" width="54" alt="" aria-hidden="true">
      <img class="float f3" src="assets/art/float/paper_plane.png" width="58" alt="" aria-hidden="true">
      <img class="float f4" src="assets/art/float/puzzle_piece.png" width="52" alt="" aria-hidden="true">
    </section>

    <section class="section">
      <h2>How KNOT works</h2>
      <ol class="steps">
        <li><span class="step-n" aria-hidden="true">1</span><div><strong>Say what you want</strong><p>Describe the thing you want to do. KNOT explains who fits, and why, from what they have saved.</p></div></li>
        <li><span class="step-n" aria-hidden="true">2</span><div><strong>Start or join a group</strong><p>Turn your matches into a group, or find public groups and join in one tap.</p></div></li>
        <li><span class="step-n" aria-hidden="true">3</span><div><strong>Make it real</strong><p>Chat in the group, decide the next step, and keep the thread in one place.</p></div></li>
      </ol>
    </section>

    <section class="section">
      <h2>Matching you can check</h2>
      <div class="cards3">
        <article class="card-plain"><h3>Plain-words matching</h3><p>Describe a goal in your own words. Every match names the saved fields behind it.</p></article>
        <article class="card-plain"><h3>Nothing invented</h3><p>No percentages and no guessed availability. If something is not saved, KNOT says so.</p></article>
        <article class="card-plain"><h3>A helper, when you ask</h3><p>KNOT AI can answer in a group, but only when a member asks it to, or when the owner turns it on.</p></article>
      </div>
    </section>

    <section class="cta">
      <h2>Ready to make it happen?</h2>
      <p>Create a free account and find your first group in about a minute.</p>
      <button type="button" class="btn primary lg" data-action="signup">Create free account</button>
    </section>

    <footer class="site-foot">
      <p><strong>KNOT</strong> · find your people</p>
      <p class="small">Sample profiles are fictional and always labelled Demo. Group owners moderate their groups, and you can report anything that worries you. KNOT cannot promise anyone is safe: meet in public, bring a friend, and tell someone where you are.</p>
    </footer>
  </div>`;
}

function renderMemberHome() {
  $('#main').innerHTML = `
  <div class="member-home">
    <section class="page-head">
      <h1 tabindex="-1" id="pageH1">What do you want to do?</h1>
      <p class="lead">Say it in your own words. KNOT finds the people who fit and says why.</p>
    </section>
    ${goalBox()}
    <div id="matchResults" class="match-results" aria-live="polite"></div>

    <section class="section" aria-labelledby="hGroups">
      <div class="section-head"><h2 id="hGroups">Groups you could join</h2><a class="see-all" href="#/discover">See all ${icon.arrow}</a></div>
      <div id="homeGroups" class="card-grid" aria-live="polite"><p class="hint">Loading…</p></div>
    </section>

    <section class="section" aria-labelledby="hOffer">
      <div class="section-head stack">
        <h2 id="hOffer">What you offer, what you look for</h2>
        <p class="hint">Saved to your profile. Matching reads these, so keep them current.</p>
      </div>
      <div class="offer-grid">
        <div class="offer-card">
          <h3>You offer</h3>
          <p class="hint">Skills and hobbies people can count on. Up to 12.</p>
          <div class="chip-row" id="offerChips"></div>
          <div class="input-row"><input id="offerInput" type="text" maxlength="40" autocomplete="off" placeholder="e.g. video editing"><button type="button" class="btn ghost sm" id="offerAdd">Add</button></div>
          <p class="msg err small" id="offerErr" role="alert" hidden></p>
        </div>
        <div class="offer-card">
          <h3>You look for</h3>
          <p class="hint">Up to three things you want from people.</p>
          <div class="chip-row" id="lookChips"></div>
          <div class="input-row"><input id="lookInput" type="text" maxlength="40" autocomplete="off" placeholder="e.g. a drummer"><button type="button" class="btn ghost sm" id="lookAdd">Add</button></div>
        </div>
      </div>
      <div class="save-row">
        <button type="button" class="btn primary" id="offerSave">Save changes</button>
        <p class="msg ok small" id="offerMsg" role="status" hidden></p>
      </div>
    </section>
  </div>`;
  $('#pageH1').focus({ preventScroll: true });
  wireGoal(() => findPeople('#matchResults'));
  if (state.match.resp && state.match.target === '#matchResults') renderResults('#matchResults', state.match.resp);
  paintGroups(6);
  paintOffer();
}

// Groups the member is not in yet and that have room. Shared by the home page.
export async function paintGroups(limit = 6) {
  const box = $('#homeGroups');
  if (!box) return;
  try {
    const { groups } = await api('/api/groups');
    const open = groups.filter(g => g.memberCount < g.capacity);
    if (!open.length) {
      box.innerHTML = `<div class="empty-card wide"><h3>Nothing open to join yet</h3><p>Public groups from other members appear here while they have space.</p><a class="btn ghost sm" href="#/groups">My groups</a></div>`;
      return;
    }
    box.innerHTML = open.slice(0, limit).map(groupCard).join('');
  } catch (e) {
    box.innerHTML = `<p class="msg err" role="alert">${icon.alert}<span>Could not load groups. ${esc(e.message)}</span></p>`;
  }
}

export function groupCard(g) {
  return `<a class="group-card" href="#/room/${esc(g.id)}">
    <strong class="group-title">${esc(g.title)}</strong>
    <span class="group-goal">${esc(g.description || g.goal)}</span>
    <span class="meta">${g.memberCount}/${g.capacity} members · ${g.onlineOnly ? 'online' : (g.city ? esc(g.city) : 'in person')}</span>
    <span class="group-cta">${g.joinMode === 'request' ? 'Ask to join' : 'Open to join'} ${icon.arrow}</span>
  </a>`;
}

// "You offer" is skills; "You look for" is interests. These are the two lists matching actually reads.
function paintOffer() {
  const p = myProfile();
  const skills = [...p.skills];
  const looks = [...p.interests];
  const chips = (box, items, label, onRemove) => {
    const el = $(box);
    el.innerHTML = items.length
      ? items.map((x, i) => `<span class="tag strong">${esc(label(x))}<button type="button" class="tag-x" data-rm="${i}" aria-label="Remove ${esc(label(x))}">${icon.x}</button></span>`).join('')
      : '<span class="hint">Nothing here yet.</span>';
    $$('[data-rm]', el).forEach(b => b.addEventListener('click', () => { onRemove(Number(b.dataset.rm)); paint(); }));
  };
  const paint = () => {
    chips('#offerChips', skills, skillLabel, i => skills.splice(i, 1));
    chips('#lookChips', looks, x => x, i => looks.splice(i, 1));
    $('#offerInput').closest('.input-row').hidden = skills.length >= 12;
    $('#lookInput').closest('.input-row').hidden = looks.length >= 3;
  };
  const addSkill = async () => {
    const inp = $('#offerInput'); const typed = inp.value.trim();
    if (!typed) return;
    const known = state.skills.find(s => s.label.toLowerCase() === typed.toLowerCase())
      || state.skills.find(s => s.label.toLowerCase().includes(typed.toLowerCase()));
    let ids = known ? [known.id] : [];
    if (!ids.length) { try { ids = (await api('/api/skills/map', { method: 'POST', body: { text: typed } })).ids || []; } catch { ids = []; } }
    const fresh = ids.filter(id => !skills.includes(id));
    if (!fresh.length) {
      const e = $('#offerErr'); e.textContent = `KNOT could not match "${typed}" to a skill. Try another word.`; e.hidden = false; return;
    }
    $('#offerErr').hidden = true;
    fresh.forEach(id => { if (skills.length < 12) skills.push(id); });
    inp.value = ''; paint(); inp.focus();
  };
  const addLook = () => {
    const inp = $('#lookInput'); const v = inp.value.trim();
    if (v && !looks.includes(v) && looks.length < 3) looks.push(v);
    inp.value = ''; paint();
  };
  $('#offerAdd').addEventListener('click', addSkill);
  $('#offerInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } });
  $('#lookAdd').addEventListener('click', addLook);
  $('#lookInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addLook(); } });
  $('#offerSave').addEventListener('click', async () => {
    const btn = $('#offerSave'); btn.disabled = true; btn.textContent = 'Saving…';
    const msg = $('#offerMsg');
    try {
      state.me = await api('/api/auth/me', { method: 'PATCH', body: { skills, interests: looks } });
      msg.className = 'msg ok small'; msg.textContent = 'Saved. Matching uses this straight away.'; msg.hidden = false;
    } catch (ex) {
      msg.className = 'msg err small'; msg.textContent = ex.message; msg.hidden = false;
    } finally { btn.disabled = false; btn.textContent = 'Save changes'; }
  });
  paint();
}
