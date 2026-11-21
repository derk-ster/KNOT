#!/usr/bin/env node
'use strict';
// Syntax check every JavaScript file in the app (no external linter installed).
const { execFileSync } = require('child_process');
const glob = require('fs').readdirSync;
const files = [
  'server.js',
  ...glob(__dirname + '/../lib').filter(f => f.endsWith('.js')).map(f => 'lib/' + f),
  ...glob(__dirname + '/../api').filter(f => f.endsWith('.js')).map(f => 'api/' + f),
  ...glob(__dirname + '/../public').filter(f => f.endsWith('.js')).map(f => 'public/' + f),
  ...glob(__dirname + '/../test').filter(f => f.endsWith('.js')).map(f => 'test/' + f),
  ...glob(__dirname + '/../bin').filter(f => f.endsWith('.js') && f !== 'lint.js').map(f => 'bin/' + f)
];
let failed = 0;
for (const f of files) {
  try { execFileSync('node', ['--check', f], { stdio: 'pipe' }); console.log('ok   ' + f); }
  catch (e) { failed++; console.error('FAIL ' + f + '\n' + e.stderr); }
}
process.exit(failed ? 1 : 0);
