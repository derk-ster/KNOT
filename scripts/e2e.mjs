// End-to-end check for KNOT, run against a running server.
// Usage: BASE_URL=http://localhost:3000 node scripts/e2e.mjs [outDir]
// Needs Playwright. Set KNOT_CHROMIUM to a Chromium path if Playwright cannot find one.
// Prints one JSON report: sign-up, sign-out and sign-in (the display name at each step), a group
// message round trip, console errors, overlap checks on the composer, and screenshots.
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

const report = { base: BASE, steps: [], consoleErrors: [], timings: {}, checks: {}, shots: [] };
const note = (step, data = {}) => report.steps.push({ step, ...data });

const launchOpts = { headless: true, args: ['--no-sandbox'] };
if (process.env.KNOT_CHROMIUM) launchOpts.executablePath = process.env.KNOT_CHROMIUM;
const browser = await chromium.launch(launchOpts);

async function newPage(width) {
  const ctx = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') report.consoleErrors.push(m.text()); });
  page.on('pageerror', e => report.consoleErrors.push('pageerror: ' + e.message));
  page.on('response', r => { if (r.status() >= 400) report.consoleErrors.push(`HTTP ${r.status()} ${r.url().replace(BASE, '')}`); });
  return { ctx, page };
}
async function shot(page, name) {
  const p = path.join(OUT, name + '.png');
  await page.screenshot({ path: p, fullPage: false });
  report.shots.push(p);
}
const fullName = page => page.evaluate(async () => { const r = await fetch('/api/auth/me'); const j = await r.json(); return j.name || null; }).catch(() => null);
const accountShown = page => page.locator('.account-name').innerText().catch(() => null);

// ---------- desktop run ----------
{
  const { ctx, page } = await newPage(1280);
  await page.goto(BASE + '/#/');
  await page.waitForSelector('[data-action="signup"]', { timeout: 15000 });
  await shot(page, 'landing-desktop');

  await page.locator('.hero [data-action="signup"]').click();
  await page.fill('#aEmail', EMAIL);
  await page.fill('#aPass', PASSWORD);
  await page.fill('#aName', NAME);
  await page.check('#a18');
  await page.click('#aSubmit');
  await page.waitForURL(/#\/profile/, { timeout: 15000 }).catch(() => {});
  note('after sign-up', { hash: await page.evaluate(() => location.hash), fullName: await fullName(page), shownName: await accountShown(page) });

  await page.click('.account-btn');
  await page.click('[data-action="signout"]');
  await page.waitForSelector('#account [data-action="signin"]', { timeout: 10000 }).catch(() => {});
  note('after sign out', { fullName: await fullName(page), signInShown: await page.locator('#account [data-action="signin"]').count() });

  await page.click('#account [data-action="signin"]');
  await page.fill('#aEmail', EMAIL);
  await page.fill('#aPass', PASSWORD);
  await page.click('#aSubmit');
  await page.waitForSelector('.account-btn', { timeout: 15000 }).catch(() => {});
  const full = await fullName(page);
  note('after sign-in', { fullName: full, nameEqualsPassword: full === PASSWORD, shownName: await accountShown(page) });

  const roomId = await page.evaluate(async () => {
    const r = await fetch('/api/rooms', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: crypto.randomUUID(), clientId: 'e2e', ownerName: 'E2E Tester', title: 'E2E group', goal: 'Test the group chat', memberIds: ['maya-okafor', 'theo-nguyen'], visibility: 'public', joinMode: 'open', capacity: 12, onlineOnly: true, ownerSkills: [] })
    });
    return (await r.json()).room.id;
  });
  await page.goto(BASE + '/#/room/' + roomId);
  await page.waitForSelector('#msgInput', { timeout: 10000 });
  await page.waitForTimeout(500);
  const before = await page.locator('.msg-row').count();

  const t0 = Date.now();
  const sent = page.waitForResponse(r => r.url().includes('/messages') && r.request().method() === 'POST', { timeout: 30000 });
  await page.fill('#msgInput', 'Hello from the e2e run ' + stamp);
  await page.press('#msgInput', 'Enter');
  await sent;
  report.timings.postMs = Date.now() - t0;
  await shot(page, 'room-just-sent');

  let firstReply = null;
  for (let i = 0; i < 40; i++) {
    await page.waitForTimeout(250);
    const n = await page.locator('.msg-row').count();
    if (n > before + 1 && firstReply === null) firstReply = Date.now() - t0;
    if (n >= before + 4) break;
  }
  await page.waitForTimeout(800);
  report.timings.firstReplyVisibleMs = firstReply;
  report.timings.rowsBefore = before;
  report.timings.rowsAfter = await page.locator('.msg-row').count();
  report.checks.sendingLeftOver = await page.locator('.msg-row.sending').count();
  report.checks.failedRows = await page.locator('.msg-row.failed').count();

  // Overlap: the Send button must be the element at its own centre, and the Help button must not
  // sit over the composer's Send button.
  const sendBox = await page.locator('#msgForm button[type=submit]').boundingBox();
  const hit = sendBox ? await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el && el.closest('#msgForm button') ? 'send' : (el ? el.tagName + '.' + el.className : 'none'); }, [sendBox.x + sendBox.width / 2, sendBox.y + sendBox.height / 2]) : 'missing';
  report.checks.sendReachable = hit === 'send' ? true : hit;
  const helpBox = await page.locator('[data-action="help"]').boundingBox();
  report.checks.helpOverlapsSend = !!(sendBox && helpBox && !(helpBox.x > sendBox.x + sendBox.width || helpBox.x + helpBox.width < sendBox.x || helpBox.y > sendBox.y + sendBox.height || helpBox.y + helpBox.height < sendBox.y));
  await shot(page, 'room-after-replies');

  // Profile: Sign out and Save must be clickable on the page.
  await page.goto(BASE + '/#/profile');
  await page.waitForSelector('#profileForm', { timeout: 10000 });
  await page.locator('#pSave').scrollIntoViewIfNeeded();
  const save = await page.locator('#pSave').boundingBox();
  const saveHit = save ? await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest('#pSave')); }, [save.x + save.width / 2, save.y + save.height / 2]) : false;
  report.checks.profileSaveReachable = saveHit;
  await page.locator('.account-block [data-action="signout"]').scrollIntoViewIfNeeded();
  const so = await page.locator('.account-block [data-action="signout"]').boundingBox();
  const soHit = so ? await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return !!(el && el.closest('[data-action="signout"]')); }, [so.x + so.width / 2, so.y + so.height / 2]) : false;
  report.checks.profileSignOutReachable = soHit;
  await shot(page, 'profile-desktop');
  await ctx.close();
}

// ---------- mobile screenshots ----------
{
  const { ctx, page } = await newPage(390);
  await page.goto(BASE + '/#/');
  await page.waitForTimeout(900);
  await shot(page, 'landing-mobile');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  report.checks.mobileHorizontalOverflowPx = overflow;
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
