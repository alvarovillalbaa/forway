import { readFile, readdir, access } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
let modules = 0, imports = 0;
async function inspect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) { await inspect(file); continue; }
    if (!entry.name.endsWith('.mjs')) continue;
    execFileSync(process.execPath, ['--check', fileURLToPath(file)]);
    modules++;
    const source = await readFile(file, 'utf8');
    for (const match of source.matchAll(/(?:import|export)\s+(?:[^;'"\n]+?\s+from\s+)?['"](\.[^'"]+)['"]/g)) {
      await access(new URL(match[1], file)); imports++;
    }
  }
}
for (const path of ['public/src/', 'src/', 'api/', 'scripts/', 'tests/']) await inspect(new URL(path, root));
JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
JSON.parse(await readFile(new URL('vercel.json', root), 'utf8'));
for (const path of ['README.md', 'AGENTS.md', 'docs/spec.md', 'docs/architecture.md', 'public/index.html', 'public/styles.css']) {
  if (!(await readFile(new URL(path, root), 'utf8')).trim()) throw new Error(`Empty required file: ${path}`);
}
const html = await readFile(new URL('public/index.html', root), 'utf8');
for (const match of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g)) await access(new URL(`public${match[1]}`, root));
console.log(`${modules} modules parsed; ${imports} relative imports and HTML assets resolve. JSON/documents checked. No product module or test executed.`);
