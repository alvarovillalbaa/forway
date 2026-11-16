"""Owned remote T2 packet: native browser, authored upstream, bounded cleanup."""
import base64, gzip, hashlib, json, os, shutil, signal, subprocess, tempfile, time, uuid
from pathlib import Path
repo = Path(__file__).resolve().parents[2]
output = Path(os.environ['FORWAY_V2_OUTPUT'])
output.mkdir(exist_ok=False)
receipt = {'passed': False, 'commands': [], 'cleanup': False, 'serverClosed': False}
scratch = server = None
sha = lambda value: hashlib.sha256(value).hexdigest()
roots = ['public', 'src', 'api', 'scripts', 'package.json', 'vercel.json', 'README.md', 'AGENTS.md', 'docs/spec.md', 'docs/architecture.md', 'tests/unit', 'tests/helpers', 'tests/fixtures', 'tests/integration', 'tests/e2e', 'tests/scripts']
names = sorted(os.fsdecode(name) for name in subprocess.check_output(['git', 'ls-files', '-z', '--', *roots], cwd=repo).split(b'\0') if name)
def vector(root):
    return [{'path': name, 'mode': oct((root / name).stat().st_mode & 0o777), 'bytes': (root / name).stat().st_size, 'sha256': sha((root / name).read_bytes())} for name in names]
before = vector(repo)
(output / 'source-before.json').write_text(json.dumps(before, indent=2))
(output / 'source.json').write_text(json.dumps({'sha': os.environ['GITHUB_SHA'], 'paths': names}, indent=2))
deadline = time.monotonic() + 480
def absent(pid):
    for _ in range(30):
        try:
            os.killpg(pid, 0)
            time.sleep(.1)
        except ProcessLookupError:
            return True
    return False
def stop(process):
    if process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
    try:
        return process.communicate(timeout=10)
    except subprocess.TimeoutExpired:
        os.killpg(process.pid, signal.SIGKILL)
        return process.communicate(timeout=5)
def execute(name, argv, timeout, cwd):
    timeout = min(timeout, int(deadline - time.monotonic() - 25))
    if timeout < 1:
        raise RuntimeError('Deadline before ' + name)
    start = time.monotonic()
    process = subprocess.Popen(argv, cwd=cwd, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    timed_out = False
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        timed_out = True
        stdout, stderr = stop(process)
    closed = absent(process.pid)
    for suffix, value in [('stdout', stdout), ('stderr', stderr)]:
        (output / (name + '.' + suffix + '.txt')).write_bytes(value)
    item = {'name': name, 'argv': argv, 'code': process.returncode, 'timedOut': timed_out, 'leaderReaped': process.poll() is not None, 'groupAbsent': closed, 'seconds': time.monotonic() - start, 'stdoutBytes': len(stdout), 'stdoutSha256': sha(stdout), 'stderrBytes': len(stderr), 'stderrSha256': sha(stderr)}
    receipt['commands'].append(item)
    print(json.dumps(item), flush=True)
    if process.returncode or timed_out or not closed:
        raise RuntimeError(name + ' did not close successfully')
def owned_processes(marker):
    found = []
    for path in Path('/proc').glob('[0-9]*/environ'):
        try:
            if ('FORWAY_V2_OWNER=' + marker).encode() in path.read_bytes().split(b'\0'):
                found.append(int(path.parent.name))
        except (FileNotFoundError, PermissionError, ProcessLookupError):
            pass
    return sorted(found)
try:
    free = shutil.disk_usage(tempfile.gettempdir()).free
    receipt['storage'] = {'freeBytes': free, 'requiredBytes': 34 * 1024**3, 'passed': free >= 34 * 1024**3}
    if not receipt['storage']['passed']:
        raise RuntimeError('Runner Storage Guard refused installation')
    scratch = Path(tempfile.mkdtemp(prefix='forway-site-analysis-v2-'))
    nonce = uuid.uuid4().hex
    (scratch / 'owner').write_text(nonce)
    inode = scratch.stat().st_ino
    source = scratch / 'source'
    source.mkdir()
    for name in names:
        target = source / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(repo / name, target)
    (scratch / 'tmp').mkdir()
    (scratch / 'empty.npmrc').write_text('')
    receipt['ownerProcessBaseline'] = owned_processes(nonce)
    env = {'PATH': os.environ['PATH'], 'HOME': os.environ['HOME'], 'TMPDIR': str(scratch / 'tmp'), 'CI': '1', 'GITHUB_SHA': os.environ['GITHUB_SHA'], 'npm_config_cache': str(scratch / 'npm-cache'), 'npm_config_userconfig': str(scratch / 'empty.npmrc'), 'npm_config_globalconfig': '/dev/null', 'PLAYWRIGHT_BROWSERS_PATH': str(scratch / 'browsers'), 'FORWAY_V2_OUTPUT': str(output), 'FORWAY_V2_OWNER': nonce, 'NODE_ENV': 'production'}
    execute('node-version', ['node', '--version'], 10, scratch)
    if (output / 'node-version.stdout.txt').read_text().strip() != 'v26.8.2':
        raise RuntimeError('Unexpected Node runtime')
    execute('source-check', ['node', 'scripts/check.mjs'], 30, source)
    execute('focused-controls', ['node', '--test', '--test-reporter=tap', 'tests/unit/site-crawl-v2.test.mjs', 'tests/unit/provider-answer-v2.test.mjs', 'tests/unit/provider-comparison-v2.test.mjs', 'tests/unit/site-report.test.mjs'], 40, source)
    report = (output / 'focused-controls.stdout.txt').read_text()
    if not {'# tests 69', '# pass 69', '# fail 0', '# cancelled 0', '# skipped 0'}.issubset(set(report.splitlines())):
        raise RuntimeError('Focused controls did not all settle')
    tool = scratch / 'playwright'
    tool.mkdir()
    (tool / 'package.json').write_text('{"name":"forway-site-analysis-v2-tool","version":"0.0.0","private":true}')
    execute('browser-tool', ['npm', 'install', '--ignore-scripts', '--no-audit', '--no-fund', '--save-exact', '@playwright/test@1.61.1'], 70, tool)
    shutil.copyfile(tool / 'package-lock.json', output / 'browser-tool-lock.json')
    execute('browser-install', [str(tool / 'node_modules/.bin/playwright'), 'install', 'chromium'], 100, tool)
    env['FORWAY_PLAYWRIGHT_PACKAGE'] = str(tool / 'package.json')
    env['FORWAY_V2_CONTROL'] = str(scratch / 'control.json')
    (scratch / 'control.json').write_text('{}')
    server_stdout = open(output / 'server.stdout.txt', 'wb')
    server_stderr = open(output / 'server.stderr.txt', 'wb')
    server = subprocess.Popen(['node', 'tests/e2e/site-analysis-server.mjs'], cwd=source, env=env, stdout=server_stdout, stderr=server_stderr, start_new_session=True)
    ready = time.monotonic() + 15
    while 'FORWAY_V2_SERVER_READY' not in (output / 'server.stdout.txt').read_text():
        if server.poll() is not None or time.monotonic() > ready:
            raise RuntimeError('Authored application server did not become ready')
        time.sleep(.1)
    execute('six-native-cases', ['node', 'tests/e2e/site-analysis-v2.mjs'], 180, source)
    native = json.loads((output / 'native-result.json').read_text())
    if not native['passed'] or not native['browserClosed'] or len(native['cases']) != 6 or not all(c['passed'] and c['contextClosed'] for c in native['cases']):
        raise RuntimeError('Native closure or case acceptance incomplete')
    receipt['passed'] = True
except Exception as error:
    receipt['error'] = str(error)
finally:
    if server:
        stop(server)
        server_stdout.close()
        server_stderr.close()
        receipt['server'] = {'code': server.returncode, 'groupAbsent': absent(server.pid), 'closedMarker': 'FORWAY_V2_SERVER_CLOSED' in (output / 'server.stdout.txt').read_text()}
        receipt['serverClosed'] = server.returncode == 0 and receipt['server']['groupAbsent'] and receipt['server']['closedMarker']
    after = vector(repo)
    (output / 'source-after.json').write_text(json.dumps(after, indent=2))
    receipt['sourceUnchanged'] = before == after
    if scratch and (scratch / 'source').is_dir():
        copied = vector(source)
        (output / 'copied-source-after.json').write_text(json.dumps(copied, indent=2))
        receipt['copiedSourceUnchanged'] = before == copied
        receipt['ownedProcessesRemaining'] = owned_processes(nonce)
        receipt['ownedProcessesAbsent'] = not receipt['ownerProcessBaseline'] and not receipt['ownedProcessesRemaining']
        if scratch.stat().st_ino == inode and (scratch / 'owner').read_text() == nonce and all(c['groupAbsent'] for c in receipt['commands']) and (not server or receipt['server']['groupAbsent']) and receipt['ownedProcessesAbsent']:
            shutil.rmtree(scratch)
            receipt['cleanup'] = not scratch.exists()
    receipt['passed'] = receipt['passed'] and receipt['sourceUnchanged'] and receipt.get('copiedSourceUnchanged', False) and receipt['cleanup'] and receipt['serverClosed']
    (output / 'receipt.json').write_text(json.dumps(receipt, indent=2))
    print('FORWAY_V2_RECEIPT ' + json.dumps(receipt), flush=True)
    for file in sorted(output.rglob('*')):
        if not file.is_file():
            continue
        value = file.read_bytes()
        if len(value) > 2 * 1024**2:
            raise RuntimeError('Unexpected evidence size')
        encoded = base64.b64encode(gzip.compress(value, mtime=0)).decode()
        parts = [encoded[index:index + 16000] for index in range(0, len(encoded), 16000)]
        name = file.relative_to(output).as_posix()
        print('FORWAY_V2_FILE ' + json.dumps({'path': name, 'bytes': len(value), 'sha256': sha(value), 'chunks': len(parts)}), flush=True)
        for index, part in enumerate(parts):
            print('FORWAY_V2_CHUNK ' + json.dumps({'path': name, 'index': index, 'data': part}), flush=True)
if not receipt['passed']:
    raise SystemExit(1)
