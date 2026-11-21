'use strict';
// JSON-file storage with atomic writes. One writer (this process).
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'data', 'db.json');
let db = { rooms: [] };
try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (!Array.isArray(db.rooms)) db.rooms = []; } catch { /* fresh db */ }
function save() { fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 2)); fs.renameSync(FILE + '.tmp', FILE); }
module.exports = { db, save };
