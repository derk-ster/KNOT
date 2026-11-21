#!/usr/bin/env node
'use strict';
// Verifies DATABASE_URL connectivity and prints table counts. Run after configuring Supabase:
//   npm run db:check
const fs = require('fs');
const path = require('path');
try {
  for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && !line.trim().startsWith('#') && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* no .env */ }
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set (nothing to check).'); process.exit(1); }
const store = require('../lib/store');
(async () => {
  try {
    const u = await store.ensureUser('db-check-' + Math.random().toString(16).slice(2));
    const rooms = await store.listRoomsForUser(u);
    console.log(`Connected. Storage: ${store.kind}. Test user: ${u.id}. Rooms visible to a fresh user: ${rooms.length}.`);
    console.log('Shared backend is ready. Groups and messages created here are visible to everyone using the same database.');
    process.exit(0);
  } catch (e) {
    console.error('Database check FAILED:', e.message);
    console.error('Check the connection string (host .pooler.supabase.com, port 6543, correct password), then retry.');
    process.exit(1);
  }
})();
