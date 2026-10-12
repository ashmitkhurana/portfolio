#!/usr/bin/env node

import { chromium } from 'playwright';
import { promises as fs } from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:4300';
const OUTPUT_DIR = './docs/skeleton/qa';

// Viewport configurations: [width, height, dpr]
const viewports = [
  { name: 'phone', width: 390, height: 844, dpr: 2 },
  { name: 'desktop', width: 1512, height: 982, dpr: 2 },
];

// Section selectors
const sections = [
  { id: 'hero' },
  { id: 'unravel' },
  { id: 'work' },
  { id: 'build' },
  { id: 'terminal' },
  { id: 'contact' },
];

// Pages to screenshot
const pages = [
  { path: '/work', name: 'work' },
  { path: '/work/alpha-block', name: 'work-alpha-block' },
  { path: '/about', name: 'about' },
];

async function ensureOutputDir() {
  try {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
  } catch (err) {
    console.error(`Failed to create output directory: ${err.message}`);
  }
}

async function waitForFonts(page) {
  try {
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1500);
  } catch (err) {
    console.warn('Font loading check failed (continuing anyway):', err.message);
  }
}

async function getSectionSelector(page, section) {
  // Try to find the section by ID first
  const idSelector = `#${section.id}`;
  const hasId = await page.$(idSelector).catch(() => null);
  if (hasId) return idSelector;

  // Fall back to data-section attribute
  const dataSelector = `[data-section="${section.id}"]`;
  const hasData = await page.$(dataSelector).catch(() => null);
  if (hasData) return dataSelector;

  // Return the ID selector as default (may not exist)
  return idSelector;
}

async function captureSection(page, section, viewportName) {
  const selector = await getSectionSelector(page, section);

  try {
    const element = await page.$(selector);
    if (!element) {
      console.warn(`  Section ${section.id}: selector "${selector}" not found, skipping`);
      return false;
    }

    // Scroll into view
    await element.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);

    const filename = `${OUTPUT_DIR}/${viewportName}-${section.id}.png`;
    await element.screenshot({ path: filename });
    console.log(`  ✓ ${viewportName}-${section.id}.png`);
    return true;
  } catch (err) {
    console.warn(`  Section ${section.id}: ${err.message}`);
    return false;
  }
}

async function capturePage(page, pageConfig, viewportName) {
  try {
    await page.goto(`${BASE_URL}${pageConfig.path}`, { waitUntil: 'networkidle' });
    await waitForFonts(page);

    const filename = `${OUTPUT_DIR}/${viewportName}-page-${pageConfig.name}.png`;
    await page.screenshot({ path: filename, fullPage: true });
    console.log(`  ✓ ${viewportName}-page-${pageConfig.name}.png`);
  } catch (err) {
    console.error(`  Page ${pageConfig.path}: ${err.message}`);
  }
}

async function captureViewport(browser, viewport) {
  console.log(`\n=== ${viewport.name} (${viewport.width}x${viewport.height}, DPR ${viewport.dpr}) ===`);

  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr,
  });

  const page = await context.newPage();
  const consoleErrors = [];

  // Log console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
      console.warn(`  Console error: ${msg.text()}`);
    }
  });

  page.on('pageerror', (err) => {
    consoleErrors.push(err.toString());
    console.warn(`  Page error: ${err.message}`);
  });

  try {
    // Load home with ribbon=0
    console.log('\nCapturing sections...');
    await page.goto(`${BASE_URL}/?ribbon=0`, { waitUntil: 'networkidle' });
    await waitForFonts(page);

    // Capture each section
    for (const section of sections) {
      await captureSection(page, section, viewport.name);
    }

    // Full-page screenshot
    const fullPageFilename = `${OUTPUT_DIR}/${viewport.name}-full.png`;
    await page.screenshot({ path: fullPageFilename, fullPage: true });
    console.log(`  ✓ ${viewport.name}-full.png`);

    // Capture pages
    console.log('\nCapturing pages...');
    for (const pageConfig of pages) {
      await capturePage(page, pageConfig, viewport.name);
    }

    if (consoleErrors.length > 0) {
      console.log(`\n${consoleErrors.length} console error(s) logged for ${viewport.name}`);
    }
  } catch (err) {
    console.error(`Error during ${viewport.name} capture: ${err.message}`);
  } finally {
    await context.close();
  }
}

async function main() {
  console.log('Starting QA screenshot capture...\n');

  await ensureOutputDir();

  const browser = await chromium.launch({ headless: true });

  try {
    for (const viewport of viewports) {
      await captureViewport(browser, viewport);
    }

    console.log(`\n✓ Screenshots saved to ${OUTPUT_DIR}`);
  } catch (err) {
    console.error(`Fatal error: ${err.message}`);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

main();
