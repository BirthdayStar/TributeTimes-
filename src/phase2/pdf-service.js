'use strict';

const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const DEFAULT_BROWSER_CANDIDATES = [
  process.env.PDF_BROWSER_PATH,
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  // Found 11 Aug 2026: this list was Windows-only, so on the actual
  // Linux production server it never finds anything, leaving Playwright
  // to fall back to its own bundled Chromium (see render.yaml for the
  // real fix — ensuring that bundled browser is actually downloaded).
  // These are purely an additional, defensive fallback in case a system
  // browser is ever available on the server through some other means;
  // they don't change anything about the existing Windows-path behaviour.
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

async function findBrowserExecutable() {
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

async function fitNewspaperToSingleA4Page(page) {
  await page.setViewportSize(A4_PORTRAIT_PX);

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

  const browserPath = await findBrowserExecutable();
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

  const browser = await chromium.launch({
    ...(browserPath ? { executablePath: browserPath } : {}),
    headless: true,
    timeout: 0,
    args: [
      '--no-first-run',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--allow-file-access-from-files',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.route('**/*', route => {
      const resourceUrl = route.request().url();
      if (resourceUrl.startsWith('http://') || resourceUrl.startsWith('https://')) {
        route.abort().catch(() => {});
        return;
      }
      route.continue().catch(() => {});
    });
    await page.setContent(finalHtml, { waitUntil: 'load', timeout: 0 });
    const fit = await fitNewspaperToSingleA4Page(page);

    const pdfBuffer = await page.pdf({
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
