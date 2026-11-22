// Hash routing. Pages are drawn by the view modules; members-only pages show a sign-in card to guests.
import { $, esc } from './ui.js';
import { api } from './api.js';
import { state, isSignedIn } from './state.js';
import { paintHeader, closeMenus } from './components/header.js';
import { toggleHelp } from './components/help.js';
import { renderHome } from './views/home.js';
import { renderFinder } from './views/finder.js';
import { renderDiscover } from './views/discover.js';
import { renderGroups } from './views/groups.js';
import { renderProfile } from './views/profile.js';
import { renderRoom, renderJoin, stopRoom } from './views/room.js';

const MEMBERS_ONLY = {
  '#/discover': { title: 'Discover is for members', hint: 'Public groups and real members open up once you have an account. It is how groups stay moderated.' },
  '#/finder': { title: 'The AI Finder is for members', hint: 'Matching reads the interests and skills saved on your account, so it needs an account to work from.' },
  '#/groups': { title: 'My groups is for members', hint: 'Your groups follow your account, so they need an account to live in.' },
  '#/profile': { title: 'Your profile is for members', hint: 'Your profile is saved to your account. Sign in, or create an account, to edit it.' }
};

let lastPath = null;
export async function route() {
  const h = (location.hash || '#/').split('?')[0];
  stopRoom();
  closeMenus();
  toggleHelp(false);
  paintHeader();
  if (h !== lastPath) window.scrollTo(0, 0);
  lastPath = h;
  refreshRooms();

  if (h.startsWith('#/room/')) return renderRoom(decodeURIComponent(h.slice(7)));
  if (h.startsWith('#/join/')) return renderJoin(decodeURIComponent(h.slice(7)));
  if (MEMBERS_ONLY[h] && !isSignedIn()) return renderLocked(MEMBERS_ONLY[h]);
  if (h === '#/discover') return renderDiscover();
  if (h === '#/finder') return renderFinder();
  if (h === '#/groups') return renderGroups();
  if (h === '#/profile') return renderProfile();
  return renderHome();
}

function renderLocked(c) {
  $('#main').innerHTML = `<section class="page narrow">
    <div class="empty-card wide locked">
      <h1 tabindex="-1" id="pageH1" class="page-title">${esc(c.title)}</h1>
      <p class="lead">${esc(c.hint)}</p>
      <div class="hero-actions">
        <button type="button" class="btn primary" data-action="signin">Sign in</button>
        <button type="button" class="btn ghost" data-action="signup">Create an account</button>
      </div>
    </div>
  </section>`;
  $('#pageH1').focus({ preventScroll: true });
}

// The group count in the header. Guests have no groups, so nothing is fetched for them.
export async function refreshRooms() {
  if (!isSignedIn()) { state.rooms = []; paintHeader(); return; }
  try {
    state.rooms = (await api('/api/rooms')).rooms || [];
  } catch { /* keep the last count */ }
  paintHeader();
}
