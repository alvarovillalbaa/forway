"""Owned staged preparation, exact-release observation and bounded hosted proof."""
import base64, gzip, hashlib, json, os, shutil, signal, subprocess, sys, tempfile, time, urllib.request, uuid
from pathlib import Path

repo = Path(__file__).resolve().parents[2]
phase = sys.argv[1]
output = Path(os.environ['FORWAY_ROLLOUT_OUTPUT'])
state_path = Path(os.environ['RUNNER_TEMP']) / 'forway-rollout-v2-state.json'
manifest_path = repo / 'docs/results/2026/11-16/site-analysis-v2-rollout/release-target.json'
sha = lambda value: hashlib.sha256(value).hexdigest()
state = json.loads(state_path.read_text()) if state_path.exists() else None

def save():
    state_path.write_text(json.dumps(state, indent=2))
    state_path.chmod(0o600)

def vector(root, names):
    return [{'path': name, 'mode': oct((root/name).stat().st_mode & 0o777),
             'bytes': (root/name).stat().st_size, 'sha256': sha((root/name).read_bytes())} for name in names]

def absent(pid):
    for _ in range(30):
        try:
            os.killpg(pid, 0)
            time.sleep(.1)
        except ProcessLookupError:
            return True
    return False

def owned_processes(marker):
    found = []
    for path in Path('/proc').glob('[0-9]*/environ'):
        try:
            if path.stat().st_uid == os.getuid() and ('FORWAY_ROLLOUT_OWNER='+marker).encode() in path.read_bytes().split(b'\0'):
                found.append(int(path.parent.name))
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            pass
    return sorted(found)

def environment():
    scratch = Path(state['scratch'])
    return {'PATH': os.environ['PATH'], 'HOME': os.environ['HOME'], 'CI': '1', 'NODE_ENV': 'production',
        'TMPDIR': str(scratch/'tmp'), 'npm_config_cache': str(scratch/'npm-cache'),
        'npm_config_userconfig': str(scratch/'empty.npmrc'), 'npm_config_globalconfig': '/dev/null',
        'PLAYWRIGHT_BROWSERS_PATH': str(scratch/'browsers'), 'FORWAY_ROLLOUT_OWNER': state['nonce'],
        'FORWAY_PLAYWRIGHT_PACKAGE': str(scratch/'playwright/package.json'),
        'FORWAY_HOSTED_OUTPUT': str(output), 'FORWAY_HOSTED_SOURCE': str(scratch/'source'),
        'FORWAY_HOSTED_RELEASE_READS': str(len(state['receipt'].get('releaseProbes', []))),
        'FORWAY_HOSTED_RELEASE_BYTES': str(sum(x.get('bytes', 0) for x in state['receipt'].get('releaseProbes', [])))}

def execute(name, argv, timeout, cwd):
    remaining = int(state['deadline']-time.monotonic()-30)
    if remaining < 1:
        raise RuntimeError('Bounded deadline before '+name)
    started = time.monotonic()
    process = subprocess.Popen(argv, cwd=cwd, env=environment(), stdout=subprocess.PIPE,
        stderr=subprocess.PIPE, start_new_session=True)
    item = {'name': name, 'argv': argv, 'pid': process.pid, 'settled': False, 'groupAbsent': False}
    state['receipt']['commands'].append(item)
    save()
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=min(timeout, remaining))
    except subprocess.TimeoutExpired:
        timed_out = True
        os.killpg(process.pid, signal.SIGTERM)
        try:
            stdout, stderr = process.communicate(timeout=8)
        except subprocess.TimeoutExpired:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate(timeout=5)
    closed = absent(process.pid)
    for suffix, value in [('stdout', stdout), ('stderr', stderr)]:
        (output/(name+'.'+suffix+'.txt')).write_bytes(value)
    item.update(code=process.returncode, seconds=time.monotonic()-started, timedOut=timed_out,
        settled=True, groupAbsent=closed, stdoutBytes=len(stdout), stdoutSha256=sha(stdout),
        stderrBytes=len(stderr), stderrSha256=sha(stderr))
    save()
    print(json.dumps(item), flush=True)
    if process.returncode or timed_out or not closed:
        raise RuntimeError(name+' failed or did not close')

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None

def prepare():
    global state
    if state is not None:
        raise RuntimeError('Do not reuse an owned runner state')
    output.mkdir(exist_ok=False)
    roots = ['public', 'src', 'api', 'scripts', 'tests', 'package.json', 'vercel.json',
             'README.md', 'AGENTS.md', 'docs/spec.md', 'docs/architecture.md', str(manifest_path.relative_to(repo))]
    names = sorted(os.fsdecode(p) for p in subprocess.check_output(['git', 'ls-files', '-z', '--', *roots], cwd=repo).split(b'\0') if p)
    state = {'nonce': uuid.uuid4().hex, 'scratch': None, 'names': names,
        'deadline': time.monotonic()+480, 'sourceBefore': vector(repo, names),
        'receipt': {'passed': False, 'prepared': False, 'commands': [], 'cleanup': False,
            'qualifiedAncestor': '286a88dc32a4d3aca2cd1fb7deb582718d9c54b1', 'oldCasesReplayed': 0}}
    save()
    manifest = json.loads(manifest_path.read_text())
    state['manifest'] = manifest
    for row in manifest['protectedInputs']:
        target = repo/row['path']
        if sha(target.read_bytes()) != row['sha256'] or oct(target.stat().st_mode & 0o777) != row['mode']:
            raise RuntimeError('Closed qualification input changed: '+row['path'])
    if len(manifest['protectedInputs']) != 48:
        raise RuntimeError('Incomplete accepted-source carry')
    config = json.loads((repo/'vercel.json').read_text())
    if config.pop('git', None) != {'deploymentEnabled': False} or config != manifest['productionConfig']:
        raise RuntimeError('QA deployment guard or production config mismatch')
    free = shutil.disk_usage(tempfile.gettempdir()).free
    state['receipt']['storage'] = {'freeBytes': free, 'requiredBytes': 34*1024**3,
        'reserveBytes': 30*1024**3, 'passed': free >= 34*1024**3}
    save()
    if free < 34*1024**3:
        raise RuntimeError('Runner Storage Guard refused before install; main must remain unchanged')
    scratch = Path(tempfile.mkdtemp(prefix='forway-rollout-v2-'))
    state.update(scratch=str(scratch), inode=scratch.stat().st_ino)
    (scratch/'owner').write_text(state['nonce'])
    (scratch/'source').mkdir()
    (scratch/'tmp').mkdir()
    (scratch/'empty.npmrc').write_text('')
    for name in names:
        target = scratch/'source'/name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(repo/name, target)
    state['receipt']['ownerProcessBaseline'] = owned_processes(state['nonce'])
    save()
    execute('node-version', ['node', '--version'], 10, scratch)
    if (output/'node-version.stdout.txt').read_text().strip() != 'v26.8.2':
        raise RuntimeError('Unexpected pinned Node runtime')
    execute('source-check', ['node', 'scripts/check.mjs'], 35, scratch/'source')
    tool = scratch/'playwright'
    tool.mkdir()
    (tool/'package.json').write_text('{"name":"forway-hosted-v2-tool","version":"0.0.0","private":true}')
    execute('browser-tool', ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', '@playwright/test@1.61.1'], 70, tool)
    shutil.copyfile(tool/'package-lock.json', output/'browser-tool-lock.json')
    execute('browser-install', [str(tool/'node_modules/.bin/playwright'), 'install', 'chromium'], 100, tool)
    state['receipt'].update(prepared=True, releaseCommit=manifest['releaseCommit'], publicFiles=20,
        closedInputsCarried=48, preparationCompletedAt=time.time())
    save()
    print('FORWAY_ROLLOUT_PREPARED '+json.dumps({'releaseCommit': manifest['releaseCommit'], 'ready': True}), flush=True)

def run():
    if not state or not state['receipt']['prepared']:
        raise RuntimeError('Preparation did not pass; do not publish')
    if vector(repo, state['names']) != state['sourceBefore']:
        raise RuntimeError('QA source changed after preparation')
    expected = state['manifest']['publicFiles']['/index.html']['sha256']
    opener = urllib.request.build_opener(NoRedirect())
    probes = state['receipt'].setdefault('releaseProbes', [])
    matched = False
    for _ in range(20):
        if time.monotonic() > state['deadline']-180:
            break
        probe = {'at': time.time()}
        try:
            request = urllib.request.Request('https://forway.vercel.app/', headers={'Cache-Control': 'no-cache'})
            with opener.open(request, timeout=10) as response:
                data = response.read(128*1024+1)
                if len(data) > 128*1024:
                    raise RuntimeError('Release observation body cap')
                probe.update(status=response.status, bytes=len(data), sha256=sha(data))
                matched = response.status == 200 and sha(data) == expected
        except Exception as error:
            probe['errorClass'] = type(error).__name__
        probes.append(probe)
        save()
        if matched:
            break
        time.sleep(5)
    if not matched:
        raise RuntimeError('Expected released source not observed within the owned gate')
    scratch = Path(state['scratch'])
    execute('hosted-two-cases', ['node', 'tests/e2e/site-analysis-hosted-v2.mjs'], 180, scratch/'source')
    native = json.loads((output/'native-result.json').read_text())
    wanted = {'H01-desktop-public-crawl', 'H02-390-keyboard-public-crawl'}
    if not native['passed'] or not native['browserClosed'] or {x['id'] for x in native['cases']} != wanted or not all(x['passed'] and x['contextClosed'] for x in native['cases']):
        raise RuntimeError('Hosted identities or browser closure incomplete')
    state['receipt']['hostedCasesPassed'] = 2
    state['receipt']['passed'] = True
    save()

def cleanup():
    if not state:
        print('FORWAY_ROLLOUT_NO_STATE', flush=True)
        return
    receipt = state['receipt']
    try:
        after = vector(repo, state['names'])
        receipt['sourceUnchanged'] = after == state['sourceBefore']
        (output/'source-before.json').write_text(json.dumps(state['sourceBefore'], indent=2))
        (output/'source-after.json').write_text(json.dumps(after, indent=2))
        if state['scratch']:
            scratch = Path(state['scratch'])
            copied = vector(scratch/'source', state['names'])
            receipt['copiedSourceUnchanged'] = copied == state['sourceBefore']
            (output/'copied-source-after.json').write_text(json.dumps(copied, indent=2))
            receipt['ownedProcessesRemaining'] = owned_processes(state['nonce'])
            receipt['ownedProcessesAbsent'] = not receipt.get('ownerProcessBaseline') and not receipt['ownedProcessesRemaining']
            free = shutil.disk_usage(scratch).free
            receipt['reserveAfter'] = {'freeBytes': free, 'requiredBytes': 30*1024**3, 'passed': free >= 30*1024**3}
            if scratch.stat().st_ino == state['inode'] and (scratch/'owner').read_text() == state['nonce'] and receipt['ownedProcessesAbsent'] and all(x['settled'] and x['groupAbsent'] for x in receipt['commands']):
                shutil.rmtree(scratch)
                receipt['cleanup'] = not scratch.exists()
    except Exception as error:
        receipt['cleanupError'] = str(error)
    receipt['passed'] = receipt['passed'] and receipt.get('sourceUnchanged', False) and receipt.get('copiedSourceUnchanged', False) and receipt['cleanup'] and receipt.get('ownedProcessesAbsent', False) and receipt.get('reserveAfter', {}).get('passed', False)
    (output/'receipt.json').write_text(json.dumps(receipt, indent=2))
    print('FORWAY_ROLLOUT_RECEIPT '+json.dumps(receipt), flush=True)
    for file in sorted(output.iterdir()):
        if not file.is_file():
            continue
        data = file.read_bytes()
        if len(data) > 2*1024**2:
            raise RuntimeError('Evidence size cap exceeded')
        encoded = base64.b64encode(gzip.compress(data, mtime=0)).decode()
        parts = [encoded[i:i+16000] for i in range(0, len(encoded), 16000)]
        print('FORWAY_ROLLOUT_FILE '+json.dumps({'path': file.name, 'bytes': len(data), 'sha256': sha(data), 'chunks': len(parts)}), flush=True)
        for index, data in enumerate(parts):
            print('FORWAY_ROLLOUT_CHUNK '+json.dumps({'path': file.name, 'index': index, 'data': data}), flush=True)
    state_path.unlink()
    if not receipt['passed']:
        raise SystemExit(1)

try:
    if phase == 'prepare':
        prepare()
    elif phase == 'run':
        run()
    elif phase == 'cleanup':
        cleanup()
    else:
        raise RuntimeError('Unknown owned phase')
except Exception as error:
    if state:
        state['receipt']['error'] = str(error)
        save()
    print('FORWAY_ROLLOUT_ERROR '+str(error), flush=True)
    raise SystemExit(1)
