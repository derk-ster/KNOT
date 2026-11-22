// Entry point. Boots the session, then hands every page to the router. Header and page buttons are
// handled by one click listener, keyed on data-action, so no page has to wire its own header controls.
import { $, esc, navigate } from './ui.js';
import { api } from './api.js';
import { state, store } from './state.js';
import { route } from './router.js';
import { paintHeader, closeMenus } from './components/header.js';
import { wireHelp, toggleHelp } from './components/help.js';
import { openAuth, signOut } from './views/auth.js';

const actions = {
  signin: () => openAuth('in'),
  signup: () => openAuth('up'),
  signout: () => signOut(),
  help: () => toggleHelp(),
  menu: (btn) => {
    const nav = $('#nav');
    const open = !nav.classList.contains('open');
    nav.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', String(open));
  },
  'account-menu': (btn) => {
    const menu = btn.parentElement.querySelector('.menu');
    const open = menu.hidden;
    closeMenus(menu);
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }
};

document.addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (btn && actions[btn.dataset.action]) {
    e.preventDefault();
    actions[btn.dataset.action](btn);
    return;
  }
  // Clicking anywhere else closes the account and navigation menus.
  if (!e.target.closest('.account-menu') && !e.target.closest('#nav')) closeMenus();
  if (e.target.closest('#nav a')) closeMenus();
  if (e.target.closest('.account-menu a')) closeMenus();
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeMenus();
});

async function boot() {
  store.set('knot.clientId', state.clientId);
  wireHelp();
  try {
    state.status = await api('/api/status');
    state.skills = (await api('/api/skills')).skills;
    state.me = await api('/api/session', { method: 'POST', body: { legacyClientId: state.clientId } });
  } catch (e) {
    $('#main').innerHTML = `<section class="page narrow"><div class="empty-card wide"><h2>KNOT could not reach the server</h2><p>${esc(e.message)}</p><button type="button" class="btn primary" data-action="reload">Try again</button></div></section>`;
    document.addEventListener('click', e => { if (e.target.closest('[data-action="reload"]')) location.reload(); }, { once: true });
    return;
  }
  paintHeader();
  window.addEventListener('hashchange', route);
  route();
  // An invite opened while signed out resumes here, after the person signs in.
  const pending = store.get('knot.pendingInvite', null);
  if (pending && state.me && state.me.signedIn) { store.set('knot.pendingInvite', null); navigate('#/join/' + pending); }
}

boot();
