'use strict';
// Storage dispatcher. Set DATABASE_URL (Supabase Postgres or any Postgres) for a shared backend that
// every computer and the deployed site see at the same time; otherwise a local JSON file is used.
const url = process.env.DATABASE_URL;
if (url) {
  module.exports = require('./store-pg')(url);
} else {
  module.exports = require('./store-json')(process.env.KNOT_DB_PATH || path.join(__dirname, '..', 'data', 'db.json'));
}
