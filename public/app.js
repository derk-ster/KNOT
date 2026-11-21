(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } }
};
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const CITIES = ['Plano', 'Dallas', 'Frisco', 'Richardson', 'Allen', 'McKinney', 'Irving', 'Garland', 'Austin', 'Houston', 'Fort Worth'];
// States and their major cities, one line each, so the profile can offer a state first and then a
// city. Anything not listed is still allowed: the city box takes whatever the member types.
const US_PLACES = {
  AL: 'Birmingham, Montgomery, Huntsville, Mobile',
  AK: 'Anchorage, Fairbanks, Juneau',
  AZ: 'Phoenix, Tucson, Mesa, Scottsdale, Flagstaff',
  AR: 'Little Rock, Fayetteville, Fort Smith',
  CA: 'Los Angeles, San Diego, San Francisco, San Jose, Sacramento, Fresno, Long Beach, Oakland',
  CO: 'Denver, Colorado Springs, Boulder, Fort Collins, Aurora',
  CT: 'Hartford, New Haven, Stamford, Bridgeport',
  DE: 'Wilmington, Dover, Newark',
  DC: 'Washington',
  FL: 'Miami, Orlando, Tampa, Jacksonville, Tallahassee, Fort Lauderdale, St. Petersburg',
  GA: 'Atlanta, Savannah, Athens, Augusta, Columbus',
  HI: 'Honolulu, Hilo, Kailua',
  ID: 'Boise, Meridian, Idaho Falls',
  IL: 'Chicago, Springfield, Naperville, Peoria, Evanston',
  IN: 'Indianapolis, Fort Wayne, Bloomington, South Bend',
  IA: 'Des Moines, Cedar Rapids, Iowa City',
  KS: 'Wichita, Kansas City, Topeka, Lawrence',
  KY: 'Louisville, Lexington, Bowling Green',
  LA: 'New Orleans, Baton Rouge, Shreveport, Lafayette',
  ME: 'Portland, Bangor, Augusta',
  MD: 'Baltimore, Annapolis, Frederick, Rockville',
  MA: 'Boston, Cambridge, Worcester, Springfield, Somerville',
  MI: 'Detroit, Ann Arbor, Grand Rapids, Lansing',
  MN: 'Minneapolis, Saint Paul, Duluth, Rochester',
  MS: 'Jackson, Gulfport, Oxford',
  MO: 'Kansas City, Saint Louis, Springfield, Columbia',
  MT: 'Billings, Missoula, Bozeman',
  NE: 'Omaha, Lincoln, Grand Island',
  NV: 'Las Vegas, Reno, Henderson, Carson City',
  NH: 'Manchester, Concord, Nashua',
  NJ: 'Newark, Jersey City, Trenton, Princeton',
  NM: 'Albuquerque, Santa Fe, Las Cruces',
  NY: 'New York, Buffalo, Rochester, Albany, Syracuse, Brooklyn, Queens',
  NC: 'Charlotte, Raleigh, Durham, Greensboro, Asheville',
  ND: 'Fargo, Bismarck, Grand Forks',
  OH: 'Columbus, Cleveland, Cincinnati, Dayton, Toledo',
  OK: 'Oklahoma City, Tulsa, Norman',
  OR: 'Portland, Eugene, Salem, Bend',
  PA: 'Philadelphia, Pittsburgh, Harrisburg, Allentown',
  RI: 'Providence, Warwick, Newport',
  SC: 'Charleston, Columbia, Greenville',
  SD: 'Sioux Falls, Rapid City, Pierre',
  TN: 'Nashville, Memphis, Knoxville, Chattanooga',
  TX: 'Houston, Dallas, Austin, San Antonio, Fort Worth, Plano, Frisco, Richardson, Allen, McKinney, Irving, Garland, El Paso',
  UT: 'Salt Lake City, Provo, Ogden, Park City',
  VT: 'Burlington, Montpelier, Rutland',
  VA: 'Richmond, Virginia Beach, Arlington, Norfolk, Alexandria',
  WA: 'Seattle, Spokane, Tacoma, Bellevue, Olympia',
  WV: 'Charleston, Morgantown, Huntington',
  WI: 'Milwaukee, Madison, Green Bay',
  WY: 'Cheyenne, Casper, Jackson'
};
const STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware',
  DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico',
  NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia', WA: 'Washington',
  WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};
const placesIn = (code) => (code ? (US_PLACES[code] || '').split(',').map(s => s.trim()).filter(Boolean) : Object.values(US_PLACES).join(', ').split(',').map(s => s.trim()).filter(Boolean));
const stateOf = (city) => Object.keys(US_PLACES).find(k => placesIn(k).some(c => c.toLowerCase() === String(city || '').toLowerCase())) || '';

const icon = {
  check: '<svg class="ic" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l4 4 8-9"/></svg>',
  alert: '<svg class="ic" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="10" cy="10" r="8"/><path d="M10 6v5M10 14h.01"/></svg>',
  x: '<svg class="ic" viewBox="0 0 20 20" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>',
  chev: '<svg class="ic chev" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l5 5 5-5"/></svg>',
  send: '<svg class="ic" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 10l14-6-5 13-2-5-7-2z"/></svg>',
  arrow: '<svg class="ic" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h12M11 5l5 5-5 5"/></svg>',
  search: '<svg class="ic" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="9" r="6"/><path d="M14 14l4 4"/></svg>',
  users: '<svg class="ic" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7" cy="8" r="3"/><path d="M2.5 16c.6-2.4 2.4-3.5 4.5-3.5s3.9 1.1 4.5 3.5"/><circle cx="14" cy="9" r="2.4"/><path d="M13.5 12.8c1.8.2 3.2 1.2 3.8 3.2"/></svg>'
};
const markImg = (w = 40) => `<img src="assets/art/knot-mark.svg" width="${w}" height="${Math.round(w * 0.75)}" alt="" class="mark">`;
const hueOf = n => [...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const initials = n => n.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
// Avatar with picture, or colored initials.
const avatarHtml = (name, avatar, cls = '') => avatar
  ? `<span class="avatar ${cls}" aria-hidden="true"><img src="${esc(avatar)}" alt="" loading="lazy"></span>`
  : `<span class="avatar ${cls}" style="--hue:${hueOf(name || '?')}" aria-hidden="true">${esc(initials(name || '?'))}</span>`;

// ---------- state ----------
const state = {
  clientId: store.get('knot.clientId', null) || uid(),
  sessionId: null, sessionName: null,
  acct: null,            // signed-in account payload (with profile) or null for guests
  me: store.get('knot.me', null),   // guest profile kept locally (name, skills, city, ...)
  goal: store.get('knot.goal', ''),
  helpBusy: false,
  relaxed: [],
  resp: null, respKey: null,
  selected: new Set(),
  skills: [],
  rooms: [],             // the groups this person is in, so help can open one by name
  pollTimer: null,
  typingTimer: null
};
store.set('knot.clientId', state.clientId);

// One profile shape for both guests (localStorage) and accounts (server stored).
function myProfile() {
  if (state.acct && state.acct.profile) {
    const p = state.acct.profile;
    return { name: state.acct.name, skills: p.skills || [], skillLabels: p.skillLabels || [], interests: p.interests || [], goals: p.goals || '', bio: p.bio || '', city: p.city || '', availability: p.availability || [], mode: p.mode || 'both', avatar: p.avatar || null, custom: (state.me && state.me.custom) || null };
  }
  return state.me || { name: '', skills: [], interests: '', goals: '', bio: '', city: '', availability: [], mode: 'both', avatar: null, custom: null };
}
const meForApi = () => { const p = myProfile(); return { skills: p.skills, availability: p.availability }; };
const skillLabel = id => (state.skills.find(s => s.id === id) || { label: id }).label;

let localRooms = false;   // true on serverless hosts without a database: groups live in this browser
async function api(path, opts = {}) {
  if (localRooms && path.startsWith('/api/rooms')) return localRoomApi(path, opts);
  return apiRaw(path, opts);
}
async function localRoomApi(path, opts) {
  const method = (opts.method || 'GET').toUpperCase(), url = new URL(path, location.origin);
  const parts = url.pathname.split('/').filter(Boolean).slice(2), rooms = store.get('knot.rooms', []);
  const save = () => store.set('knot.rooms', rooms);
  const body = () => { try { return JSON.parse(opts.body || '{}'); } catch { return {}; } };
  const brief = ({ messages, ...r }) => ({ ...r, messageCount: messages.length, lastMessageAt: messages.length ? messages[messages.length - 1].ts : null });
  if (!parts.length && method === 'GET') {
    return { rooms: rooms.filter(r => r.clientId === state.clientId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(brief) };
  }
  // Groups saved in this browser have no server, so KNOT AI is listed as switched off: the same
  // member chip every server-backed group has, with no answer behind it.
  const aiMember = { id: 'knot-ai', name: 'KNOT AI', role: null, demo: false, you: false, ai: true, city: '', avatar: null, skillLabels: [], availabilityText: '', availabilityDays: null, modeText: 'Helper, switched off in this group' };
  const one = r => ({ ...r, members: [...r.members, aiMember], isMember: true, myRole: 'owner', visibility: 'private', joinMode: 'open', aiMode: 'off', capacity: 12, capacityUsed: r.members.length });
  if (!parts.length && method === 'POST') {
    const b = body(), dup = rooms.find(r => r.requestId === b.requestId);
    if (dup) return { room: dup, duplicate: true };
    if (!b.title || !b.goal) throw new Error('A group needs a name and a goal.');
    const { members } = await apiRaw('/api/members', { method: 'POST', body: JSON.stringify({ ids: b.memberIds }) });
    if (!members.length) throw new Error('Select at least one person for the group.');
    members.forEach(m => { m.demo = true; m.you = false; });
    const label = id => (state.skills.find(s => s.id === id) || { label: id }).label;
    const owner = { id: b.clientId, name: b.ownerName, you: true, demo: false, skillLabels: (b.ownerSkills || []).map(label), availabilityDays: null, availabilityText: 'You' };
    const room = { id: uid(), requestId: b.requestId, clientId: b.clientId, title: b.title, goal: b.goal, ownerName: b.ownerName, createdAt: new Date().toISOString(), members: [owner, ...members], messages: [] };
    rooms.push(room); save(); return { room };
  }
  const room = rooms.find(r => r.id === parts[0]);
  if (!room) throw new Error('This group could not be found. It lives in the browser that created it. Open My groups to see the ones saved here.');
  if (parts.length === 1) return { room: one(room) };
  if (parts[1] === 'messages') {
    const b = body(), text = String(b.text || '').trim().slice(0, 2000);
    if (!text) throw new Error('Type a message first.');
    const message = { id: uid(), authorId: b.authorId || state.clientId, authorName: b.authorName || 'Someone', text, kind: b.kind === 'assistant' ? 'assistant' : 'user', ts: new Date().toISOString() };
    room.messages.push(message); save(); return { message };
  }
  if (parts[1] === 'assist') return apiRaw('/api/assist', { method: 'POST', body: JSON.stringify({ room: { goal: room.goal, members: room.members } }) });
  throw new Error('Not found');
}
async function apiRaw(path, opts = {}) {
  const r = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  let d = null; try { d = await r.json(); } catch { /* non-json */ }
  if (!r.ok) { const e = new Error((d && d.error) || `Request failed (${r.status})`); if (d && d.held) e.held = true; throw e; }
  return d;
}
// A confirmation has to be visible as well as announced: the live region is for screen readers, and
// the toast is the same sentence shown on the page for a moment. Copying a link, saving a profile or
// muting the helper all leave no trace on screen, so this is what tells the member it worked.
let toastTimer = null;
function say(t) {
  const l = $('#live');
  if (l) { l.textContent = ''; setTimeout(() => { l.textContent = t; }, 30); }
  let box = $('#toast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'toast';
    box.className = 'toast';
    box.setAttribute('role', 'status');
    document.body.append(box);
  }
  box.textContent = t;
  box.classList.add('on');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('on'), 2800);
}
const hideErr = sel => { const e = $(sel); if (e) e.hidden = true; };
// my principal id, the same shape the server stamps on messages and members
const myPid = () => state.acct ? 'a:' + state.acct.accountId : (state.sessionId ? String(state.sessionId) : null);

// ---------- ways out ----------
// Every dialog closes from the same corner button, so nothing is a trap. It sits on the dialog
// itself rather than inside the scrolling form, so it stays put when a long one scrolls.
function wireDialogClose(d) {
  // Clicking the dark space around the card closes it, so no dialog in KNOT ever traps someone who
  // does not want to answer it. Escape already works: this is the mouse equivalent.
  if (!d.dataset.backdrop) {
    d.dataset.backdrop = '1';
    d.addEventListener('click', e => { if (e.target === d) d.close(); });
  }
  if (!d.querySelector('.dlg') || d.querySelector('.dlg-x')) return;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'dlg-x';
  b.setAttribute('aria-label', 'Close');
  b.innerHTML = '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5.5 5.5l9 9M14.5 5.5l-9 9"/></svg>';
  b.addEventListener('click', () => d.close());
  d.querySelector('.dlg').classList.add('has-x');
  d.append(b);
}
// ---------- asking before something that cannot be undone ----------
// A question in KNOT's own clothes instead of the browser's confirm box. The answer comes back as
// a promise, so a caller reads "if (await askConfirm(...))" the same way it read "if (!confirm())".
// The safe answer holds the focus on a destructive question, so a stray Enter never deletes.
let askClose = null;
function askConfirm({ title, body, yes = 'Continue', no = 'Cancel', danger = false }) {
  const d = $('#askDialog');
  if (!d) return Promise.resolve(false);
  if (askClose) askClose(false);
  return new Promise(resolve => {
    let settled = false;
    const finish = v => {
      if (settled) return;
      settled = true; askClose = null;
      d.removeEventListener('close', onClose);
      if (d.open) d.close();
      resolve(v);
    };
    const onClose = () => finish(false);
    askClose = finish;
    d.innerHTML = `<div class="dlg ask${danger ? ' danger' : ''}">
      <span class="ask-badge" aria-hidden="true">${danger ? icon.alert : icon.check}</span>
      <div class="ask-copy">
        <h2 id="askTitle">${esc(title)}</h2>
        <p>${esc(body)}</p>
      </div>
      <div class="dlg-actions ask-actions">
        <button type="button" class="btn ghost" data-no>${esc(no)}</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(yes)}</button>
      </div>
    </div>`;
    $('[data-no]', d).addEventListener('click', () => finish(false));
    $('[data-yes]', d).addEventListener('click', () => finish(true));
    d.addEventListener('close', onClose);
    d.showModal();
    // Clicking outside the card is the same as the safe answer.
    if (!d.dataset.backdrop) {
      d.dataset.backdrop = '1';
      d.addEventListener('click', e => { if (e.target === d) d.close(); });
    }
    (danger ? $('[data-no]', d) : $('[data-yes]', d)).focus();
  });
}

// A plain link back to the page that owns this one: hash routing means no history games.
const backLink = (href, label) => `<a class="back-btn" href="${href}"><svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4l-6 6 6 6"/></svg>${esc(label)}</a>`;

// ---------- header ----------
function paintHeader() {
  const p = myProfile();
  const av = $('#profileAvatar');
  av.innerHTML = p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : (p.name ? esc(initials(p.name)) : '?');
  $('#profileLabel').textContent = p.name ? p.name.split(' ')[0] : 'Profile';
  // Signing out lives in the profile dialog: the header keeps one clear action, which is signing in.
  const ab = $('#authBtn'); if (ab) { ab.textContent = 'Sign in'; ab.hidden = !!state.acct; }
  // There is no profile to open until there is an account, so a signed-out header is Home and
  // Sign in and nothing else. A guest still reaches their browser-kept profile from the home page.
  const pb = $('#profileBtn'); if (pb) pb.hidden = !state.acct;
  const h = location.hash || '#/';
  // Discover, the AI Finder and My groups are members-only: until there is an account they are
  // not in the header at all, and their routes land on a sign-in card instead of the page.
  ['navDiscover', 'navFinder', 'navGroups'].forEach(id => { const el = $('#' + id); if (el) el.hidden = !state.acct; });
  $('#navHome').setAttribute('aria-current', h === '#/' || h === '' ? 'page' : 'false');
  $('#navDiscover').setAttribute('aria-current', h.startsWith('#/discover') ? 'page' : 'false');
  $('#navFinder').setAttribute('aria-current', h.startsWith('#/finder') ? 'page' : 'false');
  $('#navGroups').setAttribute('aria-current', h.startsWith('#/groups') || h.startsWith('#/room') ? 'page' : 'false');
}
async function refreshGroupCount() {
  try {
    const { rooms } = await api('/api/rooms?clientId=' + encodeURIComponent(state.clientId));
    state.rooms = rooms;
    const c = $('#groupCount'); c.textContent = rooms.length; c.hidden = !rooms.length;
    return rooms;
  } catch { return state.rooms || []; }
}

// ---------- routing ----------
function route(initial) {
  stopPoll();
  const h = location.hash || '#/';
  paintHeader();
  closeMenu();
  ['profileDialog', 'createDialog', 'authDialog', 'settingsDialog', 'helpDialog', 'askDialog'].forEach(id => { const d = $('#' + id); if (d && d.open) d.close(); });
  paintHelpButton();
  document.body.classList.remove('has-create');
  if (h.startsWith('#/room/')) renderRoom(h.slice(7));
  else if (h.startsWith('#/join/')) renderJoin(h.slice(7));
  else if (!state.acct && (h === '#/discover' || h === '#/finder' || h === '#/groups')) renderLocked(h.slice(2));
  else if (h === '#/discover') renderDiscover();
  else if (h === '#/groups') renderGroups();
  else if (h === '#/finder') renderFinder();
  else renderHome(initial);
  refreshGroupCount();
}
window.addEventListener('hashchange', () => route(false));

// members-only pages, reached without an account
const LOCKED = {
  discover: { title: 'Discover is for members', hint: 'Public groups and real members open up once you have an account. It is how groups stay moderated and how blocked people stay apart.' },
  finder: { title: 'The AI Finder is for members', hint: 'Matching reads the interests and skills saved on your account, so it needs an account to work from.' },
  groups: { title: 'My groups is for members', hint: 'Your groups follow your account, so they need an account to live in. Sign in and they are all here.' }
};
function renderLocked(key) {
  const c = LOCKED[key] || LOCKED.finder;
  $('#main').innerHTML = `<section class="page" aria-labelledby="lk">
    ${backLink('#/', 'Back to home')}
    <div class="lock-card">
      <img class="lock-art" src="assets/art/puzzle_piece.png" width="96" height="98" alt="">
      <div class="lock-copy">
        <h1 id="lk" tabindex="-1" class="page-title">${esc(c.title)}</h1>
        <p class="lead">${esc(c.hint)}</p>
        <div class="lock-actions">
          <button type="button" class="btn primary" id="lockIn">Sign in</button>
          <button type="button" class="btn ghost" id="lockUp">Create an account</button>
        </div>
      </div>
    </div>
  </section>`;
  $('#lk').focus({ preventScroll: true });
  $('#lockIn').addEventListener('click', () => openAuth('in'));
  $('#lockUp').addEventListener('click', () => openAuth('up'));
}

// mobile menu
function closeMenu() {
  const n = $('#mobileNav'), b = $('#menuBtn');
  if (n) n.classList.remove('open');
  if (b) b.setAttribute('aria-expanded', 'false');
}

// ---------- HOME ----------
function renderHome() {
  // Signed-in members come here to work, not to read about KNOT: a goal box, the groups open to
  // them, and the two profile lists matching runs on. Visitors who are not signed in still get the
  // marketing page that explains what KNOT is and offers an account.
  if (state.acct) return renderMemberHome();
  $('#main').innerHTML = `
  <div id="home" class="home">
    <section class="hero" aria-labelledby="h1">
      <div class="hero-copy">
        <div class="hero-headline">
          <img class="hero-knot" src="assets/art/hero-knot.png" width="1200" height="311" alt="" aria-hidden="true">
          <h1 id="h1">Find your <span class="hero-people">people<svg class="hero-underline" viewBox="0 0 200 12" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path d="M2 9C50 3 150 3 198 8" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg></span>.<br>Make it <span class="hero-strong">happen.</span></h1>
        </div>
        <p class="hero-sub">Discover people who share your interests, build groups, and turn ideas into something real.</p>
        <div class="hero-actions">
          <a class="btn primary" href="#/finder">Find your people</a>
          <a class="btn ghost" href="#/discover">Explore groups</a>
        </div>
      </div>
    </section>

    <section class="section reveal" aria-labelledby="hgh">
      <div class="sec-head">
        <h2 id="hgh">Groups happening now</h2>
        <a class="see-all" href="#/discover">See all ${icon.arrow}</a>
      </div>
      <div id="homeGroupsList" class="grid3" aria-live="polite"><p class="hint">Loading…</p></div>
    </section>

    <section class="section reveal center" aria-labelledby="hwh">
      <h2 id="hwh">How KNOT works</h2>
      <ol class="steps">
        <li><span class="n" aria-hidden="true">1</span><div><strong>Find people</strong><p>Say what you want to do. KNOT explains who fits and why.</p></div></li>
        <li><span class="n" aria-hidden="true">2</span><div><strong>Join or create groups</strong><p>Start a group from your matches, or discover public groups and join in one tap.</p></div></li>
        <li><span class="n" aria-hidden="true">3</span><div><strong>Collaborate</strong><p>Chat in a persistent group room and turn the idea into something real.</p></div></li>
      </ol>
    </section>

    <section class="section reveal center" aria-labelledby="haih">
      <h2 id="haih">KNOT AI</h2>
      <div class="ai-grid">
        <div class="ai-card"><h3>Matching</h3><p>Describe a goal in plain words. AI reads the intent, and every match cites the real stored profile fields behind it.</p></div>
        <div class="ai-card"><h3>Recommendations</h3><p>No exact match? KNOT suggests real related people and communities, and tells you why they are relevant.</p></div>
        <div class="ai-card"><h3>Group assistance</h3><p>Owners can switch on an assistant that helps plan tasks, brainstorm, and summarize decisions. Off by default.</p></div>
      </div>
    </section>

    <section class="home-cta reveal">
      <h2>Ready to make it happen?</h2>
      <p>${state.acct ? 'Describe a goal and KNOT will find your people.' : 'Create a free account and join your first group in about a minute.'}</p>
      ${state.acct
        ? '<a class="btn primary" href="#/finder">Find your people</a>'
        : '<button type="button" class="btn primary" id="ctaJoin">Create free account</button>'}
    </section>
    <footer class="site-foot">
      <p><strong>KNOT</strong> · find your people</p>
      <p class="small">Made for ITKAN. Matching runs on local rules with AI assistance where switched on. Demo profiles are fictional and always labeled. Group owners moderate their groups; report anything that worries you. KNOT cannot promise anyone is safe: meet in public, bring a friend, tell someone where you are. KNOT is for members 18 and over.</p>
    </footer>
  </div>`;
  const cta = $('#ctaJoin'); if (cta) cta.addEventListener('click', () => openAuth('up'));
  paintHomeGroups(3);
  if (!reduceMotion()) requestAnimationFrame(() => document.body.classList.add('booted'));
}

// The signed-in home. Same goal box as the AI Finder, so a member lands on something to use
// instead of something to read. The metallic objects are decoration only: small, slow and off for
// anyone who asked their system for less motion.
function renderMemberHome() {
  $('#main').innerHTML = `
  <div id="home" class="home member-home">
    <section class="mhero" aria-labelledby="h1">
      <div class="mhero-copy">
        <h1 id="h1" tabindex="-1">What do <span class="mhero-hl">you</span> want<br>to do?</h1>
        <p class="mhero-sub">Say it in your own words. KNOT finds the people who fit and tells you why.</p>
        <div class="goal-wrap">
          <form id="goalForm" class="goal-form" novalidate>
            <label class="sr" for="goal">Describe your goal</label>
            <textarea id="goal" rows="2" maxlength="500" autocomplete="off" spellcheck="true" placeholder="I want to start a band and need a drummer."></textarea>
            <div class="goal-row">
              <p class="hint">Say what, where and when.</p>
              <button class="btn primary" id="findBtn" type="submit"><span class="btn-label">Find my people</span></button>
            </div>
          </form>
          <p class="msg err" id="finderErr" role="alert" hidden></p>
        </div>
        <div id="homeResults"></div>
      </div>
      <div id="createBar" class="create-bar" hidden>
        ${markImg(34)}
        <p id="createText"></p>
        <button class="btn primary" id="createBtn" type="button">Create group</button>
      </div>
    </section>

    <section class="section reveal" aria-labelledby="hgh">
      <div class="sec-head">
        <h2 id="hgh">Groups you could join</h2>
        <a class="see-all" href="#/discover">See all ${icon.arrow}</a>
      </div>
      <div id="homeGroupsList" class="grid3" aria-live="polite"><p class="hint">Loading…</p></div>
    </section>

    <section class="section reveal" aria-labelledby="hbring">
      <div class="sec-head stack">
        <div>
          <h2 id="hbring">What you bring, what you need</h2>
          <p class="hint">Saved to your profile. Matching reads these, so keep them current.</p>
        </div>
      </div>
      <div class="offer-grid">
        <div class="offer-card">
          <h3>What you offer</h3>
          <p class="hint">Skills and hobbies other people can count on.</p>
          <div class="chips" id="offerChips"></div>
          <div class="interest-row" id="offerRow">
            <input id="offerInput" type="text" maxlength="40" autocomplete="off" placeholder="e.g. video editing">
            <button type="button" class="btn ghost sm" id="offerAdd">Add</button>
          </div>
          <p class="msg err small" id="offerErr" role="alert" hidden></p>
        </div>
        <div class="offer-card">
          <h3>What you are looking for</h3>
          <p class="hint">Up to three. KNOT suggests people around these.</p>
          <div class="chips" id="lookChips"></div>
          <div class="interest-row" id="lookRow">
            <input id="lookInput" type="text" maxlength="40" autocomplete="off" placeholder="e.g. a drummer">
            <button type="button" class="btn ghost sm" id="lookAdd">Add</button>
          </div>
        </div>
      </div>
      <div class="offer-actions">
        <button type="button" class="btn primary" id="offerSave">Save changes</button>
        <p class="msg ok small" id="offerMsg" role="status" hidden></p>
      </div>
    </section>
  </div>`;
  $('#h1').focus({ preventScroll: true });

  const goal = $('#goal');
  goal.value = state.goal;
  goal.addEventListener('input', () => { state.goal = goal.value; store.set('knot.goal', state.goal); hideErr('#finderErr'); });
  goal.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); findPeople(false, '#homeResults'); } });
  $('#goalForm').addEventListener('submit', e => { e.preventDefault(); findPeople(false, '#homeResults'); });
  $('#createBtn').addEventListener('click', openCreate);
  if (state.resp && state.resultsTarget === '#homeResults') renderResultsInto('#homeResults', state.resp);

  paintHomeGroups(6);
  paintOfferEditor();
  if (!reduceMotion()) requestAnimationFrame(() => document.body.classList.add('booted'));
}

// "What you offer" is skills, "what you are looking for" is interests: the two lists the matcher
// actually reads. Editing here saves the same fields the profile dialog does.
function paintOfferEditor() {
  const p = myProfile();
  const skills = [...(p.skills || [])];
  const looks = [...(p.interests || [])];
  const chips = (box, items, remove) => {
    const el = $(box); if (!el) return;
    el.innerHTML = items.length
      ? items.map((x, i) => `<span class="tag strong">${esc(x)}<button type="button" class="tag-x" data-rm="${i}" aria-label="Remove ${esc(x)}">${icon.x}</button></span>`).join('')
      : '<span class="hint">Nothing here yet.</span>';
    $$('[data-rm]', el).forEach(b => b.addEventListener('click', () => { remove(Number(b.dataset.rm)); paint(); }));
  };
  const paint = () => {
    chips('#offerChips', skills.map(skillLabel), i => skills.splice(i, 1));
    chips('#lookChips', looks, i => looks.splice(i, 1));
    $('#offerRow').hidden = skills.length >= 12;
    $('#lookRow').hidden = looks.length >= 3;
    const msg = $('#offerMsg'); if (msg) msg.hidden = true;
  };
  const addSkill = async () => {
    const inp = $('#offerInput'); const typed = inp.value.trim();
    if (!typed) return;
    const known = state.skills.find(s => s.label.toLowerCase() === typed.toLowerCase())
      || state.skills.find(s => s.label.toLowerCase().includes(typed.toLowerCase()));
    let ids = known ? [known.id] : [];
    if (!ids.length) {
      // A word KNOT does not know: the skill mapper reads it and returns the closest real skills.
      try { ids = (await api('/api/skills/map', { method: 'POST', body: JSON.stringify({ text: typed }) })).ids || []; } catch { ids = []; }
    }
    const fresh = ids.filter(id => !skills.includes(id));
    if (!fresh.length) {
      const e = $('#offerErr');
      e.innerHTML = icon.alert + `<span>KNOT could not match "${esc(typed)}" to a skill. Try another word.</span>`;
      e.hidden = false; return;
    }
    fresh.forEach(id => { if (skills.length < 12) skills.push(id); });
    inp.value = ''; paint(); inp.focus();
  };
  const addLook = () => {
    const inp = $('#lookInput'); const v = inp.value.trim();
    if (v && !looks.includes(v) && looks.length < 3) looks.push(v);
    inp.value = ''; paint();
    if (looks.length < 3) inp.focus();
  };
  $('#offerAdd').addEventListener('click', addSkill);
  $('#offerInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addSkill(); } });
  $('#lookAdd').addEventListener('click', addLook);
  $('#lookInput').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addLook(); } });
  $('#offerSave').addEventListener('click', async () => {
    const btn = $('#offerSave'); btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const me = await apiRaw('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ skills, interests: looks }) });
      state.acct = me;
      paintHeader();
      const msg = $('#offerMsg'); msg.className = 'msg ok small'; msg.textContent = 'Saved. Matching will use this straight away.'; msg.hidden = false;
    } catch (ex) {
      const msg = $('#offerMsg'); msg.className = 'msg err small'; msg.textContent = ex.message; msg.hidden = false;
    } finally { btn.disabled = false; btn.textContent = 'Save changes'; }
  });
  paint();
}

async function paintHomeGroups(limit = 3) {
  const box = $('#homeGroupsList'); if (!box) return;
  if (!state.acct) {
    box.innerHTML = `<div class="empty small-pad"><div><p class="hint">Public groups are visible to members.</p>
      <button type="button" class="btn primary sm" id="hgSignin">Create free account</button></div></div>`;
    const b = $('#hgSignin'); if (b) b.addEventListener('click', () => openAuth('up'));
    return;
  }
  try {
    const { groups } = await apiRaw('/api/groups');
    // The API already leaves out groups this member is in; a full group is not one you could join
    // either, so it drops off this list too.
    const open = groups.filter(g => g.memberCount < g.capacity);
    if (!open.length) {
      box.innerHTML = `<div class="empty small-pad"><div><h3>Nothing open to join yet</h3>
        <p>Public groups from other members show up here while they have space. Your own groups are in My groups.</p>
        <a class="btn ghost sm" href="#/groups">My groups</a></div></div>`;
      return;
    }
    box.innerHTML = open.slice(0, limit).map(g => `
      <a class="group-card" href="#/room/${esc(g.id)}">
        <span class="gc-top"><strong>${esc(g.title)}</strong><span class="meta">${g.memberCount}/${g.capacity} members · ${g.onlineOnly ? 'online' : (g.city ? esc(g.city) : 'in person')}</span></span>
        <span class="gc-goal">${esc(g.description || g.goal)}</span>
        <span class="gc-join">${g.joinMode === 'request' ? 'Ask to join' : 'Open'} ${icon.arrow}</span>
      </a>`).join('');
  } catch { box.innerHTML = `<p class="hint">Could not load groups right now.</p>`; }
}

// ---------- AI FINDER + MATCHING ----------
state.finder = { items: [], busy: false, error: null };
const FINDER_IDEAS = ['I want to make a Roblox game, but I need someone who understands scripting', 'I need someone to edit my short film', 'Looking for a board game night in Plano'];

function renderResultsInto(sel, resp) {
  const box = $(sel); if (!box) return;
  const it = resp.interpreted;
  const chips = [];
  chips.push(`<span class="tag">You offer: ${esc(it.offers.map(o => o.label).join(', ') || 'nothing yet')}</span>`);
  if (it.needs.length) chips.push(`<span class="tag strong">Looking for: ${esc(it.needs.map(o => o.label).join(', '))}</span>`);
  it.constraints.forEach(c => chips.push(c.relaxed
    ? `<span class="tag relaxed">${esc(c.label)} (relaxed)</span>`
    : `<span class="tag req">${esc(c.label)}<button type="button" class="tag-x" data-relax="${c.key}" aria-label="Relax ${esc(c.label)}">${icon.x}</button></span>`));
  const people = resp.people && resp.people.length ? `
    <div class="real-people">
      <h3>Real members on KNOT</h3>
      <ul class="people-list">${resp.people.map(p => `<li>${avatarHtml(p.name, p.avatar, 'sm')}<span class="p-main"><strong>${esc(p.name)}</strong> <span class="meta">${esc(p.city || 'anywhere')} · ${esc(p.modeText)}</span><span class="p-bio">${esc(p.reason)}.</span></span></li>`).join('')}</ul>
    </div>` : '';
  const alt = resp.alternativeGroups && resp.alternativeGroups.length ? `
    <div class="real-people">
      <h3>Closest public groups</h3>
      <p class="hint">No exact skill match in the demo community yet, but these real groups touch the same topic.</p>
      <ul class="people-list">${resp.alternativeGroups.map(g => `<li>${markImg(32)}<span class="p-main"><strong>${esc(g.title)}</strong> <span class="meta">${g.memberCount}/${g.capacity} members</span><span class="p-bio">${esc(g.goal)}</span></span><a class="btn ghost sm" href="#/room/${esc(g.id)}">Open</a></li>`).join('')}</ul>
    </div>` : '';
  if (resp.empty && !resp.results.length) {
    box.innerHTML = `<div class="interp">${chips.join('')}</div>${people}${alt}
      <div class="empty"><div><h3>No one fits yet</h3><p>${esc(resp.empty.message)}</p>
      ${resp.empty.options.length ? `<div class="relax-row">${resp.empty.options.map(o => `<button type="button" class="chip" data-relax="${o.key}">${esc(o.text)} <span class="chip-note">${o.count} ${o.count === 1 ? 'person' : 'people'}</span></button>`).join('')}</div>` : ''}</div></div>`;
  } else {
    box.innerHTML = `<div class="interp">${chips.join('')}</div>${resp.notice ? `<p class="notice">${esc(resp.notice)}</p>` : ''}${people}
      <ul class="results">${resp.results.map(r => resultCard(r)).join('')}</ul>${alt}`;
  }
  $$('[data-relax]', box).forEach(b => b.addEventListener('click', () => {
    if (!state.relaxed.includes(b.dataset.relax)) state.relaxed.push(b.dataset.relax);
    findPeople(true);
  }));
  $$('.pick input[type=checkbox]', box).forEach(cb => cb.addEventListener('change', () => {
    const li = cb.closest('li');
    if (cb.checked) state.selected.add(li.dataset.id); else state.selected.delete(li.dataset.id);
    li.classList.toggle('selected', cb.checked);
    updateCreateBar();
  }));
  $$('.why-btn', box).forEach(b => b.addEventListener('click', () => {
    const li = b.closest('li'); const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', open); $('.why', li).hidden = !open;
  }));
}

function resultCard(r) {
  const sel = state.selected.has(r.id);
  return `<li class="card ${sel ? 'selected' : ''}" data-id="${esc(r.id)}">
    <div class="card-grid">
      <label class="pick"><input type="checkbox" ${sel ? 'checked' : ''} aria-label="Add ${esc(r.name)} to a group"><span class="box">${icon.check}</span><span class="pick-text"><span class="when-off">Add to group</span><span class="when-on">Added</span></span></label>
      <div class="card-body">
        <div class="card-top"><h3>${esc(r.name)}</h3><span class="meta">${esc(r.city)} · ${esc(r.modeText)}</span></div>
        <p class="bring"><span class="bring-label">Brings</span>${r.bring.map(b => `<span class="skill-chip">${esc(b)}</span>`).join('')}</p>
        <p class="reason">${esc(r.reason)}</p>
        <ul class="pairs">${r.pairs.map(p => `<li><span class="need">${esc(p.need)}</span><span class="pair-arrow" aria-hidden="true">${icon.arrow}</span><span class="offer">${esc(p.offer)}</span></li>`).join('')}</ul>
        ${r.flags.map(f => `<p class="msg warn">${icon.alert}<span><strong>${esc(f.text)}.</strong> ${esc(f.explain)}</span></p>`).join('')}
        <button type="button" class="why-btn" aria-expanded="false" aria-controls="why-${esc(r.id)}">Why this match? ${icon.chev}</button>
        <div class="why" id="why-${esc(r.id)}" hidden>
          <p class="why-title">Exactly what KNOT used</p>
          <dl>${r.evidence.map(e => `<div><dt>${esc(e.label)}</dt><dd>${esc(e.value)}</dd></div>`).join('')}</dl>
        </div>
      </div></div></li>`;
}

async function findPeople(force, containerSel) {
  const goal = state.goal.trim();
  const err = $('#finderErr');
  if (!goal) { if (err) { err.innerHTML = icon.alert + '<span>Type a goal first, or tap one of the ideas.</span>'; err.hidden = false; } return; }
  if (!myProfile().name) { openProfile({ thenSearch: true }); return; }
  hideErr('#finderErr');
  // Remember where results belong, so a relaxed re-run lands in the same box it came from.
  const target = containerSel || state.resultsTarget || '#matchResults';
  state.resultsTarget = target;
  const btn = $('#findBtn'); if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
  try {
    const resp = await api('/api/match', { method: 'POST', body: JSON.stringify({ goal, me: meForApi(), relaxed: state.relaxed }) });
    state.resp = resp;
    renderResultsInto(target, resp);
    updateCreateBar();
    say(resp.results.length ? `${resp.results.length} ${resp.results.length === 1 ? 'person fits' : 'people fit'} your goal.` : 'No exact fit yet. See the suggestions.');
  } catch (e) {
    if (err) { err.innerHTML = icon.alert + `<span>KNOT could not run the match (${esc(e.message)}). Try again.</span>`; err.hidden = false; }
  } finally { if (btn) { btn.disabled = false; btn.removeAttribute('aria-busy'); } }
}

async function renderFinder() {
  const aiOn = await apiRaw('/api/status').then(s => s.ai).catch(() => false);
  state.resultsTarget = '#matchResults';
  $('#main').innerHTML = `<section class="page finder" aria-labelledby="fh">
    ${backLink('#/', 'Back to home')}
    <h1 id="fh" tabindex="-1" class="page-title">AI Finder</h1>
    <p class="lead">Describe what you want to do. KNOT finds people who fit, and explains why.</p>
    ${aiOn ? '' : `<p class="msg info small">AI chat is not configured on this server, so the matching box below runs on KNOT's local rules.</p>`}
    <div class="goal-wrap">
      <form id="goalForm" class="goal-form" novalidate>
        <label class="sr" for="goal">Describe your goal</label>
        <textarea id="goal" rows="2" maxlength="500" autocomplete="off" spellcheck="true" placeholder="I want to make a Roblox game, but I need someone who understands scripting."></textarea>
        <div class="goal-row">
          <p class="hint">Say what, where and when.</p>
          <button class="btn primary" id="findBtn" type="submit"><span class="btn-label">Find my people</span></button>
        </div>
      </form>
      <p class="msg err" id="finderErr" role="alert" hidden></p>
    </div>
    <div id="matchResults"></div>
    <div class="finder-chat">
      <h2>Talk it through with the AI Finder</h2>
      <div class="chat" id="fLog" role="log" aria-live="polite" aria-label="Conversation"></div>
      <div class="ideas" id="fIdeas"></div>
      <form id="fForm" class="chat-form" novalidate>
        <label class="sr" for="fInput">Message to the AI Finder</label>
        <input id="fInput" type="text" maxlength="300" autocomplete="off" placeholder="What do you want to do?" ${aiOn ? '' : 'disabled'}>
        <button class="btn primary" id="fSend" type="submit" ${aiOn ? '' : 'disabled'}>Send ${icon.send}</button>
      </form>
    </div>
    <div id="createBar" class="create-bar" hidden>
      ${markImg(34)}
      <p id="createText"></p>
      <button class="btn primary" id="createBtn" type="button">Create group</button>
    </div>
  </section>`;
  $('#fh').focus({ preventScroll: true });
  const goal = $('#goal');
  goal.value = state.goal;
  goal.addEventListener('input', () => { state.goal = goal.value; store.set('knot.goal', state.goal); hideErr('#finderErr'); });
  goal.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); findPeople(); } });
  $('#goalForm').addEventListener('submit', e => { e.preventDefault(); findPeople(); });
  $('#createBtn').addEventListener('click', openCreate);
  if (state.resp) renderResultsInto('#matchResults', state.resp);
  else if (state.goal.trim() && myProfile().name) findPeople();
  // chat
  const ideas = (list, label) => { const b = $('#fIdeas'); if (b) b.innerHTML = `<span class="ex-label">${esc(label)}</span>` + list.map(x => `<button type="button" class="chip example" data-idea="${esc(x)}">${esc(x)}</button>`).join(''); };
  ideas(FINDER_IDEAS, 'Try one of these');
  paintFinder();
  const send = txt => {
    txt = txt.trim();
    if (!txt || state.finder.busy) return;
    state.finder.items.push({ role: 'user', content: txt });
    $('#fInput').value = '';
    finderAsk();
  };
  $('#fForm').addEventListener('submit', e => { e.preventDefault(); send($('#fInput').value); });
  $('#fIdeas').addEventListener('click', e => { const b = e.target.closest('[data-idea]'); if (b) send(b.dataset.idea); });
  $('#fLog').addEventListener('click', e => {
    const o = e.target.closest('[data-use]');
    if (o) { state.goal = o.dataset.use; store.set('knot.goal', state.goal); state.relaxed = []; state.resp = null; state.selected.clear(); findPeople(true); $('#matchResults').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
}

function finderCard(r) {
  return `<li class="fcard">${avatarHtml(r.name, r.avatar, 'sm')}
    <div><strong>${esc(r.name)}</strong> <span class="meta">${esc(r.city)} · ${esc(r.modeText)}</span>
    <p>${esc(r.reason)}</p></div></li>`;
}
function paintFinder() {
  const log = $('#fLog'); if (!log) return;
  const items = state.finder.items;
  const bubble = (m, i) => {
    if (m.role === 'user') return `<div class="bubble me">${esc(m.content)}</div>`;
    let extra = '';
    if (m.result) {
      const res = m.result.results || [];
      const people = m.result.people || [];
      const alts = m.result.alternativeGroups || [];
      extra = res.length ? `<ul class="fcards">${res.map(finderCard).join('')}</ul>` : '';
      if (people.length) extra += `<div class="f-real"><span class="ex-label">Real members</span><ul class="fcards">${people.map(p => `<li class="fcard">${avatarHtml(p.name, p.avatar, 'sm')}<div><strong>${esc(p.name)}</strong><p>${esc(p.reason)}.</p></div></li>`).join('')}</ul></div>`;
      if (alts.length) extra += `<div class="f-real"><span class="ex-label">Related public groups</span><ul class="fcards">${alts.map(g => `<li class="fcard">${markImg(28)}<div><strong>${esc(g.title)}</strong><p>${esc(g.goal)}</p></div></li>`).join('')}</ul></div>`;
      if (!res.length && !people.length && !alts.length) extra = `<p class="fnone">${esc((m.result.empty && m.result.empty.message) || 'No one fits that yet.')}</p>`;
      if (m.goal) extra += `<button type="button" class="btn primary sm" data-use="${esc(m.goal)}">Show in the matcher ${icon.arrow}</button>`;
    }
    return `<div class="bubble bot">${esc(m.content)}${extra}</div>`;
  };
  log.innerHTML = (items.length ? '' : `<div class="bubble bot">Hi! Tell me what you want to do and who you need. I'll turn it into matches.</div>`) +
    items.map(bubble).join('') +
    (state.finder.busy ? '<div class="bubble bot typing" aria-label="KNOT is thinking"><i></i><i></i><i></i></div>' : '') +
    (state.finder.error ? `<p class="msg err" role="alert">${icon.alert}<span>${esc(state.finder.error)}</span></p>` : '');
  log.scrollTop = log.scrollHeight;
  const send = $('#fSend'); if (send) { send.disabled = state.finder.busy; }
}
async function finderAsk() {
  const f = state.finder; f.busy = true; f.error = null; paintFinder();
  try {
    const history = f.items.map(m => ({ role: m.role, content: m.content }));
    const out = await api('/api/ai/finder', { method: 'POST', body: JSON.stringify({ history, me: { skills: myProfile().skills } }) });
    f.items.push({ role: 'assistant', content: out.reply, goal: out.goal, result: out.result });
  } catch (e) { f.error = e.message; }
  f.busy = false; paintFinder();
  const i = $('#fInput'); if (i) i.focus({ preventScroll: true });
}

// ---------- DISCOVER ----------
async function renderDiscover() {
  const main = $('#main');
  main.innerHTML = `<section class="page" aria-labelledby="dh">
    ${backLink('#/', 'Back to home')}
    <h1 id="dh" tabindex="-1" class="page-title">Discover</h1>
    <p class="lead">Public groups and real members of KNOT.</p>
    <div id="discBody" aria-live="polite"><p class="hint">Loading…</p></div></section>`;
  $('#dh').focus({ preventScroll: true });
  const body = $('#discBody');
  if (!state.acct) {
    body.innerHTML = `<div class="empty"><img src="assets/art/puzzle_piece.png" width="110" height="112" alt="" class="empty-art"><div><h2>Sign in to discover</h2><p>Discovery is for members with accounts, so groups stay well moderated and blocked people stay apart.</p><button type="button" class="btn primary" id="discSignin">Sign in</button></div></div>`;
    $('#discSignin').addEventListener('click', () => openAuth('in'));
    return;
  }
  let tab = 'groups', q = '', groups = [], people = [];
  const paint = () => {
    const ql = q.toLowerCase();
    if (tab === 'groups') {
      const list = groups.filter(g => !q || [g.title, g.goal, g.description, g.category].filter(Boolean).join(' ').toLowerCase().includes(ql));
      body.innerHTML = `
        <div class="disc-filters">
          <input id="discQ" type="search" maxlength="60" placeholder="Search groups" aria-label="Search groups" value="${esc(q)}">
          <div class="chips" role="tablist">
            <button type="button" class="tab on" role="tab" aria-selected="true" data-tab="groups">Groups</button>
            <button type="button" class="tab" role="tab" aria-selected="false" data-tab="people">People</button>
          </div>
        </div>
        ${list.length ? `<div class="grid3">${list.map(g => `
          <div class="group-card">
            <span class="gc-top"><strong>${esc(g.title)}</strong><span class="meta">${g.memberCount}/${g.capacity} members · ${g.onlineOnly ? 'online' : (g.city ? esc(g.city) : 'in person')}${g.joinMode === 'request' ? ' · asks to join' : ''}</span></span>
            <span class="gc-goal">${esc(g.description || g.goal)}</span>
            <span class="gc-actions"><button type="button" class="btn primary sm" data-join="${esc(g.id)}">${g.joinMode === 'request' ? 'Ask to join' : 'Join'}</button></span>
          </div>`).join('')}</div>`
        : `<div class="empty"><div><h2>Nothing to join yet</h2><p>No public groups match. This list is groups from other members that you are not in; your own groups are in My groups.</p><a class="btn ghost sm" href="#/groups">My groups</a></div></div>`}`;
    } else {
      const list = people.filter(p => !q || [p.name, p.bio, p.goals, p.city, ...(p.interests || []), ...(p.skillLabels || [])].filter(Boolean).join(' ').toLowerCase().includes(ql));
      body.innerHTML = `
        <div class="disc-filters">
          <input id="discQ" type="search" maxlength="60" placeholder="Search people by interest, skill or goal" aria-label="Search people" value="${esc(q)}">
          <div class="chips" role="tablist">
            <button type="button" class="tab" role="tab" aria-selected="false" data-tab="groups">Groups</button>
            <button type="button" class="tab on" role="tab" aria-selected="true" data-tab="people">People</button>
          </div>
        </div>
        ${list.length ? `<ul class="people-list cards">${list.map(p => `
          <li class="person-card">${avatarHtml(p.name, p.avatar)}
            <span class="p-main"><strong>${esc(p.name)}</strong> <span class="meta">${esc(p.city || 'anywhere')}</span>
            ${p.skillLabels && p.skillLabels.length ? `<span class="p-tags">${p.skillLabels.slice(0, 4).map(s => `<span class="skill-chip">${esc(s)}</span>`).join('')}</span>` : ''}
            ${(p.interests || []).length ? `<span class="p-tags">${p.interests.map(s => `<span class="skill-chip alt">${esc(s)}</span>`).join('')}</span>` : ''}
            ${p.goals ? `<span class="p-bio">${esc(p.goals)}</span>` : ''}
            ${p.bio ? `<span class="p-bio">${esc(p.bio)}</span>` : ''}
          </span></li>`).join('')}</ul>`
        : `<div class="empty"><div><h2>No members match</h2><p>Try a different interest, skill or goal.</p></div></div>`}`;
    }
    const dq = $('#discQ');
    if (dq) dq.addEventListener('input', e => { q = e.target.value; const keep = document.activeElement; paint(); const nq = $('#discQ'); if (nq && keep === e.target) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
    $$('[data-tab]', body).forEach(b => b.addEventListener('click', () => { tab = b.dataset.tab; q = ''; paint(); }));
    $$('[data-join]', body).forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        const r = await apiRaw(`/api/rooms/${b.dataset.join}/join`, { method: 'POST', body: '{}' });
        if (r.pending) { b.textContent = 'Request sent'; say('Join request sent. The group owner will approve it.'); return; }
        location.hash = '#/room/' + r.room.id;
      } catch (ex) { say(ex.message); b.disabled = false; b.textContent = 'Join'; }
    }));
  };
  paint();
  try {
    groups = (await apiRaw('/api/groups')).groups || [];
    paint();
    // people search: pull the server-side list (it also filters by query server side when typed)
    people = (await apiRaw('/api/people')).people || [];
    paint();
  } catch (ex) { body.innerHTML = `<p class="msg err" role="alert">${icon.alert}<span>${esc(ex.message)}</span></p>`; }
}

// ---------- GROUPS ----------
async function renderGroups() {
  const main = $('#main');
  main.innerHTML = `<section class="page">${backLink('#/', 'Back to home')}<h1 id="h1" tabindex="-1" class="page-title">My groups</h1><div id="groupList" aria-live="polite"><p class="hint">Loading…</p></div></section>`;
  $('#h1').focus({ preventScroll: true });
  const rooms = await refreshGroupCount();
  const list = $('#groupList'); if (!list) return;
  if (!rooms.length) {
    list.innerHTML = `<div class="empty"><img src="assets/art/puzzle_piece.png" width="110" height="112" alt="" class="empty-art"><div><h2>No groups yet</h2><p>Describe what you want to do, pick the people who fit, and your first group will show up here.</p><a class="btn primary" href="#/finder">Find your people</a></div></div>`;
    return;
  }
  list.innerHTML = `<ul class="group-list">${rooms.map(r => `<li><a class="group-row" href="#/room/${r.id}">${markImg(40)}<span class="g-main"><strong>${esc(r.title)}</strong><span class="g-goal">${esc(r.goal)}</span><span class="meta">${r.memberCount} ${r.memberCount === 1 ? 'member' : 'members'} · ${r.messageCount} ${r.messageCount === 1 ? 'message' : 'messages'}${r.demo ? ' · demo' : ''}</span></span>${icon.arrow}</a></li>`).join('')}</ul>`;
}

// ---------- ACCOUNTS ----------
function openAuth(mode = 'in') {
  const d = $('#authDialog');
  const isUp = mode === 'up';
  d.innerHTML = `<form method="dialog" id="authForm" novalidate class="dlg">
    <div class="dlg-banner">
      <div class="dlg-floats" aria-hidden="true">
        <img src="assets/art/float/heart.png" alt="" loading="lazy" decoding="async">
        <img src="assets/art/float/paper_plane.png" alt="" loading="lazy" decoding="async">
        <img src="assets/art/float/sparkle.png" alt="" loading="lazy" decoding="async">
      </div>
      <div class="dlg-head">${markImg(48)}<div><h2 id="authTitle">${isUp ? 'Create your account' : 'Welcome back'}</h2>
      <p class="hint">${isUp ? 'Email, password, a name, and you are in. About a minute.' : 'Sign in to reach your groups on this device.'}</p></div></div>
    </div>
    ${isUp ? `
    <div class="field"><label for="aEmail">Email</label><input id="aEmail" type="email" maxlength="120" autocomplete="email" required></div>
    <div class="field"><label for="aPass">Password</label><div class="pass-wrap"><input id="aPass" type="password" maxlength="200" autocomplete="new-password" aria-describedby="aPassHint"><button type="button" class="pass-eye" id="aPassEye" aria-label="Show password" aria-controls="aPass">Show</button></div><p class="hint" id="aPassHint">At least 8 characters, with letters and numbers.</p></div>
    <div class="field"><label for="aName">Display name</label><input id="aName" type="text" maxlength="40" autocomplete="nickname"></div>
    <fieldset class="field"><legend>Interests <span class="opt">(up to 3, optional)</span></legend>
      <div class="chips" id="aInterestChips"></div>
      <div class="interest-row" id="aInterestRow"><input id="aInterest" type="text" maxlength="40" autocomplete="off" placeholder="e.g. filmmaking, chess, running"><button type="button" class="btn ghost sm" id="aInterestAdd">Add</button></div>
    </fieldset>` : `
    <div class="field"><label for="aEmail">Email</label><input id="aEmail" type="email" maxlength="120" autocomplete="email" required></div>
    <div class="field"><label for="aPass">Password</label><div class="pass-wrap"><input id="aPass" type="password" maxlength="200" autocomplete="current-password"><button type="button" class="pass-eye" id="aPassEye" aria-label="Show password" aria-controls="aPass">Show</button></div></div>`}
    <p class="msg err" id="aAuthErr" role="alert" hidden></p>
    <div class="dlg-actions ${isUp ? 'with-age' : 'spread'}">
      <button type="button" class="btn ghost" id="aSwap">${isUp ? 'I have an account' : 'New here? Create an account'}</button>
      ${isUp ? '<label class="toggle agree age"><input type="checkbox" id="a18"><span>I am 18 years or older.</span></label>' : ''}
      <button type="submit" class="btn primary" id="aSubmit">${isUp ? 'Create account' : 'Sign in'}</button>
    </div></form>`;
  d.showModal(); wireDialogClose(d);
  $('#aEmail').focus();
  const err = () => $('#aAuthErr');
  const showErr = t => { const e = err(); e.innerHTML = icon.alert + `<span>${esc(t)}</span>`; e.hidden = false; };
  $('#aSwap').addEventListener('click', () => { d.close(); openAuth(isUp ? 'in' : 'up'); });
  // The password starts hidden. This lets a member read back what they typed before submitting,
  // instead of retyping a field they cannot see. The button never submits: the form posts on the
  // submit button only.
  const pass = $('#aPass'), eye = $('#aPassEye');
  eye.addEventListener('click', () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    eye.textContent = show ? 'Hide' : 'Show';
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    pass.focus();
  });
  // interest chips editor. Anything already saved in this browser (a guest profile) comes with the
  // person into the new account, so interests are only ever asked for once.
  const interests = isUp ? [...(myProfile().interests || [])].slice(0, 3) : [];
  const paintInterests = () => {
    $('#aInterestChips').innerHTML = interests.map((x, i) => `<span class="tag strong">${esc(x)}<button type="button" class="tag-x" data-rm="${i}" aria-label="Remove ${esc(x)}">${icon.x}</button></span>`).join('');
    $$('#aInterestChips [data-rm]').forEach(b => b.addEventListener('click', () => { interests.splice(Number(b.dataset.rm), 1); paintInterests(); }));
    // Three is the limit, so once it is reached the input has nothing left to do: hide it rather
    // than leave a field that silently refuses what is typed into it.
    $('#aInterestRow').hidden = interests.length >= 3;
  };
  const addInterest = () => {
    const inp = $('#aInterest'); const v = inp.value.trim();
    if (v && !interests.includes(v) && interests.length < 3) { interests.push(v); paintInterests(); }
    inp.value = '';
    if (interests.length < 3) inp.focus();
  };
  if (isUp) {
    paintInterests();
    $('#aInterestAdd').addEventListener('click', addInterest);
    $('#aInterest').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addInterest(); } });
  }
  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const submit = $('#aSubmit');
    const email = $('#aEmail').value.trim(), pass = $('#aPass').value;
    err().hidden = true;
    if (!email || !pass) { showErr('Enter your email and password.'); return; }
    if (isUp && !$('#aName').value.trim()) { showErr('Add a display name so groups know who you are.'); return; }
    if (isUp && !$('#a18').checked) { showErr('KNOT is for members 18 and over. Confirm your age to continue.'); return; }
    submit.disabled = true; submit.textContent = isUp ? 'Creating…' : 'Signing in…';
    try {
      const body = isUp
        ? { email, password: pass, name: $('#aName').value.trim(), confirm18: true, interests }
        : { email, password: pass };
      const me = await apiRaw('/api/auth/' + (isUp ? 'signup' : 'signin'), { method: 'POST', body: JSON.stringify(body) });
      state.acct = me.signedIn ? me : null;
      d.close(); paintHeader(); route(false);
      say(isUp ? 'Account created. Your groups now follow you across devices.' : 'Signed in.');
      if (isUp) openProfile();
    } catch (ex) {
      submit.disabled = false; submit.textContent = isUp ? 'Try again' : 'Sign in';
      showErr(ex.message);
    }
  });
}
async function signOut() {
  try { await apiRaw('/api/auth/signout', { method: 'POST', body: '{}' }); } catch { /* offline */ }
  state.acct = null; state.rooms = []; paintHeader();
  say('Signed out. Your groups are still here under your account.');
}

// resize + encode a picture entirely in the browser, so uploads stay small
// Shrinks a picture in this browser before it is sent. When a size limit is given the picture is
// re-encoded until it fits, so a photo is never refused after it has already been shown.
function resizeImage(file, max = 512, maxBytes = 0) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const c = document.createElement('canvas');
      const g = c.getContext('2d');
      let limit = max, quality = 0.85;
      const draw = () => {
        const scale = Math.min(1, limit / Math.max(img.width, img.height));
        c.width = Math.max(1, Math.round(img.width * scale));
        c.height = Math.max(1, Math.round(img.height * scale));
        g.drawImage(img, 0, 0, c.width, c.height);
      };
      draw();
      let out = c.toDataURL('image/jpeg', quality);
      // Quality first, then size: a big photo loses a little sharpness instead of the whole picture.
      let guard = 0;
      while (maxBytes && out.length > maxBytes && limit > 200 && guard++ < 12) {
        if (quality > 0.55) quality -= 0.15;
        else { limit = Math.round(limit * 0.8); quality = 0.7; draw(); }
        out = c.toDataURL('image/jpeg', quality);
      }
      resolve(out);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('That file could not be read as a picture.')); };
    img.src = url;
  });
}
// The server keeps message pictures under 300 KB and profile pictures under 400 KB; a data URL
// carries four characters for every three bytes.
const IMG_LIMIT = kb => Math.floor(kb * 1024 * 4 / 3);

function openProfile(opts = {}) {
  const d = $('#profileDialog');
  const p = myProfile();
  const signedIn = !!state.acct;
  d.innerHTML = `<form method="dialog" id="profileForm" novalidate class="dlg">
    <div class="dlg-head">
      <span class="avatar lg" id="dlgAvatar">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(initials(p.name || '?'))}</span>
      <div><h2 id="profileTitle">${signedIn ? 'Your profile' : 'A little about you'}</h2>
      <p class="hint">${signedIn ? 'Everything here is saved to your account and follows you across devices.' : 'Guest profile, kept in this browser. Create an account to keep it anywhere.'}</p></div>
    </div>
    ${signedIn ? `
    <div class="field">
      <label>Profile picture</label>
      <div class="avatar-row">
        <span class="avatar lg" id="editAvatar">${p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : esc(initials(p.name || '?'))}</span>
        <div class="avatar-btns">
          <label class="btn ghost sm" for="pAvatar">Upload picture<input id="pAvatar" type="file" accept="image/png,image/jpeg,image/webp" class="sr"></label>
          <span class="hint" id="pAvatarNote">PNG, JPEG or WebP. Big pictures are shrunk for you.</span>
        </div>
      </div>
    </div>` : ''}
    <div class="field"><label for="pName">Display name <span class="req">(required)</span></label>
      <input id="pName" type="text" maxlength="40" autocomplete="nickname" value="${esc(p.name)}" aria-describedby="pNameErr">
      <p class="msg err" id="pNameErr" role="alert" hidden></p></div>
    <div class="field"><label for="pBio">Short bio <span class="opt">(optional)</span></label>
      <input id="pBio" type="text" maxlength="300" value="${esc(p.bio)}" placeholder="One line about you"></div>
    <fieldset class="field"><legend>Skills or hobbies you can bring <span class="req">(pick at least one)</span></legend>
      <div class="chips" id="pSkills">${state.skills.map(s => `<label class="toggle"><input type="checkbox" value="${s.id}" ${p.skills.includes(s.id) ? 'checked' : ''}><span>${esc(s.label)}</span></label>`).join('')}</div>
      <div class="custom-skill"><label for="pCustom">Something else? Type any skill or hobby</label>
        <input id="pCustom" type="text" maxlength="40" autocomplete="off" value="${esc(p.custom ? p.custom.text : '')}" placeholder="e.g. ukulele, speedrunning, sourdough">
        <p class="hint">${p.custom && p.custom.labels && p.custom.labels.length ? `KNOT treats "${esc(p.custom.text)}" like ${esc(p.custom.labels.join(' and '))}.` : ''}</p></div>
      <p class="msg err" id="pSkillsErr" role="alert" hidden></p></fieldset>
    <fieldset class="field"><legend>Interests <span class="opt">(up to 3)</span></legend>
      <div class="chips" id="pInterestChips"></div>
      <div class="interest-row" id="pInterestRow"><input id="pInterest" type="text" maxlength="40" autocomplete="off" placeholder="e.g. filmmaking, chess, running" value=""><button type="button" class="btn ghost sm" id="pInterestAdd">Add</button></div>
    </fieldset>
    <div class="field"><label for="pGoals">What you want to work on <span class="opt">(optional)</span></label>
      <input id="pGoals" type="text" maxlength="300" value="${esc(p.goals)}" placeholder="e.g. make a short film this spring"></div>
    <details class="optional" ${p.city || (p.availability && p.availability.length) ? 'open' : ''}><summary><span>Location and availability</span><span class="opt-open">Open</span></summary>
      <div class="field"><label for="pState">State</label><select id="pState"><option value="">Any state</option>${Object.keys(STATE_NAMES).map(k => `<option value="${k}" ${stateOf(p.city) === k ? 'selected' : ''}>${esc(STATE_NAMES[k])}</option>`).join('')}</select></div>
      <div class="field"><label for="pCitySearch">City</label>
        <div class="combo" id="pCityCombo">
          <input id="pCitySearch" type="text" maxlength="40" autocomplete="off" value="${esc(p.city || '')}" placeholder="Search a city, or type your own" role="combobox" aria-expanded="false" aria-controls="pCityList" aria-autocomplete="list">
          <button type="button" class="combo-btn" id="pCityToggle" aria-expanded="false" aria-controls="pCityList" aria-label="Show the city list">${icon.chev}</button>
          <ul class="combo-list" id="pCityList" role="listbox" aria-label="Cities" hidden></ul>
        </div>
        <p class="hint" id="pCityHint">Pick a state to narrow the list, or type any city that is not listed.</p></div>
      <fieldset class="field"><legend>Days you are usually free</legend><div class="chips" id="pDays">${DAYS.map(x => `<label class="toggle"><input type="checkbox" value="${x}" ${(p.availability || []).includes(x) ? 'checked' : ''}><span>${cap(x.slice(0, 3))}</span></label>`).join('')}</div></fieldset>
      <fieldset class="field"><legend>Meeting preference</legend><div class="chips">${[['both', 'Either'], ['in-person', 'In person'], ['online', 'Online']].map(([v, l]) => `<label class="toggle"><input type="radio" name="pMode" value="${v}" ${p.mode === v ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div></fieldset>
    </details>
    ${signedIn ? `
    <details class="optional"><summary><span>Account and privacy</span><span class="opt-open">Open</span></summary>
      <p class="hint">Your email is never shown to other members. You can block people from any group member menu, and every profile field here is optional.</p>
      <div class="field"><label for="pEmail">Email (sign-in email, not public)</label><input id="pEmail" type="email" value="${esc(state.acct.email || '')}" disabled></div>
      <button type="button" class="btn ghost sm" id="pDelete">Delete my account</button>
    </details>` : ''}
    <p class="msg err" id="pErr" role="alert" hidden></p>
    <div class="dlg-actions${signedIn ? ' split' : ''}">
      ${signedIn ? '<button type="button" class="btn ghost" id="pSignOut">Sign out</button>' : ''}
      <div class="dlg-end">
        <button type="button" class="btn ghost" id="pCancel">Cancel</button>
        <button type="submit" class="btn primary">${opts.thenSearch ? 'Save and find my people' : 'Save profile'}</button>
      </div>
    </div></form>`;
  d.showModal(); wireDialogClose(d);
  $('#pName').focus();
  $('#pCancel').addEventListener('click', () => d.close());
  const so = $('#pSignOut');
  if (so) so.addEventListener('click', async () => {
    if (!await askConfirm({ title: 'Sign out?', body: 'Your account and groups stay saved. Sign back in any time.', yes: 'Sign out', no: 'Stay signed in' })) return;
    d.close();
    await signOut();
    route(false);
  });
  const showErr = (sel, t) => { const e = $(sel); if (e) { e.innerHTML = icon.alert + `<span>${esc(t)}</span>`; e.hidden = false; } };
  // interests chips
  const interests = [...(p.interests || [])];
  const paintInterests = () => {
    $('#pInterestChips').innerHTML = interests.map((x, i) => `<span class="tag strong">${esc(x)}<button type="button" class="tag-x" data-rm="${i}" aria-label="Remove ${esc(x)}">${icon.x}</button></span>`).join('');
    $$('#pInterestChips [data-rm]').forEach(b => b.addEventListener('click', () => { interests.splice(Number(b.dataset.rm), 1); paintInterests(); }));
    $('#pInterestRow').hidden = interests.length >= 3;
  };
  paintInterests();
  const addInterest = () => {
    const inp = $('#pInterest'); const v = inp.value.trim();
    if (v && !interests.includes(v) && interests.length < 3) { interests.push(v); paintInterests(); }
    inp.value = '';
    if (interests.length < 3) inp.focus();
  };
  $('#pInterestAdd').addEventListener('click', addInterest);
  $('#pInterest').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addInterest(); } });
  // avatar upload
  const avatarInput = $('#pAvatar');
  if (avatarInput) avatarInput.addEventListener('change', async () => {
    const file = avatarInput.files[0];
    const note = $('#pAvatarNote');
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { showErr('#pErr', 'Pick a PNG, JPEG or WebP picture.'); return; }
    note.textContent = 'Checking the picture…';
    try {
      const dataUrl = await resizeImage(file, 512, IMG_LIMIT(400));
      const me = await apiRaw('/api/auth/avatar', { method: 'POST', body: JSON.stringify({ image: dataUrl }) });
      state.acct = me;
      $('#editAvatar').innerHTML = me.profile.avatar ? `<img src="${esc(me.profile.avatar)}" alt="">` : esc(initials(me.name));
      note.textContent = 'Picture saved.';
      paintHeader();
    } catch (ex) {
      note.textContent = 'PNG, JPEG or WebP. Big pictures are shrunk for you.';
      showErr('#pErr', ex.message);
    }
    avatarInput.value = '';
  });
  const del = $('#pDelete');
  if (del) del.addEventListener('click', async () => {
    if (!await askConfirm({ title: 'Delete your account?', body: 'Your email is removed and your name is cleared. This cannot be undone.', yes: 'Delete my account', no: 'Keep my account', danger: true })) return;
    try { await apiRaw('/api/auth/delete-account', { method: 'POST', body: '{}' }); } catch (ex) { showErr('#pErr', ex.message); return; }
    state.acct = null; state.rooms = []; d.close(); paintHeader(); route(false);
    say('Account deleted. You are now browsing as a guest.');
  });
  // State narrows the city list; the city box itself stays free text, so a place that is not on the
  // list can still be typed and saved. The list opens from the chevron beside the box or as you
  // type, so the cities on offer are something a member can see rather than guess at.
  const stateSel = $('#pState'), cityBox = $('#pCitySearch'), cityList = $('#pCityList'), cityHint = $('#pCityHint'), cityToggle = $('#pCityToggle');
  const cityNames = () => placesIn(stateSel ? stateSel.value : '').sort((a, b) => a.localeCompare(b));
  const closeCities = () => {
    if (!cityList) return;
    cityList.hidden = true;
    if (cityToggle) cityToggle.setAttribute('aria-expanded', 'false');
    if (cityBox) cityBox.setAttribute('aria-expanded', 'false');
  };
  const openCities = () => {
    if (!cityList) return;
    const q = (cityBox ? cityBox.value : '').trim().toLowerCase();
    const names = cityNames().filter(c => !q || c.toLowerCase().includes(q));
    cityList.innerHTML = names.length
      ? names.map(c => `<li><button type="button" class="combo-item" role="option" data-city="${esc(c)}">${esc(c)}</button></li>`).join('')
      : '<li class="combo-none">No listed city matches. Type it in and it is saved as typed.</li>';
    cityList.hidden = false;
    if (cityToggle) cityToggle.setAttribute('aria-expanded', 'true');
    if (cityBox) cityBox.setAttribute('aria-expanded', 'true');
  };
  const paintPlaces = () => {
    if (cityHint) cityHint.textContent = stateSel && stateSel.value
      ? `Major cities in ${STATE_NAMES[stateSel.value] || stateSel.value} are suggested. Type any other city to use it instead.`
      : 'Pick a state to narrow the list, or type any city that is not listed.';
    if (cityList && !cityList.hidden) openCities();
  };
  if (cityList) cityList.addEventListener('click', e => {
    const b = e.target.closest('[data-city]');
    if (!b) return;
    if (cityBox) { cityBox.value = b.dataset.city; cityBox.focus(); }
    closeCities();
  });
  if (cityToggle) cityToggle.addEventListener('click', () => {
    if (!cityList) return;
    if (cityList.hidden) { openCities(); if (cityBox) cityBox.focus(); } else closeCities();
  });
  if (cityBox) {
    cityBox.addEventListener('input', () => openCities());
    cityBox.addEventListener('focus', () => openCities());
    cityBox.addEventListener('keydown', e => {
      if (e.key === 'Escape' && cityList && !cityList.hidden) { e.stopPropagation(); closeCities(); }
      if (e.key === 'ArrowDown' && cityList && !cityList.hidden) {
        const first = cityList.querySelector('.combo-item');
        if (first) { e.preventDefault(); first.focus(); }
      }
    });
  }
  if (cityList) {
    cityList.addEventListener('keydown', e => {
      const items = $$('.combo-item', cityList);
      const at = items.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' && at > -1) { e.preventDefault(); (items[at + 1] || items[0]).focus(); }
      if (e.key === 'ArrowUp' && at > -1) { e.preventDefault(); (items[at - 1] || cityBox || items[0]).focus(); }
      if (e.key === 'Escape') { closeCities(); if (cityBox) cityBox.focus(); }
    });
    // A click anywhere else in the dialog folds the list away again.
    d.addEventListener('click', e => { if (!e.target.closest('#pCityCombo')) closeCities(); });
  }
  if (stateSel) stateSel.addEventListener('change', () => { paintPlaces(); if (cityBox) { cityBox.focus(); openCities(); } });
  paintPlaces();
  $('#profileForm').addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#pName').value.trim(), skills = $$('#pSkills input:checked').map(i => i.value), ctext = $('#pCustom').value.trim();
    let bad = false;
    $('#pNameErr').hidden = !!name;
    if (!name) { showErr('#pNameErr', 'Enter a display name so your group knows who you are.'); bad = true; }
    $('#pSkillsErr').hidden = skills.length > 0 || !!ctext;
    if (!skills.length && !ctext) { showErr('#pSkillsErr', 'Pick a skill or hobby above, or type your own below them.'); bad = true; }
    if (bad) return;
    const sb = $('#profileForm button[type=submit]'); sb.disabled = true; sb.textContent = 'Saving…';
    let custom = null;
    try {
      if (ctext) {
        if (p.custom && p.custom.text === ctext) custom = p.custom;
        else {
          try { const r = await api('/api/skills/map', { method: 'POST', body: JSON.stringify({ text: ctext }) }); custom = { text: ctext, ids: r.ids, labels: r.labels, note: r.note || '' }; }
          catch { /* keep going without a mapping */ }
        }
        if (custom) custom.ids.forEach(id => { if (!skills.includes(id)) skills.push(id); });
      }
      if (!skills.length) { sb.disabled = false; sb.textContent = 'Save profile'; showErr('#pSkillsErr', `KNOT could not match "${ctext}" to anything yet. Try another word, or pick a skill above.`); return; }
      const profile = {
        name, skills, interests,
        bio: $('#pBio').value.trim(), goals: $('#pGoals').value.trim(),
        city: ($('#pCitySearch').value || '').trim(), availability: $$('#pDays input:checked').map(i => i.value),
        mode: ($('input[name=pMode]:checked') || { value: 'both' }).value
      };
      if (state.acct) {
        const me = await apiRaw('/api/auth/me', { method: 'PATCH', body: JSON.stringify(profile) });
        state.acct = me;
        if (custom) state.me = Object.assign(state.me || {}, { custom });
        store.set('knot.me', state.me);
      } else {
        state.me = { ...profile, custom, interests };
        store.set('knot.me', state.me);
        apiRaw('/api/profile', { method: 'POST', body: JSON.stringify({ name }) }).then(u => { state.sessionName = u.name; }).catch(() => {});
      }
      d.close(); paintHeader();
      if (opts.thenSearch) findPeople(true);
      else say('Profile saved.');
      if (location.hash === '#/discover') renderDiscover();
    } catch (ex) {
      sb.disabled = false; sb.textContent = 'Save profile';
      showErr('#pErr', ex.message);
    }
  });
}

// ---------- CREATE GROUP ----------
function titleFromGoal(goal) {
  let t = goal.trim().replace(/^i (can|want to|would like to|'d like to|wanna|am going to)\s+/i, '').split(/\s*(?:,|;|\band i\b|\bbut i\b|\band need\b|\bneed\b|\bi need\b)/i)[0].replace(/[.!?]+$/, '').trim() || goal.trim();
  if (t.length > 60) t = t.slice(0, 57).replace(/\s+\S*$/, '') + '…';
  return cap(t);
}
function selectedResults() { return (state.resp ? state.resp.results : []).filter(r => state.selected.has(r.id)); }
function updateCreateBar() {
  const bar = $('#createBar'); if (!bar) return;
  const sel = selectedResults();
  bar.hidden = !sel.length;
  // The help button lives in the same corner: lift it clear while the create bar is along the bottom.
  document.body.classList.toggle('has-create', !bar.hidden);
  if (sel.length) {
    $('#createText').textContent = `${sel.map(s => s.name.split(' ')[0]).join(', ')} selected. Ready to start a group?`;
    $('#createBtn').textContent = sel.length > 1 ? `Create group (${sel.length})` : 'Create group';
  }
}
let createRequestId = null;
function openCreate() {
  const sel = selectedResults(); if (!sel.length) return;
  createRequestId = uid();
  const acct = state.acct;
  const d = $('#createDialog');
  const demoNote = !acct ? `<p class="msg info small">You are not signed in, so this is a demo sandbox group: fictional profiles, kept off Discover, and not shared across devices. Create an account to make a real group that others can find and join.</p>` : '';
  const memberNote = sel.length ? `<p class="msg info small">The people you picked are fictional demo profiles. They chat back in their own words, but they are sample data and not real members.</p>` : '';
  d.innerHTML = `<form id="createForm" method="dialog" novalidate class="dlg">
    <div class="dlg-head">${markImg(48)}<div><h2 id="createTitle">Create your group</h2><p class="hint">Name it, decide who can find it, then start the chat.</p></div></div>
    <div class="goal-quote"><span class="gq-label">Your goal</span><p>"${esc(state.goal.trim())}"</p></div>
    <div class="field"><label for="gName">Group name</label><input id="gName" type="text" maxlength="80" value="${esc(titleFromGoal(state.goal))}" aria-describedby="gNameErr"><p class="msg err" id="gNameErr" role="alert" hidden></p></div>
    <div class="field"><label for="gDesc">Short description <span class="opt">(optional)</span></label><input id="gDesc" type="text" maxlength="300" placeholder="One line people will see in Discover"></div>
    <fieldset class="field"><legend>Who is included</legend>
      <ul class="member-list"><li>${avatarHtml(myProfile().name || 'You', null, 'sm')}<span><strong>${esc(myProfile().name)}</strong> (you)</span></li>
      ${sel.map(s => `<li>${avatarHtml(s.name, null, 'sm')}<span><strong>${esc(s.name)}</strong> <span class="meta">${esc(s.city)}</span></span></li>`).join('')}</ul>
    </fieldset>
    ${memberNote}${demoNote}
    ${acct ? `<details class="optional"><summary><span>Who can find this group</span><span class="opt-open">Open</span></summary>
      <fieldset class="field"><legend>Visibility</legend><div class="chips">
        <label class="toggle"><input type="radio" name="gVis" value="public" checked><span>Public (in Discover)</span></label>
        <label class="toggle"><input type="radio" name="gVis" value="private"><span>Private (invite link only)</span></label></div></fieldset>
      <fieldset class="field"><legend>Joining</legend><div class="chips">
        <label class="toggle"><input type="radio" name="gJoin" value="open" checked><span>Anyone can join</span></label>
        <label class="toggle"><input type="radio" name="gJoin" value="request"><span>You approve each request</span></label></div></fieldset>
      <div class="field"><label for="gCap">Member cap</label><input id="gCap" type="number" min="2" max="50" value="12"></div>
      <div class="field"><label class="toggle"><input type="checkbox" id="gOnline"><span>This group meets online only</span></label></div>
      <p class="hint">This group is for members 18 and over, because that is your account's age group.</p>
    </details>` : ''}
    <p class="msg err" id="gErr" role="alert" hidden></p>
    <div class="dlg-actions"><button type="button" class="btn ghost" id="gCancel">Cancel</button><button type="submit" class="btn primary" id="gSubmit">Create group</button></div>
  </form>`;
  d.showModal(); wireDialogClose(d); $('#gName').focus(); $('#gName').select();
  $('#gCancel').addEventListener('click', () => d.close());
  let busy = false;
  $('#createForm').addEventListener('submit', async e => {
    e.preventDefault(); if (busy) return;
    const title = $('#gName').value.trim();
    if (!title) { const er = $('#gNameErr'); er.innerHTML = icon.alert + '<span>Give the group a name so you can find it later.</span>'; er.hidden = false; $('#gName').focus(); return; }
    busy = true; const btn = $('#gSubmit'); btn.disabled = true; btn.textContent = 'Creating…';
    try {
      const body = { requestId: createRequestId, clientId: state.clientId, ownerName: myProfile().name, ownerSkills: myProfile().skills, title, goal: state.goal.trim(), memberIds: sel.map(s => s.id), description: $('#gDesc') ? $('#gDesc').value.trim() : '' };
      if (acct) {
        body.visibility = ($('input[name=gVis]:checked') || { value: 'public' }).value;
        body.joinMode = ($('input[name=gJoin]:checked') || { value: 'open' }).value;
        body.capacity = $('#gCap').value || 12;
        body.onlineOnly = $('#gOnline').checked;
        body.city = myProfile().city || null;
      }
      const { room, duplicate } = await api('/api/rooms', { method: 'POST', body: JSON.stringify(body) });
      if (!duplicate) state.selected.clear();
      d.close();
      say(duplicate ? 'That group already exists, so KNOT opened it instead.' : 'Group created. Say hi and get it going.');
      location.hash = '#/room/' + room.id;
    } catch (ex) {
      busy = false; const b2 = $('#gSubmit'); if (b2) { b2.disabled = false; b2.textContent = 'Try again'; }
      const er = $('#gErr');
      if (er) { er.innerHTML = icon.alert + `<span>${esc(ex.message)}</span>`; er.hidden = false; }
    }
  });
}

// ---------- ROOM ----------
let roomState = null;
function stopPoll() {
  if (state.pollTimer) { clearInterval(state.pollTimer); state.pollTimer = null; }
  if (state.typingTimer) { clearInterval(state.typingTimer); state.typingTimer = null; }
  roomState = null;
}
function fmtTime(ts) {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
async function renderRoom(id) {
  const main = $('#main');
  main.innerHTML = `<section class="page room" aria-labelledby="rh">${backLink('#/groups', 'Back to My groups')}<div id="roomBody" aria-live="polite"><p class="hint">Opening the group…</p></div></section>`;
  let room = null;
  try { room = (await api(`/api/rooms/${encodeURIComponent(id)}`)).room; }
  catch (ex) {
    $('#roomBody').innerHTML = `<div class="empty"><img src="assets/art/puzzle_piece.png" width="110" height="112" alt="" class="empty-art"><div><h2>Group not found</h2><p>${esc(ex.message)}</p><a class="btn ghost" href="#/groups">Back to My groups</a></div></div>`;
    return;
  }
  roomState = { id, room, lastCount: 0, typing: [] };
  paintRoom(room);
  if (room.isMember) {
    state.pollTimer = setInterval(async () => {
      if (document.hidden || !roomState || roomState.id !== id) return;
      try {
        const { room: fresh } = await api(`/api/rooms/${encodeURIComponent(id)}`);
        if (roomState && roomState.id === id) paintRoom(fresh, true);
      } catch { /* next tick will retry */ }
    }, 3500);
    // Who is typing changes far more often than the message list, so it has its own quiet poll.
    state.typingTimer = setInterval(pollTyping, 1500);
    pollTyping();
  }
}

// The typing note is presence, not history: it is asked for separately and drawn separately, so a
// repaint of the chat never swallows it and it never touches the messages.
async function pollTyping() {
  if (!roomState || document.hidden) return;
  const id = roomState.id;
  try {
    const out = await api(`/api/rooms/${encodeURIComponent(id)}/typing`);
    if (!roomState || roomState.id !== id) return;
    roomState.typing = Array.isArray(out.typing) ? out.typing : [];
    paintTyping();
  } catch { /* presence is a courtesy; the room works without it */ }
}

// "Sam is typing", one row per person, stacked under the newest message and left aligned like the
// messages above them, so two people typing read as two people and not as one long line. KNOT AI
// and the demo profiles are named too, so the dots always say who they belong to.
function paintTyping() {
  const box = $('#typingLine');
  if (!box) return;
  const list = (roomState && roomState.typing) || [];
  const seen = new Set();
  const rows = [];
  for (const t of list) {
    const name = t && t.ai ? 'KNOT AI' : String((t && t.name) || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    rows.push(`<p class="typing-row"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span><span class="typing-who">${esc(name)} is typing</span></p>`);
  }
  // The rows live at the end of the chat, so they only pull the view down when the person was
  // already at the newest message: scrolling up to read never gets yanked away.
  const log = box.parentElement;
  const atBottom = !log || (log.scrollHeight - log.scrollTop - log.clientHeight) < 60;
  const html = rows.join('');
  if (box.innerHTML !== html) box.innerHTML = html;
  box.hidden = !rows.length;
  if (rows.length && atBottom && log) log.scrollTop = log.scrollHeight;
}

// The commands the "/" palette offers in a group chat. They are handled in this file and never
// posted as text: picking one fills the message box, and sending turns it into a plain message
// plus an askAi flag.
// Every command has a job, whether it is picked from the palette or typed by hand: /ai takes a
// question, /plan and /catchup carry their own prompt, and /help shows the list again. The text a
// member sends stays visible in the chat with its command, so the room can see what was asked.
const AI_COMMANDS = [
  { key: 'ai', label: 'Ask KNOT AI', hint: 'Ask a question about this group', fill: '/ai ' },
  { key: 'plan', label: 'Plan the next steps', hint: 'KNOT AI suggests what the group should do next', fill: '/plan', prompt: 'Plan the next steps for this group.' },
  { key: 'catchup', label: 'Catch me up', hint: 'KNOT AI sums up what the group has decided', fill: '/catchup', prompt: 'Catch me up on what this group has decided so far.' },
  { key: 'help', label: 'What can KNOT AI do?', hint: 'Show these commands again', fill: null }
];

// Every member is drawn as the same card, in list order, so the list reads as one group: the
// people are numbered Member #1, Member #2, and the helper is labeled by name because it is not a
// person and never takes a seat.
function memberCard(m, room, seat) {
  const me = myProfile();
  const isMod = room.myRole === 'owner' || room.myRole === 'moderator';
  // KNOT AI is listed with the members, but it is a helper and not a person: nothing to moderate,
  // nothing to block, and it never counts towards the member cap.
  if (m.ai) {
    // KNOT AI is a helper, not a member: nobody can remove, ban or promote it. The owner's control
    // over it is the AI setting, which mutes it for the whole group on the server. The button is a
    // shortcut to that same setting, and the helper stays listed either way.
    const mute = room.myRole === 'owner'
      ? `<button type="button" class="btn ghost sm ai-mute" data-ai-toggle="${room.aiMode === 'off' ? 'on-demand' : 'off'}">${room.aiMode === 'off' ? 'Unmute' : 'Mute'}</button>`
      : '';
    return `<li class="member ai-member">${markImg(30)}
      <span class="m-main"><strong>KNOT AI</strong> <span class="role-chip ai">AI</span>
      <span class="m-detail"><span class="meta">${esc(m.modeText || 'Helper')}</span></span></span>${mute}</li>`;
  }
  const canAct = !m.you && (m.demo || m.id);
  const actions = [];
  if (seat) actions.push(`<span class="role-chip num">Member #${seat}</span>`);
  if (m.you) actions.push('<span class="role-chip">You</span>');
  if (m.role === 'owner') actions.push('<span class="role-chip owner">Owner</span>');
  else if (m.role === 'moderator') actions.push('<span class="role-chip">Mod</span>');
  if (m.demo) actions.push('<span class="role-chip demo">Demo</span>');
  const detail = [
    m.skillLabels && m.skillLabels.length ? `<span class="p-tags">${m.skillLabels.slice(0, 5).map(s => `<span class="skill-chip">${esc(s)}</span>`).join('')}</span>` : '',
    m.city ? `<span class="meta">${esc(m.city)} · ${esc(m.modeText || '')}</span>` : '',
    m.availabilityText && !m.you ? `<span class="meta">Free: ${esc(m.availabilityText)}</span>` : ''
  ].filter(Boolean).join('');
  let menu = '';
  if (canAct && !m.demo) {
    menu = `<button type="button" class="member-menu-btn" data-menu="${esc(m.id)}" aria-haspopup="true" aria-expanded="false" aria-label="Options for ${esc(m.name)}">⋯</button>
      <div class="member-menu" data-menu-for="${esc(m.id)}" hidden>
        ${room.myRole === 'owner' ? `<button type="button" data-role="${esc(m.id)}" data-roletarget="${m.role === 'moderator' ? 'member' : 'moderator'}">${m.role === 'moderator' ? 'Set as member' : 'Make moderator'}</button>` : ''}
        ${room.myRole === 'owner' ? `<button type="button" data-owner="${esc(m.id)}">Make owner</button>` : ''}
        ${isMod && m.role !== 'owner' ? `<button type="button" data-kick="${esc(m.id)}">Remove (they can rejoin)</button>` : ''}
        ${room.myRole === 'owner' && m.role !== 'owner' ? `<button type="button" data-ban="${esc(m.id)}">Ban (they cannot rejoin)</button>` : ''}
        <button type="button" data-block="${esc(m.id)}">Block</button>
        <button type="button" data-report="${esc(m.id)}">Report</button>
      </div>`;
  } else if (canAct && m.demo) {
    menu = `<button type="button" class="member-menu-btn" data-menu="${esc(m.id)}" aria-haspopup="true" aria-expanded="false" aria-label="Options for ${esc(m.name)}">⋯</button>
      <div class="member-menu" data-menu-for="${esc(m.id)}" hidden><span class="menu-note">Demo profiles are fictional, so no actions apply.</span></div>`;
  }
  return `<li class="member ${m.you ? 'you' : ''}">${avatarHtml(m.name, m.avatar, 'sm')}
    <span class="m-main"><strong>${esc(m.name)}</strong> ${actions.join(' ')}${detail ? `<span class="m-detail">${detail}</span>` : ''}</span>${menu}</li>`;
}

function paintRoom(room, isPoll) {
  if (!roomState || roomState.id !== room.id) return;
  const body = $('#roomBody'); if (!body) return;
  const msgs = room.messages || [];
  const prevCount = roomState.lastCount;
  const prevMembers = roomState.memberCount;
  const prevReqs = roomState.reqCount;
  // Nothing changed since the last paint: leave the DOM alone so typing is never interrupted.
  if (isPoll && prevCount === msgs.length
    && prevMembers === ((room.members || []).length)
    && prevReqs === ((room.joinRequests || []).length)) return;
  roomState.room = room;
  roomState.lastCount = msgs.length;
  // Which messages are already on screen, so a reply that arrives in a send response is never drawn
  // twice when the poll has already painted it.
  roomState.ids = new Set(msgs.map(m => m.id).filter(Boolean));
  roomState.memberCount = (room.members || []).length;
  roomState.reqCount = (room.joinRequests || []).length;
  // Keep an in-progress draft and the caret when a poll repaints the room.
  const draftInput = $('#msgInput');
  const wasTyping = draftInput && document.activeElement === draftInput;
  const draft = draftInput ? draftInput.value : '';
  const isMod = room.myRole === 'owner' || room.myRole === 'moderator';
  const aiOn = room.aiMode !== 'off';
  body.innerHTML = `
  <div class="room-head">
    <div class="room-title">
      <a class="back" href="#/groups" aria-label="Back to My groups">←</a>
      <div><h1 id="rh">${esc(room.title)}</h1>
      <p class="goal-line">Goal: ${esc(room.goal)}</p>
      <p class="meta">${room.capacityUsed}/${room.capacity} members · ${room.visibility === 'public' ? 'Public' : 'Private'} · ${room.joinMode === 'request' ? 'owner approves joins' : 'anyone can join'}${room.onlineOnly ? ' · online only' : (room.city ? ' · ' + esc(room.city) : '')}${room.demo ? ' · demo sandbox' : ''}${aiOn ? ' · KNOT AI on' : ''}</p></div>
    </div>
    <div class="room-actions">
      ${room.isMember && room.inviteCode ? `<button type="button" class="btn ghost sm" id="inviteBtn" aria-label="Copy invite link">Invite</button>` : ''}
      ${isMod ? `<button type="button" class="btn ghost sm" id="settingsBtn">Group settings</button>` : ''}
      ${room.isMember && room.myRole !== 'owner' ? `<button type="button" class="btn ghost sm" id="leaveBtn">Leave</button>` : ''}
    </div>
  </div>
  ${room.description ? `<p class="room-desc">${esc(room.description)}</p>` : ''}
  ${room.demo ? `<p class="msg info small">This is a demo sandbox group: the members are fictional profiles, and every reply from them is marked Demo. ${state.acct ? 'Create a group while signed in to make a real one others can find.' : 'Create an account to make real groups.'}</p>` : ''}
  ${aiOn && room.isMember ? `<p class="msg info small">KNOT AI is switched on in this group. Messages here may be shared with the AI provider to help the group. ${room.aiMode === 'on' ? 'It replies automatically.' : 'Use the Ask button for a response.'}</p>` : ''}
  ${!room.isMember && room.visibility === 'public' ? `<div class="msg info">You are previewing this public group. Join to read and write in the chat.<button type="button" class="btn primary sm" id="joinHereBtn">${room.joinMode === 'request' ? 'Ask to join' : 'Join group'}</button></div>` : ''}
  ${isMod && room.joinRequests && room.joinRequests.length ? `<div class="join-requests"><h3>Join requests</h3><ul>${room.joinRequests.map(r => `<li><span><strong>${esc(r.name)}</strong> <span class="meta">${r.ageCategory === 'teen' ? 'age 13 to 17' : '18+'}</span></span><span class="jr-actions"><button type="button" class="btn primary sm" data-approve="${esc(r.pid)}">Approve</button><button type="button" class="btn ghost sm" data-decline="${esc(r.pid)}">Decline</button></span></li>`).join('')}</ul></div>` : ''}
  <div class="room-cols">
    <div class="chat-col">
      <div class="chat msgs" id="msgLog" role="log" aria-live="polite" aria-label="Group chat">
        ${msgs.length ? msgs.map(msgBubble).join('') : `<div class="bubble bot">The group is tied. Say hi and get things moving.</div>`}
        ${room.isMember ? `<div class="typing-stack" id="typingLine" role="status" aria-live="polite" hidden></div>` : ''}
      </div>
      ${room.isMember ? `
      <form id="msgForm" class="chat-form" novalidate>
        <label class="sr" for="msgInput">Message</label>
        <div class="chat-input-wrap">
          <div class="cmd-pop" id="cmdPop" role="listbox" aria-label="KNOT AI commands" hidden></div>
          <div class="attach-preview" id="attachPreview" hidden>
            <img id="attachThumb" alt="The picture you are about to send">
            <span class="attach-note">Ready to send.</span>
            <button type="button" class="attach-x" id="attachClear" aria-label="Remove the picture">${icon.x}</button>
          </div>
          <input id="msgInput" type="text" maxlength="2000" autocomplete="off" placeholder="${aiOn ? 'Message the group, or type / to ask KNOT AI' : 'Message the group'}" aria-describedby="chatHint">
        </div>
        <label class="btn ghost photo-btn" for="msgPhoto" title="Send a picture">
          <span class="sr">Send a picture</span>
          <svg class="ic" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="4" width="15" height="12" rx="2.5"/><circle cx="7.4" cy="8.4" r="1.4"/><path d="M3 14l4.3-4.2 3 2.8 2.7-2.5L17 14"/></svg>
          <input id="msgPhoto" type="file" accept="image/png,image/jpeg,image/webp" class="sr">
        </label>
        <button class="btn primary" type="submit">Send ${icon.send}</button>
      </form>
      <p class="hint chat-hint" id="chatHint">${aiOn ? 'Type <b>/</b> to ask KNOT AI in this group. Paste a picture to share it.' : 'KNOT AI is off here, so it will not answer. Paste a picture to share it.'}</p>
      <p class="msg err" id="msgErr" role="alert" hidden></p>` : ''}
    </div>
    <aside class="members-col" aria-labelledby="mh">
      <h2 id="mh" class="small-title">Members</h2>
      <ul class="member-list">${(() => { let seat = 0; return room.members.map(m => memberCard(m, room, m.ai ? 0 : ++seat)).join(''); })()}</ul>
      ${room.inviteCode ? `<div class="invite-box"><h3 class="small-title">Invite link</h3><p class="hint">Share this so people can join directly.</p><div class="invite-row"><input id="inviteLink" readonly value="${esc(location.origin + '/#/join/' + room.inviteCode)}"><button type="button" class="btn ghost sm" id="copyInvite">Copy</button></div></div>` : ''}
      ${isMod && room.bans && room.bans.length ? `<div class="invite-box"><h3 class="small-title">Removed people</h3><ul class="ban-list">${room.bans.map(b => `<li><span>${esc(b.name || 'Someone')}</span><button type="button" class="btn ghost sm" data-unban="${esc(b.pid)}">Let back in</button></li>`).join('')}</ul></div>` : ''}
    </aside>
  </div>`;
  const log = $('#msgLog');
  if (log) log.scrollTop = log.scrollHeight;
  const inp = $('#msgInput');
  if (inp) {
    if (draft) inp.value = draft;
    if (wasTyping) { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch { /* older browsers */ } }
  }
  // Whoever was typing is still typing: the line belongs to the room, not to a repaint.
  paintTyping();
  // This browser's own note: "I am typing" while the box has text, refreshed as the member keeps
  // typing, dropped when they stop, send or leave. The server decides who is told.
  let typingSent = 0, typingIdle = null;
  const tellTyping = on => { apiRaw(`/api/rooms/${encodeURIComponent(room.id)}/typing`, { method: 'POST', body: JSON.stringify({ typing: on }) }).catch(() => {}); };
  const noteTyping = () => {
    const box = $('#msgInput');
    const has = !!(box && box.value.trim());
    if (typingIdle) { clearTimeout(typingIdle); typingIdle = null; }
    if (!has) { if (typingSent) { typingSent = 0; tellTyping(false); } return; }
    const now = Date.now();
    if (now - typingSent > 2500) { typingSent = now; tellTyping(true); }
    typingIdle = setTimeout(() => { typingSent = 0; tellTyping(false); }, 3500);
  };
  if (inp) inp.addEventListener('input', noteTyping);
  const stopTyping = () => { if (typingIdle) { clearTimeout(typingIdle); typingIdle = null; } if (typingSent) { typingSent = 0; tellTyping(false); } };
  // wiring
  // ---- pictures ----
  // A photo can be pasted or picked. It is shrunk in this browser before it is posted, so what
  // leaves here is a small JPEG, and the server checks the type, the size and moderation.
  let pendingImage = null;
  const preview = $('#attachPreview'), thumb = $('#attachThumb'), photoInput = $('#msgPhoto');
  const setImage = (dataUrl) => {
    pendingImage = dataUrl;
    if (thumb) thumb.src = dataUrl;
    if (preview) preview.hidden = !dataUrl;
  };
  const clearImage = () => {
    pendingImage = null;
    if (thumb) thumb.removeAttribute('src');
    if (preview) preview.hidden = true;
    if (photoInput) photoInput.value = '';
  };
  const takeFile = async (file) => {
    const errBox = $('#msgErr');
    if (!file) return;
    try { setImage(await resizeImage(file, 1024, IMG_LIMIT(300))); }
    catch (ex) { if (errBox) { errBox.innerHTML = icon.alert + `<span>${esc(ex.message)}</span>`; errBox.hidden = false; } }
  };
  const clearBtn = $('#attachClear');
  if (clearBtn) clearBtn.addEventListener('click', () => { clearImage(); const i = $('#msgInput'); if (i) i.focus(); });
  if (photoInput) photoInput.addEventListener('change', () => takeFile(photoInput.files && photoInput.files[0]));
  const msgFormEl = $('#msgForm');
  if (msgFormEl) msgFormEl.addEventListener('paste', (e) => {
    const items = [...((e.clipboardData && e.clipboardData.items) || [])];
    const item = items.find(i => i.kind === 'file' && i.type.startsWith('image/'));
    if (!item) return;
    e.preventDefault();
    takeFile(item.getAsFile());
  });
  const sendMsg = async (text, opts = {}) => {
    const errBox = $('#msgErr');
    if (errBox) errBox.hidden = true;
    text = text.trim();
    const image = opts.image || pendingImage;
    if (!text && !image) return;
    stopTyping();
    const input = $('#msgInput'); if (input) { input.value = ''; input.focus(); }
    if (image) clearImage();
    // optimistic append, replaced on next poll
    const log2 = $('#msgLog');
    let optimistic = null;
    if (log2) {
      log2.insertAdjacentHTML('beforeend', msgBubble({ id: 'tmp', authorId: myPid(), authorName: myProfile().name, text, image, kind: 'user', ts: new Date().toISOString() }));
      optimistic = log2.lastElementChild;
      log2.scrollTop = log2.scrollHeight;
    }
    const body = { text, clientMsgId: uid(), authorId: myPid(), authorName: myProfile().name };
    if (image) body.image = image;
    // Asking KNOT AI is a plain message plus this flag. The message keeps its "/ai" so the room can
    // see what was asked, and the question itself travels beside it for the helper to answer.
    if (opts.askAi) body.askAi = true;
    if (opts.askAi && opts.aiQuestion) body.aiQuestion = opts.aiQuestion;
    try {
      const out = await api(`/api/rooms/${encodeURIComponent(room.id)}/messages`, { method: 'POST', body: JSON.stringify(body) });
      // Demo profiles and KNOT AI answer in the same request, so their lines land without a poll.
      // A line the poll already drew is skipped, so the exchange is never shown twice.
      const fresh = (out && Array.isArray(out.replies) ? out.replies : []).filter(m => m && !(roomState && roomState.ids && roomState.ids.has(m.id)));
      if (log2 && fresh.length) {
        log2.insertAdjacentHTML('beforeend', fresh.map(msgBubble).join(''));
        log2.scrollTop = log2.scrollHeight;
        if (roomState && roomState.ids) fresh.forEach(m => roomState.ids.add(m.id));
      }
    } catch (ex) {
      // Nothing was posted, so nothing is lost: the line the member was writing comes back, the
      // picture goes back into the preview, and the bubble that never happened is taken away.
      if (optimistic && optimistic.isConnected) optimistic.remove();
      const box = $('#msgInput');
      if (text && box && !box.value) box.value = text;
      if (image && !pendingImage) setImage(image);
      if (errBox) { errBox.innerHTML = icon.alert + `<span>${esc(ex.message)}</span>`; errBox.hidden = false; }
    }
  };
  // ---- KNOT AI commands ----
  // The slash commands live only in this browser. A command is turned into a plain message plus an
  // askAi flag before it is posted, so the server never parses a "/" and nothing typed here can be
  // read as an instruction by anything else.
  const cmdPop = $('#cmdPop');
  const cmdInput = $('#msgInput');
  let cmdFilter = '';
  let cmdIndex = 0;
  let cmdItems = AI_COMMANDS;
  const paintCommands = () => {
    if (!cmdPop) return;
    const q = cmdFilter.toLowerCase();
    cmdItems = AI_COMMANDS.filter(c => !q || c.key.startsWith(q) || c.label.toLowerCase().includes(q));
    if (!cmdItems.length) { cmdPop.hidden = true; return; }
    cmdIndex = Math.max(0, Math.min(cmdIndex, cmdItems.length - 1));
    cmdPop.innerHTML = cmdItems.map((c, i) => `<button type="button" class="cmd-row${i === cmdIndex ? ' on' : ''}" role="option" aria-selected="${i === cmdIndex}" data-cmd="${i}">
        <span class="cmd-key">/${esc(c.key)}</span>
        <span class="cmd-txt"><strong>${esc(c.label)}</strong><span class="cmd-hint">${esc(c.hint)}</span></span></button>`).join('')
      + '<p class="cmd-foot">These commands stay on this device. Nothing is sent until you press Send.</p>';
    cmdPop.hidden = false;
    $$('[data-cmd]', cmdPop).forEach(b => b.addEventListener('mousedown', ev => { ev.preventDefault(); pickCommand(cmdItems[Number(b.dataset.cmd)]); }));
  };
  const openCommands = (filter) => { cmdFilter = filter; cmdIndex = 0; paintCommands(); };
  const closeCommands = () => { if (cmdPop) cmdPop.hidden = true; };
  const pickCommand = (c) => {
    if (!c) return;
    closeCommands();
    if (!c.fill) { if (cmdInput) { cmdInput.value = ''; cmdInput.focus(); } openCommands(''); return; }
    if (cmdInput) {
      cmdInput.value = c.fill;
      cmdInput.focus();
      try { cmdInput.setSelectionRange(cmdInput.value.length, cmdInput.value.length); } catch { /* older browsers */ }
    }
  };
  // A typed command, or null when this is an ordinary message. Every command answers when it is
  // typed on its own: /plan and /catchup carry their own prompt, and only /ai needs a question.
  const parseCommand = (raw) => {
    if (!raw.startsWith('/')) return null;
    const body = raw.slice(1).trim();
    if (!body) return { help: true };
    const sp = body.search(/\s/);
    const key = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
    const rest = sp === -1 ? '' : body.slice(sp).trim();
    const c = AI_COMMANDS.find(x => x.key === key);
    if (!c) return { unknown: key };
    if (key === 'help') return { help: true };
    return { key, question: rest || c.prompt || '' };
  };
  const runCommand = (cmd) => {
    const errBox = $('#msgErr');
    const err = (t) => { if (errBox) { errBox.innerHTML = icon.alert + `<span>${esc(t)}</span>`; errBox.hidden = false; } };
    if (errBox) errBox.hidden = true;
    if (cmd.help) { if (cmdInput) { cmdInput.value = ''; cmdInput.focus(); } openCommands(''); return; }
    if (cmd.unknown) { err(`There is no /${cmd.unknown} command. Type / to see what KNOT AI can do.`); return; }
    if (room.aiMode === 'off') { err('KNOT AI is off in this group. The owner can turn it on in group settings.'); return; }
    if (!cmd.question) { err('Add your question after /ai, for example /ai what should we do first?'); return; }
    // The command stays in the message the room sees; only the question goes to the helper.
    sendMsg('/' + cmd.key + ' ' + cmd.question, { askAi: true, aiQuestion: cmd.question });
  };
  if (cmdInput && cmdPop) {
    cmdInput.addEventListener('input', () => {
      const v = cmdInput.value;
      // The palette is for commands only: it opens on a lone "/" and filters while the first word
      // is still being typed. Once there is a space it is an ordinary message again.
      if (!v.startsWith('/') || /\s/.test(v)) { closeCommands(); return; }
      openCommands(v.slice(1));
    });
    cmdInput.addEventListener('keydown', (e) => {
      if (cmdPop.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdIndex = (cmdIndex + 1) % cmdItems.length; paintCommands(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); cmdIndex = (cmdIndex - 1 + cmdItems.length) % cmdItems.length; paintCommands(); }
      else if (e.key === 'Enter') { e.preventDefault(); pickCommand(cmdItems[cmdIndex]); }
      else if (e.key === 'Escape') { e.preventDefault(); closeCommands(); }
    });
    cmdInput.addEventListener('blur', () => setTimeout(closeCommands, 120));
  }
  const form = $('#msgForm');
  if (form) form.addEventListener('submit', e => {
    e.preventDefault();
    const raw = ($('#msgInput').value || '').trim();
    if (!raw && !pendingImage) return;
    const cmd = raw ? parseCommand(raw) : null;
    if (cmd) runCommand(cmd); else sendMsg(raw);
  });
  const joinHere = $('#joinHereBtn');
  if (joinHere) joinHere.addEventListener('click', async () => {
    joinHere.disabled = true;
    try {
      const r = await apiRaw(`/api/rooms/${encodeURIComponent(room.id)}/join`, { method: 'POST', body: '{}' });
      if (r.pending) { say('Request sent. The owner will approve it.'); joinHere.textContent = 'Request sent'; return; }
      renderRoom(room.id);
    } catch (ex) { say(ex.message); joinHere.disabled = false; }
  });
  const inv = $('#inviteBtn');
  if (inv) inv.addEventListener('click', () => { const i = $('#inviteLink'); if (i) { copyText(i.value); say('Invite link copied.'); } });
  const cp = $('#copyInvite');
  if (cp) cp.addEventListener('click', () => { copyText($('#inviteLink').value); say('Invite link copied.'); });
  const sb = $('#settingsBtn');
  if (sb) sb.addEventListener('click', () => openSettings(room));
  const lb = $('#leaveBtn');
  if (lb) lb.addEventListener('click', async () => {
    if (!await askConfirm({ title: 'Leave this group?', body: 'You will need a new invite to come back.', yes: 'Leave group', no: 'Stay in the group', danger: true })) return;
    try { await apiRaw(`/api/rooms/${encodeURIComponent(room.id)}/leave`, { method: 'POST', body: '{}' }); location.hash = '#/groups'; }
    catch (ex) { say(ex.message); }
  });
  // member menus
  $$('[data-menu]', body).forEach(btn => btn.addEventListener('click', e => {
    e.stopPropagation();
    const menu = $(`[data-menu-for="${CSS.escape(btn.dataset.menu)}"]`, body);
    if (!menu) return;
    const open = menu.hidden;
    $$('.member-menu', body).forEach(x => { x.hidden = true; });
    $$('.member-menu-btn', body).forEach(x => x.setAttribute('aria-expanded', 'false'));
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }));
  document.addEventListener('click', () => { $$('.member-menu', body).forEach(x => { x.hidden = true; }); }, { once: true, capture: true });
  const modAct = async (path, payload, okMsg) => {
    try { await apiRaw(`/api/rooms/${encodeURIComponent(room.id)}/${path}`, { method: 'POST', body: JSON.stringify(payload) }); say(okMsg); renderRoom(room.id); }
    catch (ex) { say(ex.message); }
  };
  $$('[data-kick]', body).forEach(b => b.addEventListener('click', async () => {
    if (!await askConfirm({ title: 'Remove this person?', body: 'They can join again with the invite link.', yes: 'Remove', no: 'Keep them in the group' })) return;
    modAct('kick', { pid: b.dataset.kick }, 'Removed. They can join again with the invite link.');
  }));
  $$('[data-ban]', body).forEach(b => b.addEventListener('click', async () => {
    if (!await askConfirm({ title: 'Ban this person?', body: 'They will not be able to rejoin this group. You can undo it from the Removed people list.', yes: 'Ban', no: 'Cancel', danger: true })) return;
    modAct('ban', { pid: b.dataset.ban, reason: 'Removed by a moderator' }, 'Banned. They cannot rejoin unless you let them back in.');
  }));
  $$('[data-unban]', body).forEach(b => b.addEventListener('click', () => modAct('unban', { pid: b.dataset.unban }, 'They can join again.')));
  // Muting KNOT AI is a group setting, saved on the server, not a member action: the helper is
  // still listed and still answers nothing until it is turned back on.
  $$('[data-ai-toggle]', body).forEach(b => b.addEventListener('click', async () => {
    const next = b.dataset.aiToggle;
    try {
      await apiRaw(`/api/rooms/${encodeURIComponent(room.id)}`, { method: 'PATCH', body: JSON.stringify({ aiMode: next }) });
      say(next === 'off' ? 'KNOT AI is muted in this group.' : 'KNOT AI can answer again when a member asks.');
      renderRoom(room.id);
    } catch (ex) { say(ex.message); }
  }));
  $$('[data-role]', body).forEach(b => b.addEventListener('click', () => modAct('promote', { pid: b.dataset.role, role: b.dataset.roletarget || 'member' }, 'Role updated.')));
  $$('[data-owner]', body).forEach(b => b.addEventListener('click', async () => {
    if (!await askConfirm({ title: 'Make this member the owner?', body: 'You become a regular member and lose the owner controls.', yes: 'Transfer ownership', no: 'Cancel' })) return;
    modAct('transfer', { pid: b.dataset.owner }, 'Ownership transferred.');
  }));
  $$('[data-block]', body).forEach(b => b.addEventListener('click', async () => {
    try { const r = await apiRaw('/api/blocks', { method: 'POST', body: JSON.stringify({ pid: b.dataset.block }) }); say(r.note || 'Blocked.'); }
    catch (ex) { say(ex.message); }
  }));
  $$('[data-report]', body).forEach(b => b.addEventListener('click', () => openReport(room, { pid: b.dataset.report, name: (room.members.find(m => m.id === b.dataset.report) || {}).name })));
  $$('[data-approve]', body).forEach(b => b.addEventListener('click', () => modAct('requests', { pid: b.dataset.approve, approve: true }, 'Approved.')));
  $$('[data-decline]', body).forEach(b => b.addEventListener('click', () => modAct('requests', { pid: b.dataset.decline, approve: false }, 'Declined.')));
}
function msgBubble(x) {
  const mine = x.you !== undefined ? x.you : !!(x.authorId && x.authorId === myPid());
  // A picture is part of the message: it sits in the bubble, opens full size when clicked.
  const pic = x.image ? `<button type="button" class="bubble-pic" data-pic="${esc(x.image)}" aria-label="Open the picture from ${esc(x.authorName || 'this member')}"><img class="bubble-img" src="${esc(x.image)}" alt="Picture from ${esc(x.authorName || 'a member')}" loading="lazy" decoding="async"></button>` : '';
  if (x.kind === 'assistant') return `<div class="bubble bot ai">${markImg(26)}<div><span class="who">KNOT AI</span>${pic}${x.text ? `<span class="bubble-text">${esc(x.text)}</span>` : ''}<span class="when">${esc(fmtTime(x.ts))}</span></div></div>`;
  // A fictional demo profile: never dressed up as a real member, always tagged.
  if (x.kind === 'demo') return `<div class="bubble them demo"><span class="who">${esc(x.authorName)}<span class="demo-tag">Demo</span></span>${pic}${x.text ? `<span class="bubble-text">${esc(x.text)}</span>` : ''}<span class="when">${esc(fmtTime(x.ts))}</span></div>`;
  return `<div class="bubble ${mine ? 'me' : 'them'}"><span class="who">${esc(x.authorName)}</span>${pic}${x.text ? `<span class="bubble-text">${esc(x.text)}</span>` : ''}<span class="when">${esc(fmtTime(x.ts))}</span></div>`;
}

// The picture viewer: one dialog for every photo in every room, closed with its X, Escape or a
// click on the dark space around it.
function openImage(src, alt) {
  const d = $('#imgDialog');
  if (!d) return;
  d.innerHTML = `<div class="dlg img-dlg"><img src="${esc(src)}" alt="${esc(alt || 'Picture')}"><p class="hint">Click outside the picture, press Escape, or use the X to close.</p></div>`;
  d.showModal();
  wireDialogClose(d);
}
document.addEventListener('click', (e) => {
  const pic = e.target.closest && e.target.closest('[data-pic]');
  if (pic) openImage(pic.dataset.pic, (pic.querySelector('img') || {}).alt);
});
function copyText(t) {
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).catch(() => {});
  else { const i = document.createElement('input'); i.value = t; document.body.appendChild(i); i.select(); try { document.execCommand('copy'); } catch { /* older browsers */ } i.remove(); }
}

// settings dialog: owner/mod edits group fields; AI is off or on-demand only
function openSettings(room) {
  const d = $('#settingsDialog');
  const isOwner = room.myRole === 'owner';
  d.innerHTML = `<form method="dialog" id="setForm" novalidate class="dlg">
    <div class="dlg-head">${markImg(48)}<div><h2 id="settingsTitle">Group settings</h2><p class="hint">${isOwner ? 'You own this group.' : 'You can moderate this group.'}</p></div></div>
    <div class="field"><label for="sTitle">Group name</label><input id="sTitle" type="text" maxlength="80" value="${esc(room.title)}"></div>
    <div class="field"><label for="sDesc">Short description</label><input id="sDesc" type="text" maxlength="300" value="${esc(room.description || '')}" placeholder="One line people see in Discover"></div>
    <fieldset class="field"><legend>KNOT AI in this chat</legend>
      <div class="chips">
        <label class="toggle"><input type="radio" name="sAi" value="off" ${room.aiMode === 'off' ? 'checked' : ''}><span>Off</span></label>
        <label class="toggle"><input type="radio" name="sAi" value="on-demand" ${room.aiMode === 'on-demand' || !room.aiMode ? 'checked' : ''}><span>Only when asked</span></label>
        <label class="toggle"><input type="radio" name="sAi" value="on" ${room.aiMode === 'on' ? 'checked' : ''}><span>Replies to everyone</span></label>
      </div>
      <p class="hint"><strong>Only when asked</strong> keeps the room quiet: KNOT AI answers a member who types /ai, and never speaks otherwise. <strong>Replies to everyone</strong> answers after every message. Members always see which one is on. Default is Off.</p>
    </fieldset>
    ${isOwner ? `
    <details class="optional"><summary><span>Visibility and joining</span><span class="opt-open">Open</span></summary>
      <fieldset class="field"><legend>Visibility</legend><div class="chips">
        <label class="toggle"><input type="radio" name="sVis" value="public" ${room.visibility === 'public' ? 'checked' : ''}><span>Public (in Discover)</span></label>
        <label class="toggle"><input type="radio" name="sVis" value="private" ${room.visibility !== 'public' ? 'checked' : ''}><span>Private</span></label></div></fieldset>
      <fieldset class="field"><legend>Joining</legend><div class="chips">
        <label class="toggle"><input type="radio" name="sJoin" value="open" ${room.joinMode === 'open' ? 'checked' : ''}><span>Anyone can join</span></label>
        <label class="toggle"><input type="radio" name="sJoin" value="request" ${room.joinMode === 'request' ? 'checked' : ''}><span>You approve each request</span></label></div></fieldset>
      <div class="field"><label for="sCap">Member cap</label><input id="sCap" type="number" min="2" max="50" value="${room.capacity}"></div>
    </details>` : ''}
    <p class="msg err" id="sErr" role="alert" hidden></p>
    <div class="dlg-actions"><button type="button" class="btn ghost" id="sCancel">Cancel</button><button type="submit" class="btn primary">Save</button></div>
  </form>`;
  d.showModal(); wireDialogClose(d); $('#sTitle').focus();
  $('#sCancel').addEventListener('click', () => d.close());
  $('#setForm').addEventListener('submit', async e => {
    e.preventDefault();
    const fields = { title: $('#sTitle').value.trim(), description: $('#sDesc').value.trim(), aiMode: ($('input[name=sAi]:checked') || { value: 'off' }).value };
    if (isOwner) {
      fields.visibility = ($('input[name=sVis]:checked') || { value: room.visibility }).value;
      fields.joinMode = ($('input[name=sJoin]:checked') || { value: room.joinMode }).value;
      fields.capacity = $('#sCap').value || room.capacity;
    }
    try {
      const { room: fresh } = await apiRaw(`/api/rooms/${encodeURIComponent(room.id)}`, { method: 'PATCH', body: JSON.stringify(fields) });
      d.close(); paintRoom(fresh); say('Settings saved.');
    } catch (ex) {
      const er = $('#sErr'); er.innerHTML = icon.alert + `<span>${esc(ex.message)}</span>`; er.hidden = false;
    }
  });
}

// report dialog: files a report for human review; nothing automatic happens to anyone
const REPORT_REASONS = ['Harassment or hate', 'Spam or scam', 'Inappropriate content', 'Safety concern', 'Someone is not 18+', 'Other'];
function openReport(room, target) {
  const d = $('#settingsDialog');
  d.innerHTML = `<form method="dialog" id="repForm" novalidate class="dlg">
    <div class="dlg-head">${markImg(48)}<div><h2 id="settingsTitle">Report to moderators</h2><p class="hint">A human looks at every report. Nothing happens automatically to the person you report, and they are not told who reported them.</p></div></div>
    <p class="report-target">Reporting: <strong>${esc(target.name || 'a member')}</strong></p>
    <fieldset class="field"><legend>Reason</legend><div class="chips" id="repReasons">${REPORT_REASONS.map((r, i) => `<label class="toggle"><input type="radio" name="repReason" value="${esc(r)}" ${i === 0 ? 'checked' : ''}><span>${esc(r)}</span></label>`).join('')}</div></fieldset>
    <div class="field"><label for="repDetails">What happened? <span class="opt">(optional)</span></label><textarea id="repDetails" rows="3" maxlength="500" placeholder="Add context if you can."></textarea></div>
    <p class="msg err" id="repErr" role="alert" hidden></p>
    <div class="dlg-actions"><button type="button" class="btn ghost" id="repCancel">Cancel</button><button type="submit" class="btn primary">Send report</button></div>
  </form>`;
  d.showModal(); wireDialogClose(d);
  $('#repCancel').addEventListener('click', () => d.close());
  $('#repForm').addEventListener('submit', async e => {
    e.preventDefault();
    const reason = ($('input[name=repReason]:checked') || { value: 'Other' }).value;
    try {
      const r = await apiRaw('/api/reports', { method: 'POST', body: JSON.stringify({ roomId: room.id, targetPid: target.pid, reason, details: $('#repDetails').value.trim() }) });
      d.close(); say(r.note || 'Report filed for review.');
    } catch (ex) {
      const er = $('#repErr'); er.innerHTML = icon.alert + `<span>${esc(ex.message)}</span>`; er.hidden = false;
    }
  });
}

// ---------- HELP ----------
// One button in the corner for anyone who is stuck. The answer comes from the app's own state first
// ("what do I do next" is answered from the matcher's next step), then from the help bot, then from
// the server's keyword fallback, so it still answers with no AI key configured. When the question
// asks where something is, the panel closes and the page takes them there; anything else offers the
// way as a button, so a how-to answer never yanks the page out from under them.
const HELP_IDEAS = ['What do I do next?', 'Take me to my groups', 'How do I make a group?', 'Where is my profile?'];
// Each guide target mapped to the control it names, so an answer can point at the real thing.
const HELP_TARGETS = { goal: '.goal-wrap', need: '.goal-wrap', find: '#findBtn', finderInput: '#fInput', profile: '#profileBtn', auth: '#authBtn', offer: '#offerInput', create: '#createBtn' };
const HELP_PAGE_NAMES = { '#/': 'Home', '#/discover': 'Discover', '#/finder': 'the AI Finder', '#/groups': 'My groups' };
const helpLog = [];

function paintHelpButton() {
  const b = $('#helpBtn'), d = $('#helpDialog');
  if (b) b.setAttribute('aria-expanded', String(!!(d && d.open)));
}

function openHelp() {
  const d = $('#helpDialog');
  if (d.open) { d.close(); paintHelpButton(); return; }
  d.innerHTML = `<div class="help-panel">
    <div class="help-head">
      <span class="help-mark">${markImg(30)}</span>
      <div class="help-title"><h2 id="helpTitle">Help</h2><p class="hint">Ask where things are and I will take you there.</p></div>
      <button type="button" class="help-x" id="helpClose" aria-label="Close help">${icon.x}</button>
    </div>
    <div class="help-log" id="helpLog" role="log" aria-live="polite" aria-label="Help conversation"></div>
    <div class="help-ideas" id="helpIdeas">${HELP_IDEAS.map(x => `<button type="button" class="chip" data-idea="${esc(x)}">${esc(x)}</button>`).join('')}</div>
    <form class="help-form" id="helpForm" novalidate>
      <label class="sr" for="helpInput">Ask a question</label>
      <input id="helpInput" type="text" maxlength="200" autocomplete="off" placeholder="Where do I find my groups?">
      <button class="btn primary sm" type="submit">Ask</button>
    </form>
  </div>`;
  // Non-modal on purpose: the page stays usable while the panel is open, so an answer can point at
  // a control that the member can see and reach.
  d.show();
  paintHelpButton();
  paintHelpLog();
  $('#helpClose').addEventListener('click', () => { d.close(); paintHelpButton(); });
  d.addEventListener('close', paintHelpButton, { once: true });
  $$('#helpIdeas [data-idea]').forEach(b => b.addEventListener('click', () => askHelp(b.dataset.idea)));
  $('#helpLog').addEventListener('click', e => {
    const go = e.target.closest('[data-go]');
    if (go) takeHelpAction({ hash: go.dataset.go || null, dialog: go.dataset.goDialog || null, label: go.dataset.goLabel || '' });
  });
  $('#helpForm').addEventListener('submit', e => { e.preventDefault(); askHelp($('#helpInput').value); });
  $('#helpInput').focus();
}

function paintHelpLog() {
  const box = $('#helpLog'); if (!box) return;
  // While help is answering, its bubble is the same three dots the rest of KNOT uses, so a wait
  // always looks like a wait.
  box.innerHTML = helpLog.map(m => m.wait
    ? '<p class="help-bubble bot wait" aria-label="Help is typing"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span></p>'
    : `<p class="help-bubble ${m.role === 'user' ? 'me' : 'bot'}">${esc(m.text)}${m.go ? `<button type="button" class="help-go" data-go="${esc(m.go.hash || '')}" data-go-dialog="${esc(m.go.dialog || '')}" data-go-label="${esc(m.go.label || '')}">Take me to ${esc(m.go.label || 'there')}</button>` : ''}</p>`).join('');
  box.scrollTop = box.scrollHeight;
}

// The next step the app knows about: the matcher's own hint when there is one, otherwise the goal
// box on the page in front of the member. Null means the app has nothing useful to add.
function helpNext() {
  if (state.resp && state.resp.next) return state.resp.next;
  const h = location.hash || '#/';
  // Signed out, the only step that unlocks anything is signing in: the rest of KNOT is member-only.
  if (!state.acct) return { target: 'auth' };
  if ((h === '#/' || h === '#/finder') && $('#goal')) return { target: 'goal' };
  return null;
}

async function askHelp(text) {
  text = String(text || '').trim().slice(0, 200);
  if (!text || state.helpBusy) return;
  const input = $('#helpInput'); if (input) input.value = '';
  helpLog.push({ role: 'user', text });
  helpLog.push({ role: 'bot', text: '', wait: true });
  state.helpBusy = true; paintHelpLog();
  try {
    const out = await apiRaw('/api/ai/help', {
      method: 'POST',
      body: JSON.stringify({
        history: helpLog.filter(m => !m.wait).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
        // The groups they are in travel with the question, so "take me to the camping group" can
        // open that room instead of the list of rooms.
        context: { next: helpNext(), groups: (state.rooms || []).map(r => ({ id: r.id, title: r.title })) }
      })
    });
    helpLog.pop();
    // The answer is the bot's own words, with the way there beside them. A question that asked
    // where something is gets taken there straight away; the answer stays in the log for when they
    // come back to the panel.
    const go = helpDestination(out);
    helpLog.push({ role: 'bot', text: out.reply || 'How can I help?', go });
    paintHelpLog();
    if (out.navigate && go) setTimeout(() => takeHelpAction(go), 650);
    else if (out.highlight) flashHelpTarget(out.highlight, 0);
  } catch {
    helpLog.pop();
    helpLog.push({ role: 'bot', text: state.acct ? 'I could not answer just now. The top bar goes to Home, Discover, AI Finder and My groups.' : 'I could not answer just now. The top bar goes to Home, and Sign in is next to it.' });
    paintHelpLog();
  } finally { state.helpBusy = false; }
}

// Where an answer can take someone: a page route, a panel that opens over the page, or nothing.
function helpDestination(out) {
  if (!out) return null;
  if (out.hash) return { hash: out.hash, dialog: null, label: out.label || HELP_PAGE_NAMES[out.hash] || 'there' };
  if (out.dialog === 'profile') return { hash: null, dialog: 'profile', label: out.label || 'your profile' };
  return null;
}

// An answer that has somewhere to go closes the panel and goes there, then rings the control it
// named for a moment so the member can see what it was talking about.
function takeHelpAction(out) {
  const d = $('#helpDialog'); if (d.open) d.close();
  if (out.dialog === 'profile') {
    openProfile();
    say('Help opened ' + (out.label || 'your profile') + '.');
    return;
  }
  if (out.hash && out.hash !== (location.hash || '#/')) {
    location.hash = out.hash;
    say('Help took you to ' + (out.label || out.hash) + '.');
  }
  if (out.highlight) flashHelpTarget(out.highlight, out.hash ? 400 : 0);
}

function flashHelpTarget(target, delay = 0) {
  // The profile control only exists once there is an account; until then the way in is Sign in.
  const sel = target === 'profile' && !state.acct ? '#authBtn' : HELP_TARGETS[target];
  if (!sel) return;
  let tries = 0;
  const ring = () => {
    const el = $(sel);
    // Pages render after a hash change, so wait for the control rather than give up on the first try.
    if (!el) { if (tries++ < 12) setTimeout(ring, 150); return; }
    el.classList.remove('help-flash');
    void el.offsetWidth;
    el.classList.add('help-flash');
    if (el.scrollIntoView) el.scrollIntoView({ block: 'center', behavior: reduceMotion() ? 'auto' : 'smooth' });
    setTimeout(() => el.classList.remove('help-flash'), 2400);
  };
  setTimeout(ring, delay);
}

// ---------- INVITE JOIN ----------
async function renderJoin(code) {
  const main = $('#main');
  main.innerHTML = `<section class="page"><div id="joinBody" aria-live="polite"><p class="hint">Opening invite…</p></div></section>`;
  try {
    const { room } = await apiRaw('/api/rooms/join', { method: 'POST', body: JSON.stringify({ code }) });
    say('You are in. Say hi to the group.');
    location.hash = '#/room/' + room.id;
    if (!room.isMember) setTimeout(() => say('You are previewing this group.'), 600);
  } catch (ex) {
    $('#joinBody').innerHTML = `<div class="empty"><img src="assets/art/puzzle_piece.png" width="110" height="112" alt="" class="empty-art"><div><h2>Invite problem</h2><p>${esc(ex.message)}</p><a class="btn ghost" href="#/groups">Back to My groups</a></div></div>`;
  }
}

// ---------- BOOT ----------
async function boot() {
  $('#menuBtn').addEventListener('click', () => {
    const n = $('#mobileNav'), b = $('#menuBtn');
    const open = !n.classList.contains('open');
    n.classList.toggle('open', open);
    b.setAttribute('aria-expanded', String(open));
  });
  $('#navHome').addEventListener('click', closeMenu);
  $('#navDiscover').addEventListener('click', closeMenu);
  $('#navFinder').addEventListener('click', closeMenu);
  $('#navGroups').addEventListener('click', closeMenu);
  $('#profileBtn').addEventListener('click', () => openProfile());
  $('#authBtn').addEventListener('click', () => openAuth('in'));
  $('#helpBtn').addEventListener('click', openHelp);
  try {
    const status = await apiRaw('/api/status');
    localRooms = !status.persistent;
    state.skills = (await apiRaw('/api/skills')).skills;
    const me = await apiRaw('/api/session', { method: 'POST', body: JSON.stringify({ legacyClientId: state.clientId }) });
    state.sessionId = me.id;
    state.sessionName = me.name;
    if (me.signedIn) state.acct = me;
    else if (me.name) state.me = Object.assign(state.me || {}, { name: me.name });
    paintHeader();
    route(true);
    if (localRooms) console.info('KNOT: no shared database on this host, so groups live in this browser.');
  } catch (ex) {
    $('#main').innerHTML = `<div class="empty"><div><h2>KNOT could not reach the server</h2><p>${esc(ex.message)}</p></div></div>`;
  }
}
boot();
})();
