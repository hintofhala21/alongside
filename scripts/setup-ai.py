#!/usr/bin/env python3
"""Guided competition-demo setup. Real secrets are read privately, never written to source."""
import getpass
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
from check_connection import check_connection

ROOT = Path(__file__).resolve().parent.parent
WRANGLER = 'wrangler@4.166.0'

def main():
    print('\nAlongside — private Luna setup\n')
    print('This sets up a fictional competition demo, not a patient treatment service.')
    print('Cloudflare hosts the private server. OpenAI usage has its own charges.')
    print('The demo starts with limits of 60 requests/day and 500/month.')
    print('Use provider accounts that your parent or guardian helps manage.\n')
    if not sys.stdin.isatty():
        raise RuntimeError('Open START-HERE.command in your own Terminal window.')
    node = shutil.which('node')
    bundled = Path('/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node')
    if not node and bundled.exists():
        node = str(bundled)
    if not node:
        print('First install Node 24 LTS from https://nodejs.org, then run this setup again.')
        return 1
    env = dict(os.environ)
    env['PATH'] = str(Path(node).parent) + os.pathsep + env.get('PATH', '')
    env['WRANGLER_SEND_METRICS'] = 'false'
    env['COREPACK_ENABLE_DOWNLOAD_PROMPT'] = '0'
    env['COREPACK_ENABLE_AUTO_PIN'] = '0'
    env['COREPACK_HOME'] = str(ROOT / '.setup-tools/corepack')
    env['npm_config_cache'] = str(ROOT / '.setup-tools/npm-cache')
    npx = shutil.which('npx', path=env['PATH'])
    corepack = bundled.parent.parent / 'lib/node_modules/corepack/dist/npx.js'
    if npx:
        launcher = [npx]
    elif corepack.exists():
        launcher = [node, str(corepack)]
    else:
        print('Please install Node 24 LTS from https://nodejs.org; it includes the setup tool.')
        return 1

    def wrangler(*args, hidden_input=None, capture=False):
        command = launcher + ['--yes', '--package=' + WRANGLER, 'wrangler'] + list(args)
        result = subprocess.run(command, cwd=ROOT, env=env, text=True,
                                input=hidden_input, capture_output=capture or hidden_input is not None)
        if result.returncode:
            # Never print captured output from a secret-upload command.
            if hidden_input is None and capture:
                print(result.stdout)
                print(result.stderr)
            raise RuntimeError('That Cloudflare step did not finish. Your key has not been added to the website files. Run setup again when ready.')
        return result.stdout or ''

    identity = subprocess.run(
        launcher + ['--yes', '--package=' + WRANGLER, 'wrangler', 'whoami', '--json'],
        cwd=ROOT, env=env, text=True, capture_output=True)
    try:
        signed_in = identity.returncode == 0 and json.loads(identity.stdout).get('loggedIn') is True
    except (ValueError, AttributeError):
        signed_in = False
    if signed_in:
        print('1. Cloudflare is already signed in on this Mac.')
    else:
        print('1. Sign in to Cloudflare in the browser when it opens.')
        wrangler('login')
    config_path = ROOT / 'api/wrangler.jsonc'
    config = json.loads(config_path.read_text())
    config['vars']['AI_ENABLED'] = 'false'
    config_path.write_text(json.dumps(config, indent=2) + '\n')
    print('\n2. Preparing the private server. It is still switched off.\n')
    output = wrangler('deploy', '--config', 'api/wrangler.jsonc', capture=True)
    found = re.findall(r'https://alongside-api\.[a-z0-9-]+\.workers\.dev', output)
    if not found:
        raise RuntimeError('Cloudflare did not report the server address. Keep the server disabled and ask Codex to check the deployment.')
    api_base = found[-1]
    print('\n3. Paste your OpenAI key below. Nothing you type will appear on screen.')
    print('It is sent directly to Cloudflare as a secret; it is never saved in the repository.\n')
    api_key = getpass.getpass('OpenAI API key (hidden): ').strip()
    if not api_key.startswith('sk-') or len(api_key) < 25 or any(c.isspace() for c in api_key):
        raise RuntimeError('That does not look like an OpenAI key. Nothing was published to the frontend.')
    demo_code = 'demo-' + secrets.token_urlsafe(18)
    publisher_code = 'publish-' + secrets.token_urlsafe(24)
    for name, value in [('OPENAI_API_KEY', api_key), ('DEMO_ACCESS_CODE', demo_code),
                        ('PUBLISHER_CODE', publisher_code), ('RATE_SALT', secrets.token_urlsafe(32))]:
        wrangler('secret', 'put', name, '--config', 'api/wrangler.jsonc', hidden_input=value + '\n')
        print(name + ' saved privately.')
    api_key = ''
    config['vars']['AI_ENABLED'] = 'true'
    config_path.write_text(json.dumps(config, indent=2) + '\n')
    wrangler('deploy', '--config', 'api/wrangler.jsonc', capture=True)
    print('Save these codes privately before testing the connection.')
    print('Judge invitation (share privately with judges after publishing):')
    print('https://hintofhala21.github.io/alongside/#judge=' + demo_code)
    print('Competition access code: ' + demo_code)
    print('Publisher code (owner only): ' + publisher_code)
    print('Public Worker address: ' + api_base)
    print('Checking one fictional message through the private server. This uses one model request.')
    check_connection(api_base, demo_code)
    public_path = ROOT / 'site/config.json'
    public_settings = json.loads(public_path.read_text())
    public_settings['apiBase'] = api_base
    public_path.write_text(json.dumps(public_settings, indent=2) + '\n')
    print('\nLast step: tell Codex this PUBLIC server address so the website connection can be published:')
    print(api_base)
    print('\nDo not send your OpenAI key. The public address above is enough.')
    print('Your public config file has also been updated automatically.')
    print('In Chat, choose Competition demo, then Fictional scenarios to try it safely.')
    return 0

if __name__ == '__main__':
    try:
        sys.exit(main())
    except (KeyboardInterrupt, EOFError):
        print('\nSetup stopped. No API key was written to website files.')
        sys.exit(1)
    except Exception as error:
        print('\n' + str(error))
        sys.exit(1)
