"""Retire only the exact owner QA workflow/ref; main is read-only."""
import json, os, time, urllib.error, urllib.parse, urllib.request
from pathlib import Path
repository = 'alvarovillalbaa/forway'
branch = 'qa/forway-site-analysis-v2-20261115'
main_sha = 'f9ec9a35c6f05e579d95fc155f430f2a56debbf1'
workflow = '.github/workflows/site-analysis-v2.yml'
token = os.environ['FORWAY_RETIRE_TOKEN']
output = Path(os.environ['FORWAY_RETIRE_OUTPUT'])
output.mkdir(exist_ok=False)
receipt = {'main': main_sha, 'qaBefore': os.environ['GITHUB_SHA'], 'passed': False, 'requests': []}
deadline = time.monotonic() + 120
def request(method, path, body=None):
    remaining = deadline - time.monotonic()
    if remaining <= 2:
        raise RuntimeError('Retirement deadline')
    req = urllib.request.Request('https://api.github.com/repos/' + repository + path,
        data=json.dumps(body).encode() if body is not None else None, method=method,
        headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json', 'User-Agent': 'forway-owned-retirement'})
    try:
        with urllib.request.urlopen(req, timeout=min(10, remaining - 1)) as response:
            value = response.read(2 * 1024**2)
            receipt['requests'].append({'method': method, 'path': path, 'status': response.status})
            return response.status, json.loads(value) if value else None
    except urllib.error.HTTPError as error:
        receipt['requests'].append({'method': method, 'path': path, 'status': error.code})
        if error.code == 404:
            return 404, None
        raise RuntimeError('Owned retirement returned HTTP' + str(error.code)) from None
try:
    if os.environ.get('GITHUB_REPOSITORY') != repository or os.environ.get('GITHUB_REF_NAME') != branch:
        raise RuntimeError('Wrong retirement owner/ref')
    code, main = request('GET', '/git/ref/heads/main')
    if code != 200 or main['object']['sha'] != main_sha:
        raise RuntimeError('Main changed before retirement')
    code, qa = request('GET', '/git/ref/heads/' + branch)
    if code != 200 or qa['object']['sha'] != receipt['qaBefore']:
        raise RuntimeError('Owned temporary head changed')
    code, active = request('GET', '/contents/' + workflow + '?ref=main')
    if code != 404:
        raise RuntimeError('Temporary workflow unexpectedly exists on main')
    code, file = request('GET', '/contents/' + workflow + '?ref=' + urllib.parse.quote(branch, safe=''))
    if code != 200:
        raise RuntimeError('Owned temporary workflow missing')
    code, deleted = request('DELETE', '/contents/' + workflow, {'branch': branch, 'sha': file['sha'], 'message': 'chore: retire the completed site analysis V2 temporary workflow'})
    if code != 200:
        raise RuntimeError('Workflow removal not acknowledged')
    retired = deleted['commit']['sha']
    receipt['retiredCommit'] = retired
    code, qa = request('GET', '/git/ref/heads/' + branch)
    if code != 200 or qa['object']['sha'] != retired:
        raise RuntimeError('Owned temporary head changed after removal')
    code, active = request('GET', '/contents/' + workflow + '?ref=' + urllib.parse.quote(branch, safe=''))
    if code != 404:
        raise RuntimeError('Temporary workflow remains reachable')
    code, qa = request('GET', '/git/ref/heads/' + branch)
    if code != 200 or qa['object']['sha'] != retired:
        raise RuntimeError('Owned temporary ref changed before deletion')
    code, ignored = request('DELETE', '/git/refs/heads/' + branch)
    if code != 204:
        raise RuntimeError('Temporary ref deletion did not acknowledge204')
    code, ignored = request('GET', '/git/ref/heads/' + branch)
    if code != 404:
        raise RuntimeError('Temporary ref remains reachable')
    code, main = request('GET', '/git/ref/heads/main')
    if code != 200 or main['object']['sha'] != main_sha:
        raise RuntimeError('Main changed during retirement')
    receipt.update(passed=True, workflowAbsent=True, qaDeleted=True, mainUnchanged=True,
        deleteSemantics='serialized exact owner reads; GitHub DELETE ref is not atomic CAS')
except Exception as error:
    receipt['error'] = str(error)
finally:
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2))
    print('FORWAY_V2_RETIREMENT ' + json.dumps(receipt), flush=True)
if not receipt['passed']:
    raise SystemExit(1)
