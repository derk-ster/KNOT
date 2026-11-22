// End-to-end check for KNOT, run against a running server.
// Usage: BASE_URL=http://localhost:3100 node scripts/e2e.mjs [outDir]
// Needs Playwright and a Chromium it can launch (set KNOT_CHROMIUM to its path if needed).
// Prints one JSON report: the display name at each step, timings of the group message round trip,
// console errors, and screenshots written to outDir.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
// Resolve Playwright from the directory the script is run in, so a global or project install both work.
const require = createRequire(path.join(process.cwd(), 'index.js'));
const { chromium } = require('playwright');

const BASE = (process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const OUT = process.argv[2] || path.join(process.env.TMPDIR || '/tmp', 'knot-e2e');
fs.mkdirSync(OUT, { recursive: true });
const stamp = Date.now().toString(36);
const EMAIL = `e2e.${stamp}@example.com`;
const PASSWORD = 'Hunter2' + stamp.slice(-4);
const NAME = 'E2E Tester';

const report = { base: BASE, steps: [], consoleErrors: [], timings: {}, shots: [] };
const note = (step, data = {}) => { report.steps.push({ step, ...data }); };

const launchOpts = { headless: true, args: ['--no-sandbox'] };
if (process.env.KNOT_CHROMIUM) launchOpts.executablePath = process.env.KNOT_CHROMIUM;
const browser = await chromium.launch(launchOpts);

async function newPage(width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
  page.on('pageerror', e => report.consoleErrors.push('pageerror: ' + e.message));
  return { ctx, page };
}
async function shot(page, name) {
  const p = path.join(OUT, name + '.png');
  await page.screenshot({ path: p, fullPage: false });
  report.shots.push(p);
}
const nameOf = page => page.locator('#profileLabel').innerText().catch(() => '?');
// Full stored name for the signed-in session (the header label only shows the first word).
const fullName = page => page.evaluate(async () => { const r = await fetch('/api/auth/me'); const j = await r.json(); return j.name || null; }).catch(() => null);

// ---------- desktop run: sign up, sign out, sign in, group message ----------
{
  const { ctx, page } = await newPage(1280);
  await page.goto(BASE + '/#/');
  await page.waitForSelector('#authBtn:not([hidden])');
  await page.click('#authBtn');
  await page.click('#aSwap');                       // from sign in to create account
  await page.fill('#aEmail', EMAIL);
  await page.fill('#aPass', PASSWORD);
  await page.fill('#aName', NAME);
  await page.check('#a18');
  await page.click('#aSubmit');
  await page.waitForSelector('#profileDialog[open]', { timeout: 15000 }).catch(() => {});
  note('after signup', { fullName: await fullName(page), dialogOpen: await page.locator('#profileDialog').evaluate(d => d.open) });
  await page.keyboard.press('Escape');

  await page.click('#profileBtn').catch(() => {});
  await page.waitForSelector('#profileDialog[open]', { timeout: 5000 }).catch(() => {});
  await page.click('#pSignOut').catch(() => {});
  await page.click('#askDialog [data-yes]').catch(() => {});
  await page.waitForTimeout(500);
  note('after sign out', { profileLabel: await nameOf(page) });

  await page.click('#authBtn');
  await page.fill('#aEmail', EMAIL);
  await page.fill('#aPass', PASSWORD);
  await page.click('#aSubmit');
  await page.waitForTimeout(1200);
  const full = await fullName(page);
  note('after sign in', { fullName: full, nameEqualsPassword: full === PASSWORD });

  // Create a group directly through the API from this browser session, then open it.
  const roomId = await page.evaluate(async () => {
    const r = await fetch('/api/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: crypto.randomUUID(), clientId: 'e2e', ownerName: 'E2E Tester', title: 'E2E group', goal: 'Test the group chat', memberIds: ['maya-okafor', 'theo-nguyen'], visibility: 'public', joinMode: 'open', capacity: 12, onlineOnly: true, ownerSkills: [] })
    });
    const j = await r.json();
    return j.room && j.room.id;
  });
  note('group created', { roomId });
  await page.goto(BASE + '/#/room/' + roomId);
  await page.waitForSelector('#msgInput', { timeout: 10000 });
  await page.waitForTimeout(600);
  const before = await page.locator('#msgLog .bubble').count();

  const t0 = Date.now();
  const postDone = page.waitForResponse(r => r.url().includes('/messages') && r.request().method() === 'POST', { timeout: 30000 });
  await page.fill('#msgInput', 'Hello from the e2e run ' + stamp);
  await page.press('#msgInput', 'Enter');
  const resp = await postDone;
  report.timings.postMs = Date.now() - t0;
  report.timings.postStatus = resp.status();
  await shot(page, 'room-just-sent');

  // Watch the room for a reply for up to 20 s and record when the count first grows.
  let repliedAt = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(500);
    const n = await page.locator('#msgLog .bubble').count();
    if (n > before + 1 && repliedAt === null) { repliedAt = Date.now() - t0; break; }
  }
  report.timings.firstReplyVisibleMs = repliedAt;
  report.timings.bubblesBefore = before;
  report.timings.bubblesAfter = await page.locator('#msgLog .bubble').count();
  await page.waitForTimeout(2500);
  await shot(page, 'room-after-replies');
  await ctx.close();
}

// ---------- mobile screenshots of the main pages ----------
{
  const { ctx, page } = await newPage(390);
  await page.goto(BASE + '/#/');
  await page.waitForTimeout(800);
  await shot(page, 'mobile-home');
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
