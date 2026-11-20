import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { check } from './check.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
await check();
await rm(resolve(root, 'build/site'), { recursive: true, force: true });
await mkdir(resolve(root, 'build'), { recursive: true });
// Copy this explicit public folder only. Never copy the repository or environment.
await cp(resolve(root, 'site'), resolve(root, 'build/site'), { recursive: true });
console.log('Built public files in build/site. No environment variables are included.');
