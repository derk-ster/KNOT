// The one shared state object for the browser. The server owns identity; the browser only keeps what
// it was told: the session (guest or signed in), the skill list, the server status and the groups list.
export const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } }
};

export const state = {
  // A stable id for this browser. Guest groups and sessions are tied to it, so it is kept in storage.
  clientId: store.get('knot.clientId', null) || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
  me: null,            // session payload from the server: { signedIn, id, name, accountId, profile, ... }
  skills: [],          // [{ id, label }] from /api/skills
  status: null,        // /api/status
  rooms: [],           // the groups this member is in, for the header count and help
  goal: store.get('knot.goal', ''),
  match: { resp: null, relaxed: [], selected: new Set(), target: null },
  finder: { items: [], busy: false, error: null },
  help: { log: [], busy: false }
};

export const isSignedIn = () => !!(state.me && state.me.signedIn);
// The id the server stamps on messages and members: the account for members, the session user for guests.
export const myPid = () => (state.me ? (state.me.signedIn ? 'a:' + state.me.accountId : String(state.me.id)) : null);
export const skillLabel = id => (state.skills.find(s => s.id === id) || { label: id }).label;
// The member's own profile, shaped for the matcher and forms. Guests have no saved profile.
export const myProfile = () => {
  const p = (state.me && state.me.profile) || {};
  return {
    name: (state.me && state.me.name) || '', bio: p.bio || '', goals: p.goals || '', city: p.city || '',
    skills: p.skills || [], skillLabels: p.skillLabels || [], interests: p.interests || [],
    availability: p.availability || [], mode: p.mode || 'both', avatar: p.avatar || null
  };
};
