#!/usr/bin/env node
// One hosted workbench packet. No application installation, build or local server.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { gzipSync } from 'node:zlib';

const REPOSITORY = 'alvarovillalbaa/forway';
const BRANCH = 'refs/heads/qa/forway-hosted-20261105';
const ACTIVE = '.github/workflows/hosted-browser.yml';
const SPEC = 'docs/proposals/hosted-browser.spec.mjs.example';
const SPEC_SHA = 'f3c258526edcf93933a971d597a921c4d7bc3e9781d870e2bd6547bdedffd151';
const ORIGIN = 'https://forway.vercel.app';
const TITLES = [
  'B01 desktop entry, keyboard navigation and dialogs expose an empty honest workspace',
  'B02 real public fixture import crosses the actual API and browser parser with twelve findings',
  'B03 supplied hostile and structured HTML stays inert while literal facts become an editable draft',
  'B04 real noindex header context survives edits and actual escaped HTML and metadata downloads',
  'B05 supplied evidence retains original answers and isolated competitor-cohort denominators',
  'B06 real workspace download and chooser restore partial rows and cohorts while rejection keeps current work',
  'B07 controlled own-API delay preserves cancellation retry and a newer draft edit',
  'B08 narrow viewport keeps audit content evidence and keyboard dialogs reachable without overflow',
];
const PROFILES = ['desktop-chromium', 'narrow-chromium'];
const EXPECTED_CASES = TITLES.map((title, index) => ({ title, project: index === 7 ? 'narrow-chromium' : 'desktop-chromium' }));
const ASSETS = [
  ['/', 'public/index.html'], ['/styles.css', 'public/styles.css'], ['/icon.svg', 'public/icon.svg'],
  ...['app', 'audit', 'content', 'observations', 'ui', 'workspace'].map(name => [`/src/${name}.mjs`, `public/src/${name}.mjs`]),
];
const FIXTURES = [
  { route: '/check-fixtures/authored-page.html', file: 'public/check-fixtures/authored-page.html', robots: null },
  { route: '/check-fixtures/header-noindex.html', file: 'public/check-fixtures/header-noindex.html', robots: 'noindex' },
];
const STREAM_LIMIT = 524288, REPORT_LIMIT = 1048576, BROWSER_LIMIT = 2097152;
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const gitBlob = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const need = (condition, code) => { if (!condition) throw new Error(code); };
const finite = error => /^[a-z0-9_]+$/.test(error?.message ?? '') ? error.message : 'controller_error';
const sourceCommit = process.argv[3], deployment = process.env.FORWAY_EXPECTED_DEPLOYMENT;
need(process.argv.length === 4 && process.argv[2] === '--source-commit' && /^[a-f0-9]{40}$/.test(sourceCommit ?? ''), 'source_pin_required');
need(/^dpl_[A-Za-z0-9]{1,100}$/.test(deployment ?? ''), 'deployment_pin_required');
need(process.version === 'v24.21.0' && process.platform === 'linux' && process.env.CI === 'true'
  && process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === REPOSITORY
  && process.env.GITHUB_EVENT_NAME === 'push' && process.env.GITHUB_REF === BRANCH
  && process.env.FORWAY_PUBLIC_REPOSITORY === 'true', 'approved_public_ci_required');

const repo = fs.realpathSync(process.cwd()), parent = fs.realpathSync(process.env.RUNNER_TEMP ?? '');
need(path.isAbsolute(parent) && fs.statSync(parent).isDirectory(), 'runner_temp_invalid');
const root = fs.mkdtempSync(path.join(parent, 'forway-hosted-'));
fs.chmodSync(root, 0o700);
const identity = fs.lstatSync(root), nonce = randomUUID();
fs.writeFileSync(path.join(root, 'owner'), nonce, { flag: 'wx', mode: 0o600 });
for (const name of ['tools', 'tmp', 'cache', 'config', 'browsers', 'output']) fs.mkdirSync(path.join(root, name), { mode: 0o700 });
for (const name of ['npm-user', 'npm-global']) fs.writeFileSync(path.join(root, name), '', { flag: 'wx', mode: 0o600 });
const outputParent = path.join(root, 'output'), outputIdentity = fs.lstatSync(outputParent);
const outputDirectory = path.join(outputParent, 'results'), browserFile = path.join(root, 'browser.json');
const tools = path.join(root, 'tools'), specFile = path.join(tools, 'hosted-browser.spec.mjs'), configFile = path.join(tools, 'playwright.config.mjs');
const env = {
  PATH: `${path.dirname(process.execPath)}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`,
  HOME: process.env.HOME, LANG: 'C.UTF-8', TZ: 'UTC', CI: 'true', NO_COLOR: '1',
  TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'),
  XDG_CACHE_HOME: path.join(root, 'cache'), XDG_CONFIG_HOME: path.join(root, 'config'),
  NODE_COMPILE_CACHE: path.join(root, 'cache', 'node'),
  npm_config_userconfig: path.join(root, 'npm-user'), npm_config_globalconfig: path.join(root, 'npm-global'),
  npm_config_cache: path.join(root, 'cache', 'npm'), npm_config_registry: 'https://registry.npmjs.org/',
  npm_config_audit: 'false', npm_config_fund: 'false', npm_config_update_notifier: 'false',
  GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0',
  PLAYWRIGHT_BROWSERS_PATH: path.join(root, 'browsers'), PLAYWRIGHT_HTML_OPEN: 'never',
  FORWAY_EXPECTED_DEPLOYMENT: deployment, FORWAY_BROWSER_REPORT: browserFile,
};
const report = {
  schemaVersion: 'forway.hosted-browser.v1', sourceCommit, expectedDeployment: deployment, origin: ORIGIN,
  status: 'failed', startedAtUtc: new Date().toISOString(),
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  scope: { scenarios: TITLES, profiles: PROFILES, cases: 8, workers: 1, retries: 0, appBuild: false, appDependencies: false,
    accounts: false, serverWrites: false, liveOwnFixtureApi: true, controlledApiTiming: true, providers: false, models: false, screenshots: false, traces: false, videos: false },
  limits: { workSeconds: 720, cleanupSeconds: 90, browserGlobalSeconds: 480, jobMinutes: 15, finalStdoutSeconds: 2,
    streamBytes: STREAM_LIMIT, streamGzipBytes: 131072, allStreamsGzipBytes: 524288, browserJsonBytes: BROWSER_LIMIT,
    browserJsonGzipBytes: 262144, reportBytes: REPORT_LIMIT, termToKillSeconds: 3, drainSeconds: 3, assetFetchSeconds: 8, assetResponseBytes: 2097152 },
  commands: [], guards: [], errors: [], sourceFiles: [],
  proofLimits: [
    'Eight authored browser cases exercise the public static workbench and actual same-origin API fetching only its own authored fixtures. B07 timing interception is separately classified; there are no accounts, persistence writes, third-party targets or model calls.',
    'The deployment ID is an owning-workflow provider-metadata pin. Actual served asset byte hashes bind the frontend source, not the deployed backend binary; live API evidence is limited to the two own-fixture imports.',
    'The only installed JavaScript tool is Playwright 1.61.1 in owned external runner storage. Chromium Linux system packages are installed on the disposable runner and are not independently uninstalled.',
    'Direct child exit/close/EOF and original groups are checked. Same-UID Linux browser processes are additionally attributed by the unique owned binary/profile/cache path and kernel starttime; unreadable or uncertain attribution prevents owned-root deletion. This is not a host-wide process inventory.',
    'Registry/browser downloads and allowed public hosted GETs are setup/acceptance network traffic, not a network sandbox. Userspace deadlines cannot interrupt blocked kernel filesystem calls.',
  ],
};
const workEnd = Date.now() + 720000;
let cleanupEnd, interrupted = false, globalExpired = false, baseline, allGzip = 0, browserAttempted = false, assetManifest, fixtureManifest;
let browserScanUncertain = false, lastBrowserScan = 0;
const browserProcesses = new Map();
const active = new Set(), activeHttp = new Set(), handlers = new Map();
for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  const handler = () => { interrupted = true; for (const child of active) child.stop('interrupted'); for (const request of activeHttp) request.abort(); };
  handlers.set(signal, handler); process.on(signal, handler);
}
const globalTimer = setTimeout(() => { globalExpired = true; for (const child of active) child.stop('global_deadline'); for (const request of activeHttp) request.abort(); }, Math.max(1, workEnd + 90000 - Date.now()));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
function owner() {
  const current = fs.lstatSync(root), marker = path.join(root, 'owner');
  need(path.dirname(root) === parent && current.isDirectory() && !current.isSymbolicLink() && current.dev === identity.dev && current.ino === identity.ino
    && !fs.lstatSync(marker).isSymbolicLink() && fs.readFileSync(marker, 'utf8') === nonce, 'scratch_identity_changed');
}
function read(file, maximum = 16777216) {
  const before = fs.lstatSync(file); need(before.isFile() && !before.isSymbolicLink() && before.size <= maximum, 'file_type_or_bound');
  const bytes = fs.readFileSync(file), after = fs.lstatSync(file);
  need(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs && bytes.length === before.size, 'file_changed'); return bytes;
}
function scrub(value, maximum = 700) {
  let text = String(value ?? '').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  for (const [from, to] of [[root, '[scratch]'], [repo, '[repository]'], [process.env.HOME, '[runner-home]']]) if (from) text = text.split(from).join(to);
  return Buffer.from(text).subarray(0, maximum).toString('utf8');
}
function compressed(bytes, maximum = 131072) {
  const zip = gzipSync(bytes); need(zip.length <= maximum, 'raw_gzip_limit');
  return { encoding: 'gzip-base64', bytes: bytes.length, sha256: sha(bytes), compressedBytes: zip.length, data: zip.toString('base64') };
}
function groupAbsent(pid) { try { process.kill(-pid, 0); return false; } catch (error) { return error.code === 'ESRCH' ? true : null; } }
function proc(pid) {
  const base = `/proc/${pid}`, item = fs.statSync(base);
  if (item.uid !== process.getuid()) return null;
  const before = readProc(path.join(base, 'stat'), 8192).toString(), close = before.lastIndexOf(')');
  need(close > 0, 'proc_stat_shape');
  const fields = before.slice(close + 2).trim().split(/\s+/);
  need(fields.length >= 20 && /^\d+$/.test(fields[19]), 'proc_stat_shape');
  const args = readProc(path.join(base, 'cmdline'), 65536).toString().split('\0').filter(Boolean);
  const after = readProc(path.join(base, 'stat'), 8192).toString(), afterClose = after.lastIndexOf(')');
  need(afterClose > 0 && after.slice(afterClose + 2).trim().split(/\s+/)[19] === fields[19], 'proc_identity_changed');
  const owned = args.some(arg => arg === root || arg.startsWith(root + '/') || arg.includes('=' + root + '/'))
    || browserProcesses.has(pid + ':' + fields[19]);
  return { pid, ppid: Number(fields[1]), pgid: Number(fields[2]), session: Number(fields[3]), state: fields[0],
    starttime: fields[19], owned, executable: args.length ? path.basename(args[0].trim().split(/\s+/)[0]).slice(0, 80) : '' };
}
function readProc(file, maximum) {
  const fd = fs.openSync(file, 'r');
  try { const buffer = Buffer.alloc(maximum + 1), length = fs.readSync(fd, buffer, 0, buffer.length, 0); need(length <= maximum, 'proc_read_bound'); return buffer.subarray(0, length); }
  finally { fs.closeSync(fd); }
}
function scanBrowsers(force = false) {
  if (!browserAttempted || (!force && Date.now() - lastBrowserScan < 500)) return [];
  lastBrowserScan = Date.now(); const names = fs.readdirSync('/proc').filter(name => /^\d+$/.test(name));
  need(names.length <= 8192, 'proc_inventory_bound'); const present = [];
  for (const name of names) {
    const pid = Number(name); if (pid === process.pid) continue;
    try {
      const item = proc(pid); if (!item?.owned) continue;
      // The command supervisor owns its own process group; this supplementary
      // inventory records detached browser descendants without logging argv.
      const key = item.pid + ':' + item.starttime;
      if (!browserProcesses.has(key)) browserProcesses.set(key, { ...item, firstSeenAtUtc: new Date().toISOString() });
      need(browserProcesses.size <= 256, 'browser_process_inventory_bound');
      present.push(item);
    } catch (error) {
      if (!['ENOENT', 'ESRCH'].includes(error.code)) browserScanUncertain = true;
    }
  }
  return present;
}
async function cleanupBrowsers() {
  owner(); const started = Date.now(); let present = scanBrowsers(true), termSent = 0, killSent = 0;
  while (present.length && Date.now() - started < 6500 && Date.now() < cleanupEnd - 10000) {
    for (const item of present) {
      try {
        const current = proc(item.pid);
        need(current?.owned && current.starttime === item.starttime, 'browser_pid_identity_changed');
        const signal = Date.now() - started >= 3000 ? 'SIGKILL' : 'SIGTERM';
        process.kill(item.pid, signal); if (signal === 'SIGKILL') killSent++; else termSent++;
      } catch (error) { if (!['ENOENT', 'ESRCH'].includes(error.code)) browserScanUncertain = true; }
    }
    await pause(100); present = scanBrowsers(true);
  }
  const stillPresent = scanBrowsers(true);
  report.browserProcessCleanup = { passed: !browserScanUncertain && stillPresent.length === 0,
    basis: 'Same UID, unique owned-root argv attribution and revalidated Linux kernel PID starttime; no argv/env output.',
    observed: [...browserProcesses.values()], remaining: stillPresent, termSent, killSent, scanUncertain: browserScanUncertain };
  need(report.browserProcessCleanup.passed, 'browser_process_cleanup_unverified');
}
async function run(label, executable, args, seconds, { cleanup = false, retainFailure = false, cwd = repo, postScratch = false } = {}) {
  if (postScratch) need(cleanup && report.scratchCleanup === 'passed' && !fs.existsSync(root), 'scratch_postguard_invalid'); else owner();
  need(cleanup || (!interrupted && !globalExpired), 'interrupted_before_command');
  const end = cleanup ? cleanupEnd : workEnd, remaining = end - Date.now() - 6500;
  need(remaining > 0, 'command_budget_exhausted');
  const commandEnv = postScratch ? { PATH: env.PATH, HOME: env.HOME, LANG: env.LANG, TZ: env.TZ,
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' } : env;
  const started = Date.now(), child = spawn(executable, args, { cwd, env: commandEnv, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = [[], []], count = [0, 0], size = [0, 0], digest = [createHash('sha256'), createHash('sha256')], eof = [false, false];
  let exitCode = null, signal = null, exited = false, closed = false, reason = null, stopAt = null, termSent = false, killSent = false, forcedDrain = false, captureFinished = false;
  const control = { stop(why) {
    if (!reason) { reason = why; stopAt = Date.now(); }
    if (!termSent && child.pid) { termSent = true; try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
  } };
  active.add(control);
  child.once('error', () => { control.stop('spawn_failed'); });
  child.once('exit', (code, received) => { exited = true; exitCode = code; signal = received; });
  child.once('close', () => { closed = true; });
  [child.stdout, child.stderr].forEach((stream, index) => {
    stream.once('end', () => { eof[index] = true; });
    stream.on('data', bytes => {
      if (captureFinished) return;
      count[index] += bytes.length; digest[index].update(bytes);
      const kept = bytes.subarray(0, Math.max(0, STREAM_LIMIT - size[index])); chunks[index].push(kept); size[index] += kept.length;
      if (count[index] > STREAM_LIMIT) control.stop('output_limit');
    });
  });
  let leaderClosedAt = null;
  while (true) {
    if (label === 'browser_cases') { try { scanBrowsers(); } catch { browserScanUncertain = true; } }
    const now = Date.now(), absent = child.pid ? groupAbsent(child.pid) : true;
    if (closed && leaderClosedAt === null) leaderClosedAt = now;
    if (interrupted && !cleanup) control.stop('interrupted');
    if (now - started >= Math.min(seconds * 1000, remaining)) control.stop('timeout');
    if (closed && exited && eof.every(Boolean) && absent === true) break;
    if (closed && !child.pid) break;
    if (leaderClosedAt !== null && absent !== true && now - leaderClosedAt >= 1500) control.stop('process_group_remaining');
    if (stopAt !== null && now - stopAt >= 3000 && !killSent && child.pid && absent !== true) {
      killSent = true; try { process.kill(-child.pid, 'SIGKILL'); } catch {}
    }
    if (stopAt !== null && now - stopAt >= 6000) {
      forcedDrain = !closed || !eof.every(Boolean);
      if (forcedDrain) { child.stdout.destroy(); child.stderr.destroy(); }
      break;
    }
    await pause(25);
  }
  captureFinished = true; const output = chunks.map(parts => Buffer.concat(parts));
  const row = { label, args: [executable === process.execPath ? '[node]' : scrub(executable, 250), ...args.map(value => scrub(value, 250))],
    exitCode, signal, stopReason: reason, exitObservedAndReaped: exited, closeObserved: closed, pipesEOF: [...eof],
    forcedDrain, originalProcessGroupAbsent: child.pid ? groupAbsent(child.pid) : true, termSent, killSent, durationMs: Date.now() - started,
    streams: output.map((bytes, index) => {
      const raw = compressed(bytes); allGzip += raw.compressedBytes;
      return { name: index ? 'stderr' : 'stdout', observedBytes: count[index], observedSha256: digest[index].digest('hex'),
        complete: closed && eof[index] && count[index] === bytes.length && !forcedDrain, raw, head: scrub(bytes.toString(), 500), tail: scrub(bytes.subarray(Math.max(0, bytes.length - 700)).toString(), 700) };
    }) };
  row.released = exited && closed && eof.every(Boolean) && !forcedDrain && row.originalProcessGroupAbsent === true;
  report.commands.push(row); active.delete(control);
  need(allGzip <= 524288, 'all_streams_gzip_limit');
  const accepted = row.exitCode === 0 && row.signal === null && row.stopReason === null && row.released && row.streams.every(stream => stream.complete);
  if (!retainFailure) need(accepted, label + '_failed');
  return { output, row, accepted };
}
function parseGit(bytes, index) {
  const rows = new Map();
  for (const record of bytes.toString().split('\0').filter(Boolean)) {
    const tab = record.indexOf('\t'), header = record.slice(0, tab).split(' '), name = record.slice(tab + 1);
    need(tab > 0 && name && !path.isAbsolute(name) && !name.split('/').some(part => !part || part === '.' || part === '..') && !rows.has(name), 'git_entry_invalid');
    need(index ? header[2] === '0' : header[1] === 'blob', 'git_entry_type'); rows.set(name, { mode: header[0], gitBlob: header[index ? 1 : 2] });
  }
  return rows;
}
function fileVector(name) {
  const file = path.join(repo, name);
  for (let current = path.dirname(file); current !== repo; current = path.dirname(current)) {
    const item = fs.lstatSync(current); need(item.isDirectory() && !item.isSymbolicLink(), 'tracked_ancestor_changed');
  }
  const before = fs.lstatSync(file), mode = before.isSymbolicLink() ? '120000' : before.isFile() ? (before.mode & 0o111 ? '100755' : '100644') : null;
  need(mode, 'tracked_type_invalid');
  const bytes = before.isSymbolicLink() ? fs.readlinkSync(file, { encoding: 'buffer' }) : read(file), after = fs.lstatSync(file);
  need(before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs, 'tracked_file_changed');
  return { path: name, mode, gitBlob: gitBlob(bytes), bytes: bytes.length, sha256: sha(bytes) };
}
async function guard(label, cleanup = false, postScratch = false) {
  const result = { label, passed: false }; report.guards.push(result); const options = { cleanup, postScratch };
  need((await run(label + '_head', 'git', ['rev-parse', 'HEAD'], 10, options)).output[0].toString().trim() === sourceCommit, 'head_changed');
  need(!fs.existsSync(path.join(repo, ACTIVE)), 'active_workflow_in_source');
  const tree = parseGit((await run(label + '_tree', 'git', ['ls-tree', '-r', '-z', 'HEAD'], 10, options)).output[0], false);
  const index = parseGit((await run(label + '_index', 'git', ['ls-files', '--stage', '-z'], 10, options)).output[0], true);
  need(tree.size > 0 && index.size === tree.size, 'tracked_count_changed');
  const vector = [];
  for (const [name, item] of tree) {
    const value = fileVector(name); need(index.get(name)?.mode === item.mode && index.get(name)?.gitBlob === item.gitBlob
      && value.mode === item.mode && value.gitBlob === item.gitBlob, 'full_tracked_source_changed'); vector.push(value);
  }
  need((await run(label + '_status', 'git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 10, options)).output[0].length === 0, 'worktree_not_clean');
  await run(label + '_diff', 'git', ['-c', 'core.filemode=true', 'diff', '--no-ext-diff', '--no-textconv', '--quiet', '--exit-code', 'HEAD', '--'], 10, options);
  const ignored = (await run(label + '_ignored', 'git', ['status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=normal'], 10, options)).output[0];
  need(ignored.length === 0, 'repository_generated_output');
  if (!baseline) { baseline = vector; report.sourceFiles = vector; }
  need(JSON.stringify(vector) === JSON.stringify(baseline), 'source_vector_changed');
  Object.assign(result, { passed: true, trackedFiles: vector.length, sourceBytes: vector.reduce((sum, file) => sum + file.bytes, 0),
    vectorSha256: sha(JSON.stringify(vector)), fullHeadIndexModesAndBytes: true, noUntrackedOrIgnoredOutput: true });
}
function outputFileMetadata(file, maximum) {
  owner(); const parentItem = fs.lstatSync(outputParent);
  need(parentItem.isDirectory() && !parentItem.isSymbolicLink() && parentItem.dev === outputIdentity.dev && parentItem.ino === outputIdentity.ino, 'output_parent_changed');
  const resolved = path.resolve(file); need(resolved.startsWith(outputDirectory + path.sep), 'attachment_outside_output');
  for (let current = path.dirname(resolved); current !== outputParent; current = path.dirname(current)) {
    const item = fs.lstatSync(current); need(item.isDirectory() && !item.isSymbolicLink(), 'attachment_ancestor_changed');
  }
  const item = fs.lstatSync(resolved); need(item.isFile() && !item.isSymbolicLink() && item.size <= maximum, 'attachment_file_type_or_bound');
  return { file: resolved, bytes: item.size };
}
function outputFile(file, maximum) {
  return read(outputFileMetadata(file, maximum).file, maximum);
}
function attachmentBytes(item) {
  need(item?.name === 'forway-hosted-browser-boundary' && item.contentType === 'application/json', 'unexpected_browser_attachment');
  if (typeof item.body === 'string') {
    need(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(item.body), 'attachment_base64_invalid');
    const bytes = Buffer.from(item.body, 'base64'); need(bytes.length <= 8192 && bytes.toString('base64') === item.body, 'attachment_bound'); return bytes;
  }
  need(typeof item.path === 'string', 'attachment_missing'); return outputFile(item.path, 8192);
}
function prepareManifests() {
  assetManifest = ASSETS.map(([route, file]) => { const bytes = read(path.join(repo, file)); return { route, bytes: bytes.length, sha256: sha(bytes) }; });
  fixtureManifest = FIXTURES.map(({ route, file, robots }) => { const bytes = read(path.join(repo, file)); return { route, bytes: bytes.length, sha256: sha(bytes), robots }; });
  need(assetManifest.length === 9 && new Set(assetManifest.map(item => item.route)).size === 9 && fixtureManifest.length === 2, 'source_manifest_shape');
  env.FORWAY_EXPECTED_ASSETS = JSON.stringify(assetManifest); env.FORWAY_EXPECTED_FIXTURES = JSON.stringify(fixtureManifest);
  report.expectedAssets = assetManifest; report.expectedFixtures = fixtureManifest;
}
async function verifyServedAssets() {
  report.servedAssets = [];
  for (const expected of assetManifest) {
    owner(); need(!interrupted && !globalExpired && workEnd - Date.now() > 9000, 'asset_budget_exhausted');
    const abort = new AbortController(), row = { route: expected.route, expectedBytes: expected.bytes, expectedSha256: expected.sha256,
      status: null, sameOrigin: false, redirect: false, complete: false, bytes: 0, sha256: null, matchesExpected: false,
      credentials: 'omit', readerReleased: false, aborted: false };
    report.servedAssets.push(row); activeHttp.add(abort);
    let reader, timedOut = false; const digest = createHash('sha256'), deadline = Date.now() + 8000;
    const timer = setTimeout(() => { timedOut = true; abort.abort(); }, 8000);
    try {
      const response = await fetch(ORIGIN + expected.route, { method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store',
        signal: abort.signal, headers: { accept: '*/*', 'user-agent': 'ForwayHostedChecks/1' } });
      row.status = response.status; row.sameOrigin = new URL(response.url).origin === ORIGIN;
      row.redirect = response.redirected;
      need(response.status === 200 && response.url === ORIGIN + expected.route && !response.redirected, 'asset_response_identity');
      const length = response.headers.get('content-length');
      need(length === null || (/^\d+$/.test(length) && Number(length) <= 2097152), 'asset_declared_limit');
      need(response.body, 'asset_body_missing'); reader = response.body.getReader();
      while (true) {
        const chunk = await reader.read();
        need(!interrupted && !globalExpired, 'asset_interrupted'); need(!timedOut && Date.now() <= deadline, 'asset_timeout');
        if (chunk.done) { row.complete = true; break; }
        row.bytes += chunk.value.byteLength; need(row.bytes <= 2097152, 'asset_body_limit'); digest.update(chunk.value);
      }
      row.sha256 = digest.digest('hex'); row.matchesExpected = row.bytes === expected.bytes && row.sha256 === expected.sha256;
      need(row.matchesExpected, 'served_asset_source_mismatch');
    } catch (error) { row.error = timedOut ? 'asset_timeout' : finite(error); throw new Error(row.error); }
    finally {
      clearTimeout(timer); abort.abort(); row.aborted = true;
      if (row.sha256 === null) row.sha256 = digest.digest('hex');
      if (reader) {
        let cancelled = false;
        try { cancelled = await Promise.race([reader.cancel().then(() => true, () => false), pause(1000).then(() => false)]); }
        finally { try { reader.releaseLock(); row.readerReleased = cancelled; } catch { row.readerReleased = false; } }
      } else row.readerReleased = true;
      activeHttp.delete(abort);
    }
    need(row.readerReleased && !timedOut, 'asset_stream_cleanup_unverified');
  }
}
function validateBoundary(boundary, title) {
  need(boundary.schemaVersion === 1 && boundary.kind === 'forway-hosted-browser-boundary', 'boundary_schema');
  need(boundary.expectedDeployment === deployment, 'boundary_deployment_pin');
  for (const field of ['rootNavigationCount', 'realApiRequests', 'controlledApiRequests', 'controlledApiSettled', 'controlledApiCancelled',
    'unexpectedRequests', 'credentialRequests', 'webSockets', 'pageErrorCount', 'responseErrors'])
    need(Number.isSafeInteger(boundary[field]) && boundary[field] >= 0 && boundary[field] <= 100000, 'boundary_counter');
  need(Array.isArray(boundary.pageErrorFingerprints) && boundary.pageErrorFingerprints.length === Math.min(boundary.pageErrorCount, 8)
    && boundary.pageErrorFingerprints.every(item => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item)), 'boundary_error_fingerprints');
  need(Array.isArray(boundary.pageErrorDiagnostics) && boundary.pageErrorDiagnostics.length === Math.min(boundary.pageErrorCount, 4)
    && boundary.pageErrorDiagnostics.every((item, index) => item && Object.keys(item).sort().join(',') === 'message,name,sha256'
      && typeof item.name === 'string' && Buffer.byteLength(item.name) <= 64 && typeof item.message === 'string' && Buffer.byteLength(item.message) <= 384
      && !/[\x00-\x1f\x7f]/.test(item.name + item.message) && item.sha256 === boundary.pageErrorFingerprints[index]), 'boundary_error_diagnostics');
  need(Array.isArray(boundary.assets) && boundary.assets.length === 9, 'boundary_asset_count');
  const assets = new Map(assetManifest.map(item => [item.route, item])), seen = new Set();
  for (const item of boundary.assets) {
    need(item && assets.has(item.route) && !seen.has(item.route), 'boundary_asset_identity'); seen.add(item.route);
    const expected = assets.get(item.route);
    need(item.status === 200 && item.bytes === expected.bytes && item.sha256 === expected.sha256 && item.matchesExpected === true, 'boundary_asset_source_mismatch');
  }
  need(Array.isArray(boundary.realApiResponses) && boundary.realApiResponses.length <= 2, 'boundary_api_shape');
  const index = TITLES.indexOf(title), fixture = index === 1 ? fixtureManifest[0] : index === 3 ? fixtureManifest[1] : null;
  need(boundary.realApiRequests === (fixture ? 1 : 0) && boundary.realApiResponses.length === (fixture ? 1 : 0), 'boundary_live_api_count');
  for (const item of boundary.realApiResponses)
    need(item.fixture === fixture.route && item.status === 200 && item.pageStatus === 200 && item.htmlBytes === fixture.bytes
      && item.htmlSha256 === fixture.sha256 && item.robots === fixture.robots
      && Number.isInteger(item.redirects) && item.redirects >= 0 && item.redirects <= 4, 'boundary_live_api_identity');
  // B07's controlled timing is evidence about client ordering, separately from
  // the two actual DNS/HTTPS fixture imports above.
  need(boundary.controlledApiRequests === (index === 6 ? 3 : 0), 'boundary_controlled_api_count');
  // Settled includes the two observed cancellations; it is not a disjoint count.
  need(boundary.controlledApiSettled === boundary.controlledApiRequests
    && boundary.controlledApiCancelled === (index === 6 ? 2 : 0), 'boundary_controlled_api_terminal');
  return boundary.rootNavigationCount === 1 && boundary.unexpectedRequests === 0 && boundary.credentialRequests === 0
    && boundary.webSockets === 0 && boundary.pageErrorCount === 0 && boundary.pageErrorFingerprints.length === 0
    && boundary.pageErrorDiagnostics.length === 0 && boundary.responseErrors === 0;
}
function browserResults() {
  need(fs.existsSync(browserFile), 'browser_report_missing');
  const bytes = read(browserFile, BROWSER_LIMIT);
  report.browser = { raw: compressed(bytes, 262144), accepted: false, cases: [] };
  const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  need(Array.isArray(value.errors) && Array.isArray(value.suites) && value.config?.rootDir === tools, 'browser_report_shape');
  report.browser.globalErrors = value.errors.slice(0, 8).map(error => scrub(error.message, 1800));
  const expected = new Set(EXPECTED_CASES.map(({ project, title }) => project + '\0' + title)), seen = new Set();
  let valid = value.errors.length === 0;
  function walk(suite) {
    need(Array.isArray(suite.specs) && (suite.suites === undefined || Array.isArray(suite.suites)), 'browser_suite_shape');
    for (const spec of suite.specs) {
      need(typeof spec.title === 'string' && Array.isArray(spec.tests) && spec.tests.length <= 2, 'browser_spec_shape');
      need(typeof spec.file === 'string' && path.resolve(tools, spec.file) === specFile, 'browser_spec_identity');
      for (const test of spec.tests) {
        const key = test.projectName + '\0' + spec.title;
        need(expected.has(key) && !seen.has(key), 'browser_case_identity'); seen.add(key);
        need(Array.isArray(test.results) && test.results.length === 1, 'browser_attempt_count');
        const actual = test.results[0];
        const row = { title: spec.title, project: test.projectName, expectedStatus: test.expectedStatus, status: test.status,
          actualStatus: actual.status, retry: actual.retry, durationMs: actual.duration, errors: (actual.errors ?? []).slice(0, 3).map(error => scrub(error.message, 1800)) };
        report.browser.cases.push(row);
        valid &&= spec.ok === true && test.expectedStatus === 'passed' && test.status === 'expected' && actual.status === 'passed'
          && actual.retry === 0 && Array.isArray(actual.errors) && actual.errors.length === 0;
        try {
          need(Array.isArray(actual.attachments), 'boundary_attachment_shape');
          const boundaries = actual.attachments.filter(item => item.name === 'forway-hosted-browser-boundary');
          need(boundaries.length === 1, 'boundary_attachment_count');
          const raw = attachmentBytes(boundaries[0]), boundary = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
          row.boundary = boundary; row.boundaryBytes = raw.length; row.boundarySha256 = sha(raw);
          valid = validateBoundary(boundary, spec.title) && valid;
        } catch (error) { row.boundaryError = finite(error); valid = false; }
        try {
          need(Array.isArray(actual.attachments) && actual.attachments.length <= 2, 'browser_attachment_shape');
          const extras = actual.attachments.filter(item => item.name !== 'forway-hosted-browser-boundary');
          need(extras.length === 0 || ['failed', 'timedOut', 'interrupted'].includes(actual.status), 'passed_case_extra_attachment');
          row.diagnosticAttachments = extras.map(item => {
            need(item.name === 'error-context' && item.contentType === 'text/markdown' && typeof item.path === 'string'
              && path.basename(item.path) === 'error-context.md' && item.body === undefined, 'unexpected_browser_diagnostic');
            const metadata = outputFileMetadata(item.path, 1048576);
            return { name: item.name, contentType: item.contentType, fileName: 'error-context.md', bytes: metadata.bytes, contentsRetained: false };
          });
        } catch (error) { row.attachmentError = finite(error); valid = false; }
      }
    }
    for (const child of suite.suites ?? []) walk(child);
  }
  for (const suite of value.suites) walk(suite);
  const stats = value.stats; report.browser.stats = stats;
  need(stats && stats.expected === 8 && stats.unexpected === 0 && stats.flaky === 0 && stats.skipped === 0, 'browser_stats');
  valid &&= seen.size === expected.size;
  Object.assign(report.browser, { accepted: valid, stats, expectedCases: [...expected].map(key => { const [project, title] = key.split('\0'); return { project, title }; }) });
  need(valid, 'browser_case_failure');
}
function generate() {
  const bytes = read(path.join(repo, SPEC), 131072); need(sha(bytes) === SPEC_SHA, 'browser_source_hash');
  fs.writeFileSync(specFile, bytes, { flag: 'wx', mode: 0o600 });
  const config = `import { defineConfig, devices } from '@playwright/test';\nexport default defineConfig({\n testDir: ${JSON.stringify(tools)}, testMatch: 'hosted-browser.spec.mjs', forbidOnly: true, fullyParallel: false, workers: 1, retries: 0, timeout: 120000, globalTimeout: 480000, expect: { timeout: 15000 },\n reporter: [['line'], ['json', { outputFile: ${JSON.stringify(browserFile)} }]], outputDir: ${JSON.stringify(outputDirectory)},\n use: { baseURL: ${JSON.stringify(ORIGIN)}, acceptDownloads: true, serviceWorkers: 'block', reducedMotion: 'reduce', trace: 'off', screenshot: 'off', video: 'off' },\n projects: [{ name: 'desktop-chromium', grep: /(?:^|\\s)B0[1-7](?:\\s|$)/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } }, { name: 'narrow-chromium', grep: /(?:^|\\s)B08(?:\\s|$)/, use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, isMobile: false, hasTouch: false } }]\n});\n`;
  fs.writeFileSync(configFile, config, { flag: 'wx', mode: 0o600 });
  report.generated = { sourceSpec: SPEC, sourceSha256: SPEC_SHA, actualGeneratedSha256: sha(read(specFile, 131072)),
    copiedByteExact: read(specFile, 131072).equals(bytes), configSha256: sha(config) };
  need(report.generated.copiedByteExact, 'generated_spec_changed');
}
try {
  await guard('before');
  need(JSON.parse(read(path.join(repo, 'package.json'), 32768)).name === 'forway', 'package_identity');
  prepareManifests();
  report.runtime.nodeSha256 = sha(read(process.execPath, 268435456));
  const npm = fs.realpathSync(path.join(path.dirname(process.execPath), 'npm'));
  need(fs.statSync(npm).isFile(), 'npm_cli_missing'); report.runtime.npmCliSha256 = sha(read(npm, 1048576));
  report.runtime.npm = (await run('npm_version', process.execPath, [npm, '--version'], 15, { cwd: tools })).output[0].toString().trim();
  await run('install_playwright', process.execPath, [npm, 'install', '--prefix', tools, '--no-save', '--package-lock=false', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', '@playwright/test@1.61.1'], 150, { cwd: tools });
  const pkg = JSON.parse(read(path.join(tools, 'node_modules/@playwright/test/package.json'), 32768));
  need(pkg.name === '@playwright/test' && pkg.version === '1.61.1', 'playwright_version');
  report.runtime.toolPackages = ['@playwright/test', 'playwright', 'playwright-core'].map(name => {
    const bytes = read(path.join(tools, 'node_modules', name, 'package.json'), 32768), value = JSON.parse(bytes);
    need(value.name === name && value.version === '1.61.1', 'playwright_dependency_version');
    return { name, version: value.version, packageJsonSha256: sha(bytes) };
  });
  const cli = path.join(tools, 'node_modules/@playwright/test/cli.js'); report.runtime.playwright = pkg.version; report.runtime.playwrightCliSha256 = sha(read(cli, 1048576));
  await run('install_chromium_and_runner_libraries', process.execPath, [cli, 'install', '--with-deps', 'chromium'], 210, { cwd: tools });
  generate();
  await verifyServedAssets();
  await guard('before_browser');
  need(workEnd - Date.now() >= 486500, 'browser_window_unavailable'); browserAttempted = true;
  const browser = await run('browser_cases', process.execPath, [cli, 'test', '--config', configFile], 480, { cwd: tools, retainFailure: true });
  browserResults(); need(browser.accepted, 'browser_cli_failed');
  await guard('after_browser');
} catch (error) { report.errors.push(finite(error)); }
finally {
  cleanupEnd = Math.min(Date.now() + 90000, workEnd + 90000);
  if (browserAttempted && !report.browser) {
    try { if (fs.existsSync(browserFile)) browserResults(); } catch (error) { report.errors.push('retained_' + finite(error)); }
  }
  try { await guard('after', true); } catch (error) { report.errors.push(finite(error)); }
  report.processCleanup = { passed: active.size === 0 && report.commands.every(row => row.released), started: report.commands.length };
  for (const request of activeHttp) request.abort();
  report.networkCleanup = { passed: activeHttp.size === 0 && (report.servedAssets ?? []).every(row => row.readerReleased),
    basis: 'Asset fetch response streams are aborted/cancelled and reader locks released; not an inventory of shared HTTP agent sockets.' };
  try { await cleanupBrowsers(); } catch (error) { report.errors.push(finite(error)); }
  try {
    owner(); need(report.processCleanup.passed && report.browserProcessCleanup?.passed === true && report.networkCleanup.passed, 'process_cleanup_unverified');
    fs.rmSync(root, { recursive: true }); need(!fs.existsSync(root), 'scratch_still_present'); report.scratchCleanup = 'passed';
  } catch (error) { report.scratchCleanup = 'unverified'; report.errors.push(finite(error)); }
  try { if (report.scratchCleanup === 'passed') await guard('after_cleanup', true, true); } catch (error) { report.errors.push(finite(error)); }
  report.processCleanup = { passed: active.size === 0 && report.commands.every(row => row.released), started: report.commands.length };
  if (interrupted) report.errors.push('interrupted');
  if (globalExpired || Date.now() > workEnd + 90000) report.errors.push('global_deadline');
  report.interrupted = interrupted; report.completedAtUtc = new Date().toISOString();
  report.status = !report.errors.length && report.browser?.accepted === true && report.processCleanup.passed && report.browserProcessCleanup?.passed === true
    && report.networkCleanup.passed && report.servedAssets?.length === 9 && report.servedAssets.every(row => row.matchesExpected && row.complete)
    && report.scratchCleanup === 'passed' ? 'passed' : 'failed';
  let text = JSON.stringify(report);
  if (Buffer.byteLength(text) > REPORT_LIMIT) { text = JSON.stringify({ schemaVersion: report.schemaVersion, sourceCommit, expectedDeployment: deployment, status: 'failed', errors: ['report_limit'] }); report.status = 'failed'; }
  const outputTimer = setTimeout(() => { process.stderr.write('controller_stdout_deadline\n'); process.exit(1); }, Math.max(1, Math.min(2000, workEnd + 92000 - Date.now())));
  process.stdout.write('FORWAY_HOSTED_REPORT=' + text + '\n', () => {
    clearTimeout(outputTimer); clearTimeout(globalTimer);
    for (const [signal, handler] of handlers) process.removeListener(signal, handler);
    process.exitCode = report.status === 'passed' && !interrupted && !globalExpired && Date.now() <= workEnd + 92000 ? 0 : 1;
  });
}
