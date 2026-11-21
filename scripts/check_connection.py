"""Test the public chat server with exactly one fictional model request."""
import argparse
import getpass
import json
import re
import sys
from pathlib import Path
import urllib.error
import urllib.request
import uuid

ORIGIN = 'https://hintofhala21.github.io'

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

def check_connection(base, code, opener=None):
    if not re.fullmatch(r'https://alongside-api\.[a-z0-9-]+\.workers\.dev', base):
        raise ValueError('Use the public Alongside Worker address printed by setup.')
    open_request = opener or urllib.request.build_opener(NoRedirect()).open

    def call(path, body=None, token=None):
        headers = {'Origin': ORIGIN, 'User-Agent': 'Alongside-Connection-Check/1.0'}
        if token:
            headers['Authorization'] = 'Bearer ' + token
        data = None
        if body is not None:
            data = json.dumps(body).encode()
            headers['Content-Type'] = 'application/json'
        request = urllib.request.Request(base + path, data=data, headers=headers)
        try:
            with open_request(request, timeout=30) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            try:
                reason = json.load(error).get('diagnostic')
            except (ValueError, AttributeError):
                reason = None
            hints = {'key_rejected':'OpenAI rejected the key. Check the replacement key.',
                     'access_denied':'Check model access in the OpenAI project.',
                     'model_unavailable':'Check the model name and project access.',
                     'quota_or_rate_limit':'Check API billing, quota and rate limits.',
                     'invalid_reply':'Luna returned an incomplete or unexpected answer.',
                     'timeout':'Luna took too long to reply.'}
            hint = hints.get(reason, 'Check demo access and the Worker configuration.')
            raise RuntimeError(f'{path} failed (HTTP {error.code}). {hint}') from None

    if call('/status').get('ready') is not True:
        raise RuntimeError('The Worker is reachable but its demo configuration is incomplete.')
    print('PASS 1/3  Private server is configured.')
    session = call('/session', {'code':code, 'mode':'synthetic'})
    if not session.get('token') or session.get('mode') != 'synthetic':
        raise RuntimeError('Could not start a fictional demo session.')
    print('PASS 2/3  Competition sign-in works.')
    cid = str(uuid.uuid4())
    result = call('/chat', {'requestId':str(uuid.uuid4()), 'conversationId':cid,
                            'scenario':'support', 'language':'en'}, session['token'])
    reply = result.get('reply') or {}
    version = reply.get('promptVersion','')
    if (result.get('conversationId') != cid or result.get('mode') != 'luna' or
        reply.get('mode') != 'luna' or not reply.get('text') or not re.fullmatch(r'v[0-9]+',version)):
        raise RuntimeError('A verified model reply did not come back.')
    print(f'PASS 3/3  OpenAI answered the fictional message. Prompt {version}.')

if __name__ == '__main__':
    try:
        if not sys.stdin.isatty():
            raise RuntimeError('Open this check in your private Terminal window.')
        parser = argparse.ArgumentParser()
        parser.add_argument('address', nargs='?', help='Public Alongside Worker address')
        parser.add_argument('--save-connection', action='store_true',
                            help='Save the public Worker address after a verified model reply')
        args = parser.parse_args()
        address = args.address or input('Public Alongside Worker address: ').strip()
        check_connection(address, getpass.getpass('Competition access code (hidden): '))
        if args.save_connection:
            path = Path(__file__).resolve().parents[1] / 'site/config.json'
            path.write_text(json.dumps({'apiBase':address}, indent=2) + '\n')
            print('The verified public address is ready to publish.')
    except (OSError, ValueError, RuntimeError, KeyboardInterrupt, EOFError) as error:
        sys.exit(f'Check stopped. {error}')
