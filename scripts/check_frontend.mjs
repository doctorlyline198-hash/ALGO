import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { spawn } from 'node:child_process';
import process from 'node:process';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.resolve(rootDir, '../client');
const clientNodeModules = path.join(clientDir, 'node_modules');
const playwrightModule = pathToFileURL(path.join(clientNodeModules, '@playwright/test', 'index.mjs')).href;

const { chromium } = await import(playwrightModule);

const url = process.argv[2] ?? 'http://127.0.0.1:4173';

function startDevServer() {
  return new Promise((resolve, reject) => {
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    const serverProcess = spawn(npmCommand, ['run', 'dev', '--', '--host', '--port', '4173', '--strictPort'], {
      cwd: clientDir,
      shell: process.platform === 'win32',
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const onData = (data) => {
      const text = data.toString();
      process.stdout.write(`[dev] ${text}`);
      if (/ready in/.test(text)) {
        serverProcess.stdout.off('data', onData);
        resolve(serverProcess);
      }
    };

    serverProcess.stdout.on('data', onData);
    serverProcess.stderr.on('data', (data) => process.stderr.write(`[dev:err] ${data}`));

    serverProcess.on('exit', (code) => {
      reject(new Error(`Dev server exited early with code ${code}`));
    });
  });
}

const server = await startDevServer();

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', async (msg) => {
  const args = await Promise.all(msg.args().map((arg) => arg.jsonValue().catch(() => arg.toString())));
  console.log(`[console:${msg.type()}]`, ...args);
});

try {
  const response = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  console.log('HTTP status', response?.status());
  const title = await page.title();
  console.log('Page title:', title);
  const rootContent = await page.locator('#root').innerHTML();
  console.log('Root innerHTML length:', rootContent.length);
  if (rootContent.trim().length === 0) {
    console.warn('Root node is empty. Capturing screenshot to scripts/check-frontend.png');
    await page.screenshot({ path: path.join(rootDir, 'check-frontend.png'), fullPage: true });
  }
} catch (error) {
  console.error('Failed to load page:', error);
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
