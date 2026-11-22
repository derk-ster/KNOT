// Sign in and create account: one dialog with two modes. Each field has the autocomplete value its
// browser autofill expects, so the password only ever fills a password field and the display name is
// always its own field. The server has the final say on every rule.
import { $, esc, toast, navigate } from '../ui.js';
import { api } from '../api.js';
import { state, store, isSignedIn } from '../state.js';
import { openDialog } from '../dialog.js';
import { paintHeader } from '../components/header.js';

export function openAuth(mode = 'in') {
  if (isSignedIn()) return navigate('#/profile');
  const up = mode === 'up';
  const d = openDialog({
    title: up ? 'Create your account' : 'Welcome back',
    sub: up ? 'Email, a password and a display name. About a minute.' : 'Sign in to reach your groups from any device.',
    body: `<form id="authForm" class="form" novalidate>
        <div class="field">
          <label for="aEmail">Email</label>
          <input id="aEmail" type="email" maxlength="120" autocomplete="${up ? 'email' : 'username'}" required>
        </div>
        <div class="field">
          <label for="aPass">Password</label>
          <div class="pass-wrap">
            <input id="aPass" type="password" maxlength="200" autocomplete="${up ? 'new-password' : 'current-password'}" aria-describedby="aPassHint" required>
            <button type="button" class="pass-eye" id="aPassEye" aria-controls="aPass" aria-label="Show password">Show</button>
          </div>
          <p class="hint" id="aPassHint">${up ? 'At least 8 characters, with letters and numbers. It cannot be your display name.' : ''}</p>
        </div>
        ${up ? `<div class="field">
          <label for="aName">Display name</label>
          <input id="aName" type="text" maxlength="40" autocomplete="name" aria-describedby="aNameHint" required>
          <p class="hint" id="aNameHint">This is what other members see. It is never your password.</p>
        </div>
        <label class="check"><input type="checkbox" id="a18"> <span>I am 18 years or older.</span></label>` : ''}
        <p class="msg err" id="aErr" role="alert" hidden></p>
        <div class="form-actions">
          <button type="button" class="btn ghost" id="aSwap">${up ? 'I already have an account' : 'New here? Create an account'}</button>
          <button type="submit" class="btn primary" id="aSubmit">${up ? 'Create account' : 'Sign in'}</button>
        </div>
      </form>`,
    onClose: () => {}
  });
  const err = $('#aErr', d);
  const showErr = t => { err.textContent = t; err.hidden = false; };
  $('#aSwap', d).addEventListener('click', () => { d.close(); openAuth(up ? 'in' : 'up'); });
  const pass = $('#aPass', d), eye = $('#aPassEye', d);
  eye.addEventListener('click', () => {
    const show = pass.type === 'password';
    pass.type = show ? 'text' : 'password';
    eye.textContent = show ? 'Hide' : 'Show';
    eye.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    pass.focus();
  });
  $('#aEmail', d).focus();
  $('#authForm', d).addEventListener('submit', async e => {
    e.preventDefault();
    err.hidden = true;
    const email = $('#aEmail', d).value.trim();
    const password = pass.value;
    const name = up ? $('#aName', d).value.trim() : '';
    if (!email || !password) return showErr('Enter your email and password.');
    if (up) {
      if (!name) return showErr('Add a display name so other members know who you are.');
      if (name.toLowerCase() === password.toLowerCase()) return showErr('Your display name cannot be your password. Pick a name other members will know you by.');
      if (!$('#a18', d).checked) return showErr('KNOT is for members 18 and over. Confirm your age to continue.');
    }
    const submit = $('#aSubmit', d);
    submit.disabled = true; submit.textContent = up ? 'Creating your account…' : 'Signing in…';
    try {
      const me = await api(up ? '/api/auth/signup' : '/api/auth/signin', {
        method: 'POST', body: up ? { email, password, name, confirm18: true } : { email, password }
      });
      state.me = me;
      d.close();
      paintHeader();
      const invite = store.get('knot.pendingInvite', null);
      if (invite) { store.set('knot.pendingInvite', null); toast('Signed in. Opening your invite.', 'ok'); navigate('#/join/' + invite); }
      else if (up) { toast('Account created. Add what you offer so matching works.', 'ok'); navigate('#/profile'); }
      else if (me.nameReset) { toast('Your display name was your password, so it was reset. Pick a name for your profile.', 'warn'); navigate('#/profile'); }
      else { toast('Signed in.', 'ok'); navigate('#/'); }
    } catch (ex) {
      submit.disabled = false; submit.textContent = up ? 'Create account' : 'Sign in';
      showErr(ex.message);
    }
  });
}

export async function signOut() {
  try { state.me = await api('/api/auth/signout', { method: 'POST', body: {} }); }
  catch { /* offline: the session still ends on this page */ state.me = { ...state.me, signedIn: false, accountId: null, isGuest: true, profile: null }; }
  state.rooms = [];
  paintHeader();
  toast('Signed out. Your groups are still here when you sign back in.');
  navigate('#/');
}
