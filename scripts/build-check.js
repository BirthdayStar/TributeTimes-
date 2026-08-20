const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requiredFiles = [
  'public/index.html',
  'public/form-template.html',
  'public/manifest.webmanifest',
  'public/pwa.css',
  'public/pwa.js',
  'public/service-worker.js',
  'public/offline.html',
  'public/icons/favicon.svg',
  'public/icons/favicon-16.png',
  'public/icons/favicon-32.png',
  'public/icons/icon-180.png',
  'public/icons/icon-192.png',
  'public/icons/icon-512.png',
  'public/icons/icon-512-maskable.png',
  'public/screenshots/home-mobile.png',
  'public/screenshots/home-desktop.png'
];

const failures = [];

requiredFiles.forEach((relativePath) => {
  const absolutePath = path.join(root, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required file: ${relativePath}`);
  }
});

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

if (failures.length === 0) {
  const manifest = JSON.parse(read('public/manifest.webmanifest'));
  if (!Array.isArray(manifest.icons) || manifest.icons.length < 3) {
    failures.push('Manifest should define install icons.');
  }
  if (!Array.isArray(manifest.screenshots) || manifest.screenshots.length < 2) {
    failures.push('Manifest should define screenshots.');
  }

  const indexHtml = read('public/index.html');
  const formTemplate = read('public/form-template.html');
  [
    ['public/index.html', indexHtml],
    ['public/form-template.html', formTemplate]
  ].forEach(([label, html]) => {
    if (!html.includes('/manifest.webmanifest')) failures.push(`${label} is missing the manifest link.`);
    if (!html.includes('/pwa.css')) failures.push(`${label} is missing the PWA stylesheet.`);
    if (!html.includes('/pwa.js')) failures.push(`${label} is missing the PWA bootstrap script.`);
  });
}

if (failures.length) {
  failures.forEach((failure) => console.error(`BUILD CHECK FAILED: ${failure}`));
  process.exit(1);
}

console.log('Build check passed: required PWA assets and HTML hooks are present.');
