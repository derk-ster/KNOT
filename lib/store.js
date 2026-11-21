'use strict';
// Storage dispatcher. Set DATABASE_URL (Supabase Postgres or any Postgres) for a shared backend that
// every computer and the deployed site see at the same time; otherwise a local JSON file is used.
// Dashboard environment fields routinely capture a trailing newline or wrapping quotes on paste.
// Strip them before connecting, otherwise the password silently carries the extra characters and
// Postgres answers with "password authentication failed" rather than anything pointing at whitespace.
const url = String(process.env.DATABASE_URL || '').trim().replace(/^["']|["']$/g, '');
if (url) {
  module.exports = require('./store-pg')(url);
} else {
  module.exports = require('./store-json')(process.env.KNOT_DB_PATH || path.join(__dirname, '..', 'data', 'db.json'));
}
