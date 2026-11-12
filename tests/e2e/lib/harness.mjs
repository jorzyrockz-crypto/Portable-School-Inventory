// Shared helpers for the end-to-end tests: one headless browser per simulated phone, the
// app served from BASE_URL, Firebase replaced by the in-memory stand-in.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const BASE_URL = process.env.BASE_URL || 'http://localhost:8080/';
const FAKE_SDK = fs.readFileSync(path.join(HERE, 'fake-firebase.js'), 'utf8');
const TEST_CONFIG = 'window.FIREBASE_CONFIG = { apiKey: "test-key", authDomain: "demo.firebaseapp.com", projectId: "demo-school", appId: "1:1:web:1" };';

let failures = 0;
export const out = (...a) => console.log(...a);
export function check(cond, msg) {
  if (!cond) { failures++; out('FAIL:', msg); process.exitCode = 1; } else out('  ok', msg);
}
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const ev = (page, fn, ...args) => page.evaluate(fn, ...args);
export async function until(page, fn, what, ms = 8000, ...args) {
  try { await page.waitForFunction(fn, { timeout: ms, polling: 100 }, ...args); return true; }
  catch (e) { out(`   (timed out waiting for ${what})`); return false; }
}

const browsers = [];
export const errors = [];

// A phone: its own browser (separate storage), Firebase stand-in wired to `backend`.
export async function openPhone(name, backend, { width = 390, height = 844, dialogs = [], tour = false } = {}) {
  const executablePath = process.env.CHROME_PATH || await chromium.executablePath();
  const browser = await puppeteer.launch({ executablePath, args: process.env.CHROME_PATH ? ['--no-sandbox'] : chromium.args, headless: true });
  browsers.push(browser);
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: width < 700, hasTouch: width < 700 });
  await page.setBypassServiceWorker(true);
  await page.exposeFunction('__fb', backend.handler);
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.endsWith('/firebase-config.js') || url.includes('/firebase-config.js?')) return req.respond({ status: 200, contentType: 'text/javascript', body: TEST_CONFIG });
    if (url.includes('/assets/cloud/firebase.js')) return req.respond({ status: 200, contentType: 'text/javascript', body: FAKE_SDK });
    req.continue();
  });
  page.on('pageerror', e => errors.push(`${name}: ${e}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  // Prompts get dialogs.prompt; confirms get dialogs.confirm (default true). All are logged.
  page.on('dialog', async d => {
    dialogs.push(`${d.type()}: ${d.message().slice(0, 80)}`);
    if (d.type() === 'prompt') await d.accept(dialogs.prompt || '');
    else if (d.type() === 'confirm' && dialogs.confirm === false) await d.dismiss();
    else await d.accept();
  });
  await page.evaluateOnNewDocument(() => {
    window.print = () => { window.__printed = (window.__printed || 0) + 1; };
    // Downloads (backup files, CSV) are recorded instead of saved.
    const orig = URL.createObjectURL;
    window.__downloads = [];
    HTMLAnchorElement.prototype.click = function () { if (this.download) window.__downloads.push(this.download); };
    URL.createObjectURL = b => orig.call(URL, b);
  });
  // The welcome tour (first custodian sign-in) would cover the screen in every suite; only
  // suites that test it pass { tour: true }.
  if (!tour) await page.evaluateOnNewDocument(() => { try { if (!localStorage.getItem('cp_welcome_tour_v1')) localStorage.setItem('cp_welcome_tour_v1', 'test'); } catch (e) {} });
  page.dialogs = dialogs;
  return page;
}

// Simulated loss of signal: the stand-in queues writes, and navigator.onLine follows.
export async function setOffline(page, offline) {
  await page.evaluate(o => { window.__fakeOffline = o; }, offline);
  await page.setOfflineMode(offline);
}

export async function closeAll() {
  for (const b of browsers) await b.close().catch(() => {});
}

export function summary(name) {
  out(`errors ${JSON.stringify(errors)}`);
  check(errors.length === 0, 'no errors on any phone');
  out(`${name}: ${failures ? `${failures} FAILED` : 'all passed'}`);
}
