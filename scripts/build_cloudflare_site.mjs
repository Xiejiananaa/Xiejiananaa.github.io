import { copyFile, cp, mkdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const output = path.join(root, '_site');

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, 'assets'), { recursive: true });
await mkdir(path.join(output, 'data'), { recursive: true });

await copyFile(path.join(root, 'index.html'), path.join(output, 'index.html'));
await cp(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
await copyFile(
  path.join(root, 'data', 'dashboard_data.json'),
  path.join(output, 'data', 'dashboard_data.json'),
);

console.log('Cloudflare public artifact prepared at _site');