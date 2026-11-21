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
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
WRANGLER = 'wrangler@4.166.0'

def main():
    print('\nAlongside — private Luna setup\n')
    print('This sets up a fictional competition demo, not a patient treatment service.')
    print('Cloudflare hosts the private server. OpenAI usage has its own charges.')
    print('The demo starts with limits of 60 requests/day and 500/month.')
    print('Use provider accounts that your parent or guardian helps manage.\n')
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

    print('1. Sign in to Cloudflare in the browser when it opens. No key is requested there.\n')
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
    with urllib.request.urlopen(api_base + '/status', timeout=20) as response:
        health = json.load(response)
    if health.get('ready') is not True:
        raise RuntimeError('The private server is not ready. Keep the website in library mode and ask Codex to check it.')
    (ROOT / 'site/config.json').write_text(json.dumps({'apiBase': api_base}, indent=2) + '\n')
    print('\nThe private server is ready. Save these two codes somewhere private:')
    print('\nCompetition access code — share with your judges:\n' + demo_code)
    print('\nPublisher code — keep for yourself; it selects the demos judges can see:\n' + publisher_code)
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
