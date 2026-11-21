'use strict';
// JSON-file storage with atomic writes. One writer (this process).
const fs = require('fs');
const path = require('path');
// On Vercel the project folder is read-only; /tmp works but is not shared between instances
// (the browser keeps its own copy of groups in that mode, see public/app.js).
const FILE = process.env.VERCEL ? path.join(require('os').tmpdir(), 'knot-db.json') : path.join(__dirname, '..', 'data', 'db.json');
let db = { rooms: [] };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (!Array.isArray(db.rooms)) db.rooms = []; } catch { /* fresh db */ }
function save() { try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2)); fs.renameSync(FILE + '.tmp', FILE); } catch (e) { console.error('Could not save data:', e.message); } }
module.exports = { db, save };
