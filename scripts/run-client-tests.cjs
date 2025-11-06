#!/usr/bin/env node
const { spawn } = require('child_process');

// Execute the client test script without inheriting lint-staged file arguments.
const child = spawn(
  'npm',
  ['--prefix', 'client', 'run', 'test'],
  {
    stdio: 'inherit',
    shell: true,
  }
);

child.on('exit', (code) => {
  process.exit(code === undefined ? 1 : code);
});
