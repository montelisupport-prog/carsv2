// Browser regression check for the studio layout. Image generation is mocked;
// no paid requests or production projects are created.
// Install Playwright + WebKit to run: npm install --no-save playwright
// npx playwright install --with-deps webkit
// node tests/mobile-layout.test.mjs
// PLAYWRIGHT_MODULE can point to an already installed Playwright module.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const { webkit, devices } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const image = `data:image/png;base64,${(await readFile(path.join(publicDir, 'assets/demo-exterior.png'))).toString('base64')}`;
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname;
  if (pathname === '/api/health') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ aiConfigured: true }));
  }
  if (pathname === '/api/generate') {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ ok: true, image, originalImage: image, generatedReference: true }));
  }
  try {
    const file = path.resolve(publicDir, '.' + (pathname === '/' ? '/index.html' : pathname));
    assert(file.startsWith(publicDir));
    const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.png': 'image/png', '.jpeg': 'image/jpeg' };
    res.setHeader('content-type', types[path.extname(file)] || 'application/octet-stream');
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await webkit.launch({ headless: true });
const errors = [];

async function expectStudioLayout(page, mobile = true) {
  const geometry = await page.evaluate(() => {
    const rect = selector => document.querySelector(selector).getBoundingClientRect().toJSON();
    return {
      editorInShell: Boolean(document.querySelector('.app-shell > main > #editor')),
      dashboardInShell: Boolean(document.querySelector('.app-shell > main > #dashboard')),
      actionAtRoot: document.querySelector('#studioActions').parentElement === document.body,
      header: rect('.topbar'), image: rect('#imageCanvas'), build: rect('#customizationCard'),
      concepts: rect('#resultPanel'), actions: rect('#studioActions'), height: innerHeight,
      width: innerWidth, contentWidth: document.documentElement.scrollWidth,
      tabs: rect('.service-tabs'), swatches: rect('#colorViewport'),
    };
  });
  assert(geometry.editorInShell && geometry.dashboardInShell, 'Both screens must remain inside the app shell');
  assert(geometry.actionAtRoot, 'The action bar must not inherit a card scrolling/containing block');
  assert(Math.abs(geometry.actions.bottom - geometry.height) <= 1, 'Build actions must touch the viewport bottom');
  assert(geometry.contentWidth <= geometry.width, 'Studio must not overflow horizontally');
  assert(geometry.image.top - geometry.header.bottom <= (mobile ? 2 : 64), 'No empty screen above the vehicle');
  if (mobile) {
    assert(geometry.build.top >= geometry.image.bottom, 'Build controls follow the vehicle');
    assert(geometry.concepts.top >= geometry.build.bottom, 'Concepts follow the build controls');
    assert(geometry.tabs.bottom < geometry.actions.top, 'Service tabs are visible above the fold');
    assert(geometry.swatches.top < geometry.actions.top, 'Wrap choices begin above the fold');
  }
  return geometry;
}

try {
  const page = await browser.newPage({ ...devices['iPhone 13'], deviceScaleFactor: 1, viewport: { width: 390, height: 750 } });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(origin);
  await page.waitForFunction(() => document.querySelector('#newProject').onclick && typeof db !== 'undefined' && db);
  assert.equal(await page.locator('#studioActions').isVisible(), false);
  assert.equal(await page.locator('.home-hero').evaluate(e => e.getBoundingClientRect().height), 455);

  // Enter the studio through the real two-step setup, including the optional-photo step.
  await page.locator('#newProject').click();
  await page.locator('#projectTitle').fill('Layout regression');
  await page.locator('#year').fill('2024');
  await page.locator('#make').fill('Audi');
  await page.locator('#model').fill('RS7');
  await page.locator('#wizardNextDetails').click();
  assert.equal(await page.locator('#studioActions').isVisible(), false);
  await page.locator('#wizardContinue').click();
  await page.waitForFunction(() => {
    const img = document.querySelector('#originalImage');
    return !img.classList.contains('hidden') && img.complete && img.naturalWidth > 0;
  });
  assert.equal(await page.locator('#compareRange').isVisible(), false, 'Comparison only appears after generating a concept');
  assert.equal(await page.locator('#conceptEmpty').isVisible(), true);
  await expectStudioLayout(page);

  // Create two mocked concepts through the real review flow, then compare them.
  await page.locator('#wrapToggle [data-value="wrap"]').click();
  for (let n = 0; n < 2; n++) {
    await page.locator('#reviewBuild').click();
    await page.locator('#confirmGenerate').click();
    await page.waitForFunction(n => document.querySelectorAll('#conceptStrip .concept-tile').length === n + 1, n);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await expectStudioLayout(page);
  assert.equal(await page.locator('#compareRange').isVisible(), true);
  const sizes = await page.locator('#imageCanvas > img').evaluateAll(images => images.map(img => ({ width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height, fit: getComputedStyle(img).objectFit })));
  assert.deepEqual(sizes[0], sizes[1], 'Before and after share the same image frame and fit');
  await page.locator('#compareBuildsResults').click();
  await page.locator('.compare-choice').nth(0).click();
  await page.locator('.compare-choice').nth(1).click();
  await page.locator('#compareProceed').click();
  assert.equal(await page.locator('#compareStage').isVisible(), true);
  await page.locator('#buildCompareRange').fill('75');
  assert.match(await page.locator('#compareBuildAfter').getAttribute('style'), /25%/);
  await page.locator('#closeBuildCompare').click();

  // Real scroll/resize checks at short and tall mobile viewports (Safari engine).
  for (const viewport of [{ width: 375, height: 667 }, { width: 390, height: 750 }, { width: 430, height: 820 }, { width: 390, height: 600 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => scrollTo(0, 0));
    const layout = await expectStudioLayout(page);
    for (const y of [350, 850, 1400, 0]) {
      await page.evaluate(y => scrollTo(0, y), y);
      const bottom = await page.locator('#studioActions').evaluate(e => e.getBoundingClientRect().bottom);
      assert(Math.abs(bottom - viewport.height) <= 1, `Action bar drifted at ${viewport.width}×${viewport.height}, scroll ${y}`);
    }
    console.log(`PASS ${viewport.width}×${viewport.height}: car starts at ${layout.image.top}px; build bar at ${layout.actions.bottom}px`);
  }

  // Changing service tabs must keep the car and the page in place.
  for (const service of ['tint', 'calipers', 'wrap']) {
    await page.locator(`[data-service-tab="${service}"]`).click();
    await page.evaluate(() => new Promise(requestAnimationFrame));
    assert.equal(await page.evaluate(() => scrollY), 0);
  }
  await page.locator('#topProjects').click();
  await page.locator('#dashboard').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#studioActions').isVisible(), false);
  assert.equal(await page.locator('.home-hero').evaluate(e => e.getBoundingClientRect().height), 455);
  await page.locator('.open-project').first().click();
  await page.locator('#editor').waitFor({ state: 'visible' });
  await expectStudioLayout(page);
  assert.equal(await page.locator('#conceptStrip .concept-tile').count(), 2, 'Saved concepts survive reopening');

  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  desktop.on('pageerror', e => errors.push(e.message));
  await desktop.goto(origin);
  await desktop.waitForFunction(() => typeof db !== 'undefined' && db && document.querySelector('#newProject').onclick);
  await desktop.evaluate(image => {
    project = defaultProject();
    Object.assign(project, { year: '2024', make: 'Audi', model: 'RS7', generatedRefs: { front34: image } });
    moveWizardCardsToEditor();setupEditor();switchView('editor');
  }, image);
  await expectStudioLayout(desktop, false);
  assert.deepEqual(errors, [], 'No page errors during setup, generation, comparison, or navigation');
  console.log('PASS setup, saved concepts, comparison slider, navigation, and desktop layout');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
