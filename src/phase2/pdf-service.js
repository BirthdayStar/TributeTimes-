'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const puppeteer = require('puppeteer-core');

// Switched from Playwright to puppeteer-core + @sparticuz/chromium, 11 Aug
// 2026. Root cause of the switch: Playwright needs a separate browser
// download during the build (`npx playwright install ...`), and on
// Render's free-tier build resources that download reliably hung for
// 20+ minutes, twice, even after narrowing it down to just the smaller
// "headless shell" target — a real, repeatable platform limitation, not
// a one-off fluke. @sparticuz/chromium ships its Chromium build already
// inside the npm package itself (pre-compressed, ~65MB), so it comes down
// as part of the normal `npm install` that has worked reliably in every
// build log we've seen — no separate download step, nothing to hang on.
const DEFAULT_BROWSER_CANDIDATES = [
  process.env.PDF_BROWSER_PATH,
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean);

const A4_PORTRAIT_PX = {
  width: Math.round((210 / 25.4) * 96),
  height: Math.round((297 / 25.4) * 96),
};

function sanitizeFilenamePart(value) {
  return String(value || 'keepsake')
    .replace(/[^a-z0-9\-_.]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'keepsake';
}

async function findSystemBrowserExecutable() {
  for (const candidate of DEFAULT_BROWSER_CANDIDATES) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  return null;
}

// Prefers a real system browser when one is actually present (local dev
// on Windows, or any host that happens to have Chrome/Chromium already
// installed) — unchanged behaviour from before. Falls back to
// @sparticuz/chromium's bundled build otherwise, which is the expected,
// reliable path on Render. @sparticuz/chromium's binary is Linux-only, so
// this fallback is only ever reached on a Linux host with no system
// browser — exactly the production case it's meant for.
async function resolveBrowserLaunchOptions() {
  const systemPath = await findSystemBrowserExecutable();
  if (systemPath) {
    return {
      executablePath: systemPath,
      args: [],
      source: 'system',
    };
  }

  // @sparticuz/chromium ships as an ESM module — required via CommonJS
  // require() like this, its real API lands under `.default`, not on the
  // top-level object itself (confirmed directly: the bare require() only
  // exposes `__esModule`/`default`/`inflate`/`setupLambdaEnvironment`,
  // which is exactly why `chromium.executablePath` came back as "not a
  // function" the first time — it genuinely wasn't there yet).
  const chromium = require('@sparticuz/chromium').default;
  return {
    executablePath: await chromium.executablePath(),
    args: chromium.args,
    source: '@sparticuz/chromium',
  };
}

function ensurePdfHtml(html) {
  const printableCss = `
    <style id="phase2-pdf-overrides">
      @page { size: A4 portrait; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
      html { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    </style>
  `;

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, match => `${match}\n${printableCss}`);
  }

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>${printableCss}</head><body>${html}</body></html>`;
}

// Same fitting logic as before, verbatim — only the two Playwright-only
// API calls around it (setViewportSize) changed to their puppeteer-core
// equivalents (setViewport) at the call site below. This function itself
// is engine-agnostic (just DOM/page.evaluate work).
async function fitNewspaperToSingleA4Page(page) {
  await page.setViewport(A4_PORTRAIT_PX);

  return page.evaluate(({ width, height }) => {
    const target = document.getElementById('star') || document.body;
    const wrap = document.getElementById('wrap') || document.body;
    const sheet = document.querySelector('.sheet');

    target.style.transform = 'none';
    target.style.zoom = '1';
    // The .sheet element carries its own 10mm top/bottom margin (a
    // screen-preview affordance for centering the page on the grey
    // background). Zeroing #star's own margin here did nothing, since
    // #star never had a margin — the real 10mm lived on its child. That
    // left every PDF measured ~20mm taller than the actual page content,
    // triggering an unnecessary vertical squish via scaleY below.
    if (sheet) {
      sheet.style.margin = '0';
    }

    const rect = target.getBoundingClientRect();
    const availableWidth = width;
    const availableHeight = height;
    const scaleY = rect.height > availableHeight ? (availableHeight / rect.height) : 1;

    const existing = document.getElementById('phase2-pdf-single-page-fit');
    if (existing) existing.remove();

    const style = document.createElement('style');
    style.id = 'phase2-pdf-single-page-fit';
    style.textContent = `
      @page { size: A4 portrait; margin: 0; }
      html, body {
        width: ${width}px !important;
        height: ${height}px !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
        background: #ffffff !important;
      }
      body {
        display: block !important;
      }
      #wrap {
        width: ${width}px !important;
        height: ${height}px !important;
        overflow: hidden !important;
        display: flex !important;
        justify-content: center !important;
        align-items: flex-start !important;
      }
      #star {
        width: 210mm !important;
        max-width: none !important;
        box-shadow: none !important;
        transform: scale(1, ${scaleY}) !important;
        transform-origin: top center !important;
        margin: 0 auto !important;
      }
    `;
    document.head.appendChild(style);

    wrap.style.width = `${width}px`;
    wrap.style.height = `${height}px`;
    wrap.style.overflow = 'hidden';
    target.style.zoom = '1';
    target.style.transform = `scale(1, ${scaleY})`;
    target.style.transformOrigin = 'top center';

    const fittedRect = target.getBoundingClientRect();
    return {
      scale: scaleY,
      before: { width: rect.width, height: rect.height },
      after: { width: fittedRect.width, height: fittedRect.height },
      page: { width, height },
    };
  }, A4_PORTRAIT_PX);
}

async function generatePdfFromHtml({ html, fileStem = 'tribute-times-keepsake', keepArtifacts = false }) {
  if (!html || !String(html).trim()) {
    throw new Error('Printable keepsake HTML is required to generate a PDF.');
  }

  const { executablePath: browserPath, args: engineArgs } = await resolveBrowserLaunchOptions();
  const artifactId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const safeStem = sanitizeFilenamePart(fileStem);
  const tempDir = path.join(os.tmpdir(), 'tribute-times-phase2-pdf');
  const htmlFilePath = path.join(tempDir, `${safeStem}-${artifactId}.html`);
  const pdfFilePath = path.join(tempDir, `${safeStem}-${artifactId}.pdf`);
  const finalHtml = ensurePdfHtml(String(html));

  await fs.mkdir(tempDir, { recursive: true });

  if (keepArtifacts) {
    await fs.writeFile(htmlFilePath, finalHtml, 'utf8');
  }

  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    args: [
      ...engineArgs,
      '--no-first-run',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--allow-file-access-from-files',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.emulateMediaType('print');
    // Same network-blocking intent as the old Playwright `page.route`
    // guard (this HTML is fully self-contained — fonts/images are
    // inlined as data URIs — so any http(s) request here would only ever
    // be an unexpected external call, not a real asset the page needs).
    await page.setRequestInterception(true);
    page.on('request', req => {
      const resourceUrl = req.url();
      if (resourceUrl.startsWith('http://') || resourceUrl.startsWith('https://')) {
        req.abort().catch(() => {});
        return;
      }
      req.continue().catch(() => {});
    });
    await page.setContent(finalHtml, { waitUntil: 'load', timeout: 0 });
    const fit = await fitNewspaperToSingleA4Page(page);

    // This puppeteer-core version returns a plain Uint8Array here, not a
    // Node Buffer (Playwright's page.pdf() returned a real Buffer, which
    // is why this wasn't needed before the switch). Express's res.send()
    // only sends raw binary for an actual Buffer instance — anything else
    // falls through to its JSON-body path, which is exactly what
    // happened here first: the "PDF" download came back as a byte-index
    // JSON object instead of a real file. Wrapping it fixes that at the
    // source, once, rather than in every caller.
    const rawPdfOutput = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      timeout: 0,
      margin: {
        top: '0',
        right: '0',
        bottom: '0',
        left: '0',
      },
    });
    const pdfBuffer = Buffer.from(rawPdfOutput);

    await fs.writeFile(pdfFilePath, pdfBuffer);

    return {
      pdfBuffer,
      pdfFilePath,
      htmlFilePath: keepArtifacts ? htmlFilePath : null,
      browserPath,
      fit,
    };
  } finally {
    await browser.close();

    await Promise.allSettled([
      keepArtifacts ? Promise.resolve() : fs.rm(pdfFilePath, { force: true }),
      keepArtifacts ? Promise.resolve() : fs.rm(htmlFilePath, { force: true }),
    ]);
  }
}

module.exports = {
  generatePdfFromHtml,
  sanitizeFilenamePart,
};
