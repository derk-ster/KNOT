// The header: links for the current page, one account control, and the groups count.
// Guests see Home and Sign in. Members also see Discover, AI Finder and My groups.
import { $, $$, avatar, firstName, esc } from '../ui.js';
import { state, isSignedIn } from '../state.js';

export function paintHeader() {
  const signed = isSignedIn();
  const h = location.hash || '#/';
  $$('[data-members-only]').forEach(el => { el.hidden = !signed; });
  const inside = p => h.startsWith(p);
  const current = {
    home: !['#/discover', '#/finder', '#/groups', '#/room', '#/join', '#/profile'].some(inside),
    discover: inside('#/discover'),
    finder: inside('#/finder'),
    groups: inside('#/groups') || inside('#/room') || inside('#/join')
  };
  $$('[data-nav]').forEach(a => {
    const on = !!current[a.dataset.nav];
    a.setAttribute('aria-current', on ? 'page' : 'false');
  });
  const count = $('#groupCount');
  if (count) { count.textContent = state.rooms.length; count.hidden = !state.rooms.length || !signed; }

  const acct = $('#account');
  if (!signed) {
    acct.innerHTML = `<button class="btn primary sm" type="button" data-action="signin">Sign in</button>`;
    return;
  }
  const me = state.me;
  acct.innerHTML = `<div class="account-menu">
      <button class="account-btn" type="button" data-action="account-menu" aria-haspopup="menu" aria-expanded="false" aria-label="Your account">
        ${avatar(me.name, me.profile && me.profile.avatar, 'sm')}<span class="account-name">${esc(firstName(me.name) || 'Profile')}</span>
      </button>
      <div class="menu" role="menu" hidden>
        <a role="menuitem" href="#/profile">Your profile</a>
        <a role="menuitem" href="#/groups">My groups</a>
        <button role="menuitem" type="button" data-action="signout">Sign out</button>
      </div>
    </div>`;
}

export function closeMenus(except = null) {
  $$('.account-menu .menu').forEach(m => { if (m !== except) m.hidden = true; });
  $$('[data-action="account-menu"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  const nav = $('#nav'), mb = $('[data-action="menu"]');
  if (nav) nav.classList.remove('open');
  if (mb) mb.setAttribute('aria-expanded', 'false');
}
