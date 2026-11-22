// One place for every request to the server. Each call has a timeout, and every failure becomes a
// plain sentence a member can act on. Errors carry .status, and .held when a message was held.
export async function api(path, { method = 'GET', body, timeout = 15000 } = {}) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeout);
  let r;
  try {
    r = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctl.signal
    });
  } catch (e) {
    throw new Error(e.name === 'AbortError' ? 'That took too long. Check your connection and try again.' : 'KNOT could not be reached. Check your connection and try again.');
  } finally { clearTimeout(timer); }
  let data = null;
  try { data = await r.json(); } catch { /* not JSON: the status code still says what happened */ }
  if (!r.ok) {
    const err = new Error((data && data.error) || `Something went wrong (${r.status}). Try again.`);
    err.status = r.status;
    err.held = !!(data && data.held);
    throw err;
  }
  return data;
}
