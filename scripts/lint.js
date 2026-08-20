const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const jsFiles = [
  'server.js',
  'tribute-times-ai-prompt.js',
  'tribute-times-renderer.js',
  'tribute-times-server-update.js',
  'public/pwa.js',
  'public/service-worker.js'
].filter((relativePath) => fs.existsSync(path.join(root, relativePath)));

let hasFailure = false;

jsFiles.forEach((relativePath) => {
  const result = spawnSync(process.execPath, ['--check', relativePath], {
    cwd: root,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    hasFailure = true;
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    console.error(`LINT FAILED: ${relativePath}`);
    if (output) console.error(output);
  }
});

try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.webmanifest'), 'utf8'));
  if (!manifest.name || !manifest.short_name || !manifest.start_url) {
    hasFailure = true;
    console.error('LINT FAILED: manifest.webmanifest is missing name, short_name, or start_url.');
  }
} catch (error) {
  hasFailure = true;
  console.error(`LINT FAILED: manifest.webmanifest is invalid JSON. ${error.message}`);
}

if (hasFailure) {
  process.exit(1);
}

console.log('Lint passed: JavaScript syntax and manifest structure look good.');
