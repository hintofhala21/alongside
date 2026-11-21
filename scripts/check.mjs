import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, relative, extname } from 'node:path';
import { validateAccounts } from './account-pages.mjs';
import { Script } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const skipped = new Set(['.git', 'node_modules', '__pycache__', 'build', '.wrangler', 'outputs', '.setup-tools']);
const allowedPublic = new Set(['index.html', 'privacy.html', 'history.html', 'credits.html', 'waicy-conversation.html', '404.html', 'config.json', 'robots.txt', '.nojekyll', 'assets/app.js', 'assets/accounts.js', 'assets/chat.js', 'assets/kids-chat.js', 'assets/history.js', 'assets/styles.css', 'assets/favicon.svg', 'assets/flowers.jpg', 'assets/garden.jpg']);

export function assertNoSecret(contents, name) {
  // Detect common credential formats without printing the value or matching line.
  const patterns = [
    /sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}/,
    /(?:ghp_|github_pat_)[A-Za-z0-9_]{20,}/,
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /"private_key"\s*:\s*"-----BEGIN/,
    /(?:OPENAI_API_KEY|CLOUDFLARE_API_TOKEN)\s*[:=]\s*["']?(?!["']?(?:$|[\s<]|your_|replace_|example|process\.|env\.))[A-Za-z0-9_-]{16,}/m
  ];
  if (patterns.some(pattern => pattern.test(contents))) throw new Error(`Possible secret in ${name}. Remove it before publishing; value withheld.`);
}

async function files(directory) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (skipped.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symbolic link not allowed: ${relative(root, path)}`);
    if (entry.isDirectory()) found.push(...await files(path));
    else found.push(path);
  }
  return found;
}

export async function check() {
  const all = await files(root);
  for (const file of all) {
    const name = relative(root, file);
    if (/(?:^|\/)\.(?:env|dev\.vars)(?:\.|$)|\.(?:pem|key|p12)$/.test(name)) throw new Error(`Secret file found: ${name}. Move it out of this static project.`);
    if (extname(file) === '.jpg') {
      const bytes = await readFile(file);
      if (bytes[0] !== 255 || bytes[1] !== 216 || bytes.length > 500000) throw new Error(`Invalid or oversized photograph: ${name}`);
      if (!allowedPublic.has(name.slice(5))) throw new Error(`Unexpected photograph: ${name}`);
      continue;
    }
    const contents = await readFile(file, 'utf8');
    assertNoSecret(contents, name);
    if (extname(file) === '.js') new Script(contents, { filename: name });
    if (name.startsWith('site/')) {
      const publicName = name.slice(5);
      if (!allowedPublic.has(publicName)) throw new Error(`Unexpected public file: ${publicName}. Review and explicitly allow it.`);
      if (extname(file) === '.html') {
        if (/\son[a-z]+\s*=|\sstyle\s*=|javascript:/i.test(contents)) throw new Error(`Inline execution or styles in ${name}.`);
        if (!contents.includes('Content-Security-Policy')) throw new Error(`Missing security policy in ${name}.`);
        for (const match of contents.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)) {
          if (match[1].includes('application/json')) JSON.parse(match[2]);
          else if (!/src="(?:\.|\/alongside)\/assets\/(?:app|chat|kids-chat|history|library|locales)\.js"/.test(match[1]) || match[2].trim()) throw new Error(`Unexpected executable script in ${name}.`);
        }
      }
    }
  }
  const config = JSON.parse(await readFile(resolve(root, 'site/config.json'), 'utf8'));
  validateAccounts(config.firebase);
  if (Object.keys(config).some(k => !['firebase','apiBase'].includes(k))) throw new Error('Unexpected public configuration field.');
  if (typeof config.apiBase !== 'string') throw new Error('Invalid public API configuration.');
  const library = JSON.parse(await readFile(resolve(root, 'shared/library.json'), 'utf8'));
  if (!library.medicalSources || !library.medicalAnswers) throw new Error('Missing approved information library.');
  console.log('Checks passed: JavaScript, embedded JSON, public-file allowlist and credential scan.');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await check();
