// Native DOM/HTTP/clipboard/download/file chooser. All upstream evidence is T2.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const { chromium } = createRequire(process.env.FORWAY_PLAYWRIGHT_PACKAGE)('@playwright/test');
const output=process.env.FORWAY_V2_OUTPUT, control=process.env.FORWAY_V2_CONTROL;
const base='http://127.0.0.1:4173', result={passed:false,browserClosed:false,cases:[],externalRequests:[],pageErrors:[],responses:[]};
const key=provider=>`fixture-${provider}-credential-never-echo-20261115`;
const events=async()=>{try{return(await readFile(output+'/server-events.jsonl','utf8')).trim().split('\n').filter(Boolean).map(JSON.parse);}catch(error){if(error.code==='ENOENT')return[];throw error;}};
const setControl=value=>writeFile(control,JSON.stringify(value));
async function waitFor(check,label){const end=Date.now()+15_000;while(Date.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,40));}throw Error('Timed out: '+label);}
async function status(page,text){await waitFor(async()=>text.test(await page.locator('#crawl-status').textContent()),'crawl status '+text);}
async function analyze(page,host,keyboard=false){await page.locator('#page-url').fill('https://'+host+'/');if(keyboard)await page.locator('#page-url').press('Enter');else await page.locator('#url-form button').click();}
async function reset(page){await page.locator('#new-workspace').click();if(await page.locator('#confirm-dialog').isVisible())await page.locator('#confirm-action').click();await waitFor(async()=>(await page.locator('#crawl-status').textContent()).includes('No site has been contacted'),'reset');}
async function save(page,selector,name){const download=page.waitForEvent('download');await page.locator(selector).click();const value=await download;const file=output+'/'+name;await value.saveAs(file);return JSON.parse(await readFile(file,'utf8'));}
async function choose(page,file){const event=page.waitForEvent('filechooser');await page.locator('#crawl-open').click();await(await event).setFiles(file);}
async function prepare(page,queries,providers=['openai','anthropic','google']){
  await page.locator('[data-view="evidence"]').click();await page.locator('#comparison-brand').fill('Cedar');await page.locator('#comparison-domain').fill('owned.example.com');await page.locator('#comparison-queries').fill(queries.join('\n'));
  for(const provider of providers){await page.locator(`[data-provider="${provider}"] [data-field="selected"]`).check();await page.locator('#'+provider+'-model').fill('authored-'+(provider==='openai'?'gpt':provider==='anthropic'?'claude':'gemini'));await page.locator('#'+provider+'-key').fill(key(provider));}
  if(providers.includes('anthropic'))await page.locator('#anthropic-workspace').fill('wrkspc_authored1234567890');
  await page.locator('#provider-form button[type="submit"]').click();await page.locator('#provider-review').waitFor({state:'visible'});
}
async function runComparison(page){await page.locator('#provider-confirm').check();await page.locator('#provider-run').click();}
async function comparisonIdle(page){await waitFor(async()=>await page.locator('#provider-stop').isDisabled(),'comparison settled');}
let browser;
async function nativeCase(id,width,run){
  const row={id,width,passed:false,contextClosed:false};result.cases.push(row);const context=await browser.newContext({viewport:{width,height:1000},permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});const pending=[];
  try{
    await context.route('**/*',async route=>{const target=new URL(route.request().url());if(target.origin!==base){result.externalRequests.push(target.href);return route.abort('blockedbyclient');}return route.continue();});
    const page=await context.newPage();page.on('pageerror',error=>result.pageErrors.push({id,message:error.message}));page.on('dialog',dialog=>dialog.dismiss());
    page.on('response',response=>pending.push((async()=>{try{const bytes=await response.body();const text=bytes.toString('utf8');for(const provider of ['openai','anthropic','google'])assert(!text.includes(key(provider)));result.responses.push({id,url:response.url(),status:response.status(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}catch(error){if(/credential|assert/i.test(error.message))throw error;}})()));
    await setControl({});await page.goto(base);await page.locator('#page-url').waitFor();await run(page,row);
    await page.screenshot({path:output+'/'+id+'.png',fullPage:false});await Promise.all(pending);row.passed=true;
  }catch(error){row.error=error.stack;throw error;}finally{await context.close();row.contextClosed=true;}
}
try{
  browser=await chromium.launch({headless:true});result.chromium=browser.version();
  await nativeCase('F01-discovery',1280,async(page,row)=>{
    const before=(await events()).length;assert.equal(await page.locator('#analysis-scope').inputValue(),'site');await analyze(page,'owned.example.com');await status(page,/4 analyzed \/ 6 discovered.*0 pending.*1 refused.*0 failed.*1 redirected aliases.*Discoverable frontier drained/);
    const state=await save(page,'#crawl-save','F01-crawl.json');assert.equal(state.pages.length,4);assert.equal(state.rows.length,6);assert(state.rows.some(r=>r.status==='refused'&&r.url.endsWith('/private')));assert(state.rows.some(r=>r.status==='redirected'&&r.url.endsWith('/alias')));
    const calls=(await events()).slice(before).filter(e=>e.type==='document');assert(calls.every(e=>e.pinned&&!e.url.includes('foreign.')&&!e.url.endsWith('/private')));assert.equal(calls.filter(e=>e.url==='https://owned.example.com/guide?topic=one').length,1);assert.equal(await page.evaluate(()=>window.IMPORTED_EXECUTED),undefined);
    const report=await page.locator('#crawl-report').innerText();assert(report.includes('4 analyzed / 6 discovered'));assert(report.includes('Live visibility: not measured'));assert(report.includes('What to work on next'));row.requests=calls.length;row.denominator={audited:4,discovered:6,refused:1,redirected:1};
  });
  await nativeCase('F02-batch-resume',1280,async(page,row)=>{
    const before=(await events()).length;await analyze(page,'many.example.com');await status(page,/23 analyzed \/ 31 discovered.*8 pending.*request limit/);
    const partial=await save(page,'#crawl-save','F02-partial.json');assert.equal(partial.pages.length,23);assert.equal(partial.rows.filter(r=>r.status==='pending').length,8);assert.equal(partial.batch.chargedRequests,25);
    await page.locator('#crawl-resume').click();await status(page,/31 analyzed \/ 31 discovered.*0 pending.*Discoverable frontier drained/);const full=await save(page,'#crawl-save','F02-complete.json');assert.equal(full.pages.length,31);
    const calls=(await events()).slice(before).filter(e=>e.type==='document');assert.equal(calls.filter(e=>e.url.endsWith('/robots.txt')).length,2);row.pages=31;row.firstBatch={requests:25,done:23,pending:8};
  });
  await nativeCase('F03-cancel-file-intent',1280,async(page,row)=>{
    const before=(await events()).length;await setControl({hold:'crawl'});await analyze(page,'slow.example.com');await waitFor(async()=>(await events()).slice(before).some(e=>e.type==='document'&&e.url==='https://slow.example.com/'),'held crawl accepted');
    await page.locator('#crawl-stop').click();await status(page,/0 analyzed.*1 pending/);await setControl({});await waitFor(async()=>(await events()).slice(before).some(e=>e.type==='held-document-released'),'late transport released');await status(page,/0 analyzed.*1 pending/);
    await page.locator('#crawl-resume').click();await status(page,/1 analyzed.*0 pending.*Discoverable frontier drained/);const captured=await save(page,'#crawl-save','F03-captured.json');assert.equal(captured.pages.length,1);
    await reset(page);const count=(await events()).length;await choose(page,output+'/F03-captured.json');await status(page,/slow.example.com.*1 analyzed.*Imported source is supplied/);assert.equal((await events()).length,count);const supplied=await save(page,'#crawl-save','F03-supplied.json');assert.equal(supplied.pages[0].sourceKind,'supplied');assert.equal(supplied.pages[0].fetchedAt,null);
    await reset(page);await page.evaluate(()=>{const original=File.prototype.text;File.prototype.text=async function(){window.FILE_READ_STARTED=true;await new Promise(r=>{window.RELEASE_FILE_READ=r;});return original.call(this);};});
    await choose(page,output+'/F03-captured.json');await page.waitForFunction(()=>window.FILE_READ_STARTED===true);await analyze(page,'owned.example.com');await status(page,/owned.example.com.*4 analyzed.*Discoverable frontier drained/);await page.evaluate(()=>window.RELEASE_FILE_READ());await waitFor(async()=>(await page.locator('#crawl-status').textContent()).startsWith('owned.example.com'),'newer URL retains authority');row.lateFileReadFenced=true;row.restoredWithoutNetwork=true;
  });
  await nativeCase('F04-provider-cohorts',1280,async(page,row)=>{
    const before=(await events()).filter(e=>e.type==='provider').length;await prepare(page,['First exact query','Second exact query']);assert.equal((await events()).filter(e=>e.type==='provider').length,before);assert(await page.locator('#provider-run').isDisabled());const plan=await page.locator('#provider-plan').innerText();assert(!plan.includes('credential'));assert(plan.includes('Second exact query'));
    await runComparison(page);await comparisonIdle(page);assert.match(await page.locator('#provider-status').innerText(),/3 successful \/ 6 planned.*1 failed.*2 unknown.*0 not started/);
    const data=await save(page,'#provider-save','F04-comparison.json');assert.equal(data.cells.length,6);assert.equal(data.cells.filter(c=>c.status==='success').length,3);for(const cell of data.cells.filter(c=>c.status==='success')){assert(cell.result.answer.includes('Cedar'));assert(cell.result.usage);assert(cell.result.citations.length);assert(cell.result.reportedModel.endsWith('-snapshot'));assert(Number.isFinite(Date.parse(cell.result.capturedAt)));}
    const serialized=JSON.stringify(data);assert(!serialized.includes('PRIVATE_UPSTREAM_DETAIL'));assert(!serialized.includes('wrkspc_'));for(const provider of ['openai','anthropic','google']){assert(!serialized.includes(key(provider)));assert.equal(await page.locator('#'+provider+'-key').inputValue(),'');}
    const calls=(await events()).filter(e=>e.type==='provider').slice(before);assert.equal(calls.length,6);assert(calls.every(e=>e.keyMatches&&e.workspaceMatches&&e.redirect==='error'));const summaries=await page.locator('.provider-summary').innerText();assert.equal(summaries.split('1/1 successful answers mention the brand').length-1,3);row.providerCalls=6;row.success=3;row.failed=1;row.unknown=2;
  });
  await nativeCase('F05-provider-cancel',1280,async(page,row)=>{
    const before=(await events()).filter(e=>e.type==='provider').length;await setControl({hold:'provider'});await prepare(page,['Held exact query','Remaining exact query'],['openai']);await runComparison(page);await waitFor(async()=>(await events()).filter(e=>e.type==='provider').length===before+1,'provider dispatch');await page.locator('#provider-stop').click();await comparisonIdle(page);assert.match(await page.locator('#provider-status').innerText(),/0 successful \/ 2 planned.*1 unknown.*1 not started/);
    await setControl({});await waitFor(async()=>(await events()).some(e=>e.type==='held-provider-released'),'late provider released');assert.match(await page.locator('#provider-status').innerText(),/1 unknown.*1 not started/);await page.locator('#openai-key').fill(key('openai'));await runComparison(page);await comparisonIdle(page);const calls=(await events()).filter(e=>e.type==='provider').slice(before);assert.deepEqual(calls.map(e=>e.query),['Held exact query','Remaining exact query']);const data=await save(page,'#provider-save','F05-cancelled.json');assert.deepEqual(data.cells.map(c=>c.status),['unknown','success']);row.calls=2;row.uncertainNotRetried=true;
  });
  await nativeCase('F06-390-keyboard-clipboard',390,async(page,row)=>{
    await analyze(page,'owned.example.com',true);await status(page,/4 analyzed.*Discoverable frontier drained/);const button=page.locator('#crawl-report').getByRole('button',{name:'Copy prompt',exact:true}).first();await button.focus();await page.keyboard.press('Enter');await waitFor(async()=>await page.evaluate(()=>navigator.clipboard.readText()).then(text=>text.includes('https://owned.example.com/')),'native copied prompt');
    const copied=await page.evaluate(()=>navigator.clipboard.readText());row.clipboard={bytes:Buffer.byteLength(copied),sha256:createHash('sha256').update(copied).digest('hex')};assert(copied.includes('source'));row.horizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(row.horizontalOverflow,false);
    await page.locator('#analysis-scope').selectOption('page');await analyze(page,'owned.example.com',true);await page.locator('#confirm-dialog').waitFor({state:'visible'});assert.equal(await page.locator('#confirm-action').innerText(),'Replace page & draft');await page.locator('#confirm-action').click();await page.locator('#site-report').waitFor({state:'visible'});assert.equal(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(n=>n.id);return ids.length-new Set(ids).size;}),0);
    await page.locator('[data-view="evidence"]').click();row.providerHorizontalOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);assert.equal(row.providerHorizontalOverflow,false);assert(await page.locator('#comparison-brand').isVisible());
  });
  assert.equal(result.externalRequests.length,0);assert.equal(result.pageErrors.length,0);result.passed=true;
}catch(error){result.error=error.stack;}
finally{if(browser){await browser.close();result.browserClosed=true;}await writeFile(output+'/native-result.json',JSON.stringify(result,null,2));console.log('FORWAY_V2_NATIVE '+JSON.stringify(result));}
if(!result.passed)process.exitCode=1;
