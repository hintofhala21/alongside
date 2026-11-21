import io
import json
import sys
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from urllib.error import HTTPError

sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'scripts'))
from check_connection import check_connection

class ConnectionTest(unittest.TestCase):
    def run_check(self, failure=''):
        paths = []
        def mock(request, timeout):
            path = request.full_url.rsplit('/',1)[1]
            paths.append(path)
            body = json.loads(request.data) if request.data else {}
            if path == 'status':
                result = {'ready':failure != 'offline'}
            elif path == 'session':
                self.assertEqual(body['mode'],'synthetic')
                result = {'mode':'synthetic','token':'private-session'}
            else:
                self.assertEqual(request.get_header('Authorization'),'Bearer private-session')
                self.assertEqual(body['scenario'],'support')
                if failure == 'rejected':
                    raise HTTPError(request.full_url,502,'',{},io.BytesIO(b'{"diagnostic":"key_rejected"}'))
                result = {'mode':'luna','conversationId':body['conversationId'],'reply':{'mode':'luna','text':'example','promptVersion':'v4'}}
                if failure == 'library':
                    result['mode']='library'
            return io.BytesIO(json.dumps(result).encode())
        capture = io.StringIO()
        with redirect_stdout(capture):
            check_connection('https://alongside-api.example.workers.dev','private-code',mock)
        self.assertEqual(paths,['status','session','chat'])
        self.assertIn('PASS 3/3',capture.getvalue())
        self.assertNotIn('private-code',capture.getvalue())
        self.assertNotIn('private-session',capture.getvalue())

    def test_success(self):
        self.run_check()
    def test_failures(self):
        for failure,expected in [('offline','incomplete'),('rejected','rejected the key'),('library','verified model reply')]:
            with self.subTest(failure=failure), self.assertRaisesRegex(RuntimeError,expected):
                self.run_check(failure)
