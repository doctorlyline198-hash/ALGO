#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const result = spawnSync('npm', ['run', 'test'], {
  cwd: path.join(__dirname, '..', 'client'),
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

if (result.error) {
  console.error(result.error);
}

process.exit(result.status ?? 1);
