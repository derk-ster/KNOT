#!/usr/bin/env node
'use strict';
// Syntax check every JavaScript file in the app (no external linter installed).
// Browser modules under public/js are ES modules, so they are checked as modules.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function walk(dir, out = []) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    const rel = path.posix.join(dir, name);
    if (fs.statSync(path.join(root, rel)).isDirectory()) walk(rel, out);
    else if (name.endsWith('.js') && rel !== 'bin/lint.js') out.push(rel);
  }
  return out;
}

const files = ['server.js', ...walk('lib'), ...walk('api'), ...walk('public'), ...walk('test'), ...walk('bin'), ...walk('scripts')];
let failed = 0;
for (const f of files) {
  const args = f.startsWith('public/js/') ? ['--experimental-default-type=module', '--check', f] : ['--check', f];
  try { execFileSync('node', args, { stdio: 'pipe', cwd: root }); console.log('ok   ' + f); }
  catch (e) { failed++; console.error('FAIL ' + f + '\n' + e.stderr); }
}
process.exit(failed ? 1 : 0);
