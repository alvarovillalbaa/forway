"""Read retained artifacts only; never execute product code or rerun a test."""
from pathlib import Path
import hashlib, json, re, zipfile

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / 'candidate' if (ROOT / 'candidate').is_dir() else ROOT.parents[4]
EXPECTED = {
    1: '33e22baa3e619bf69fded697f352f90c965a046f2f574cd0faf49056b6340c3f',
    2: 'a9fed2319255c309f3ba0153acd2a5578d72379f883b630692ffd967aa8eb36a',
    3: '412d94952bd943a8339fcce2013b835731f767a3b281aaf8be32e4bea747ce8f',
    4: '1571d5b8f1be9cd776c4ad6c1c522cb60a38b25fc08d06a436f759fd4216bb93',
    5: '6138bf5a9995beb88d46f263c7b2912feb0fae793d91e07c74c204a255eb5bce',
}

def inspect(number):
    data = (ROOT / f'workspaces-attempt-{number}.zip').read_bytes()
    assert hashlib.sha256(data).hexdigest() == EXPECTED[number]
    with zipfile.ZipFile(ROOT / f'workspaces-attempt-{number}.zip') as archive:
        assert len(archive.namelist()) == len(set(archive.namelist()))
        assert sum(item.file_size for item in archive.infolist()) < 2 * 1024**2
        report = json.loads(archive.read('receipt.json'))
        assert report['cleanup'] == ({'scratchAbsent': True} if number == 5 else {'containerAbsent': True, 'scratchAbsent': True})
        assert report['sourceAfterCleanup'] is True
        for name, item in report['files'].items():
            body = archive.read(name)
            assert len(body) == item['bytes'] and hashlib.sha256(body).hexdigest() == item['sha256']
        streams = {name: archive.read(name).decode() for name in archive.namelist() if name.endswith('.stdout')}
        return report, streams

def outcomes(text):
    found = re.findall(r'^(ok|not ok) \d+ - ([APC]\d\d) (.+)$', text, re.M)
    assert len(found) == len({item[1] for item in found})
    return {key: {'passed': status == 'ok', 'title': title} for status, key, title in found}

packets = {number: inspect(number) for number in EXPECTED}
for number in [1, 2]:
    assert 'workspace-tests.stdout' not in packets[number][1]
original = outcomes(packets[3][1]['workspace-tests.stdout'])
assert set(original) == {f'A{i:02}' for i in range(1, 16)} | {f'P{i:02}' for i in range(1, 16)}
assert [key for key, value in original.items() if not value['passed']] == ['P13']
corrected = outcomes(packets[4][1]['P13-corrected.stdout'])
assert set(corrected) == {'P13'} and corrected['P13']['passed']
client = outcomes(packets[4][1]['client-tests.stdout'])
assert set(client) == {f'C{i:02}' for i in range(1, 11)} and all(value['passed'] for value in client.values())
assert 'No tests found' in packets[4][1]['browser-checks.stdout']
browser_report = packets[5][0]
assert browser_report['accepted'] is True and browser_report['sourceAfterChecks'] is True
assert browser_report['sourceFiles'] == packets[4][0]['sourceFiles']
assert all(c['exitCode'] == 0 and c['reaped'] and c['groupAbsent'] and not c['timedOut'] for c in browser_report['commands'])
with zipfile.ZipFile(ROOT / 'workspaces-attempt-5.zip') as archive:
    browser = json.loads(archive.read('browser-results.json'))
    assert browser['errors'] == []
    assert {key: browser['stats'][key] for key in ['expected','skipped','unexpected','flaky']} == {'expected':4,'skipped':0,'unexpected':0,'flaky':0}
    actual = {}
    def walk(suites):
        for suite in suites:
            for spec in suite.get('specs', []):
                key = spec['title'].split(' ', 1)[0]
                assert key not in actual and spec['ok'] is True
                assert len(spec['tests']) == 1
                item = spec['tests'][0]
                assert item['expectedStatus'] == 'passed' and item['status'] == 'expected'
                assert len(item['results']) == 1 and item['results'][0]['status'] == 'passed'
                actual[key] = item['projectName']
            walk(suite.get('suites', []))
    walk(browser['suites'])
    assert actual == {'U01':'desktop-chromium','U03':'desktop-chromium','U04':'desktop-chromium','U02':'narrow-chromium'}
for name in ['public/index.html','public/styles.css','public/src/app.mjs','public/src/cloud-client.mjs','public/src/cloud-panel.mjs']:
    assert hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() == browser_report['sourceFiles'][name]['sha256']

# The SQL/server/transport implementation in the 29-case pass is byte-exact
# in the later UI source. Only the P13 observer/independent fixture changed.
protected = ['db/bootstrap.sql', 'public/src/workspace.mjs', 'public/src/content.mjs', 'public/src/observations.mjs',
             'src/cloud/auth.mjs', 'src/cloud/commands.mjs', 'src/cloud/config.mjs', 'src/cloud/http.mjs', 'src/cloud/store.mjs',
             'api/workspaces.mjs', 'api/cloud-auth.mjs', 'api/cloud-config.mjs', 'package.json', 'package-lock.json']
for name in protected:
    before = packets[3][0]['sourceFiles'][name]
    assert packets[4][0]['sourceFiles'][name] == before
    assert hashlib.sha256((SOURCE / name).read_bytes()).hexdigest() == before['sha256']

result = {'databaseAndApi': {'passed': 30, 'singleRun': False,
          'originalRun': packets[3][0]['runId'], 'correctionRun': packets[4][0]['runId'],
          'originalP13FailureRetained': True, 'protectedImplementationFiles': len(protected)},
          'client': {'passed': 10, 'run': packets[4][0]['runId']},
          'browser': {'passed': 4, 'run': browser_report['runId'], 'authoredApiResponses': True, 'physicalDevice': False},
          'distinctFocusedCases': 44, 'liveAuthOrDatabaseVerified': False}
print(json.dumps(result, indent=2))
