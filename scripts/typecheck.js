const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const tsFiles = [];

function walk(directory) {
  fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) return;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(absolutePath);
      return;
    }
    if (/\.(ts|tsx)$/.test(entry.name)) {
      tsFiles.push(path.relative(root, absolutePath));
    }
  });
}

walk(root);

if (tsFiles.length === 0) {
  console.log('Typecheck skipped: no TypeScript source files were found in this project.');
  process.exit(0);
}

const tscPath = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tsc.cmd' : 'tsc');
if (!fs.existsSync(tscPath)) {
  console.error('Typecheck failed: TypeScript files exist, but the TypeScript compiler is not installed.');
  process.exit(1);
}

const result = spawnSync(tscPath, ['--noEmit'], {
  cwd: root,
  encoding: 'utf8',
  shell: process.platform === 'win32'
});

if (result.status !== 0) {
  const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
  if (output) console.error(output);
  process.exit(result.status || 1);
}

console.log('Typecheck passed.');
