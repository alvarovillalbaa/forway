// T2 only: real loopback HTTP and actual app handlers; upstream bytes are authored.
import http from 'node:http';
import { readFile, appendFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createCrawlHandler } from '../../api/crawl.mjs';
import { createAuditHandler } from '../../api/audit.mjs';
import { createAnswerHandler } from '../../api/answer.mjs';
import { fetchPublicDocument, fetchPublicPage } from '../../src/fetch-page.mjs';
import { queryProvider } from '../../src/provider-answer.mjs';
const output = process.env.FORWAY_V2_OUTPUT, control = process.env.FORWAY_V2_CONTROL;
const publicRoot = resolve('public'), events = output + '/server-events.jsonl';
let closing = false, pending = 0;
const emit = value => appendFile(events, JSON.stringify(value) + '\n');
const controls = async () => JSON.parse(await readFile(control, 'utf8'));
async function held(kind) { pending++; try { while (!closing && (await controls()).hold === kind) await new Promise(r => setTimeout(r, 25)); } finally { pending--; } }
const xml = (host, paths, index = false) => `<?xml version="1.0" encoding="UTF-8"?><${index ? 'sitemapindex' : 'urlset'} xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<${index ? 'sitemap' : 'url'}><loc>https://${host}${path.replaceAll('&','&amp;')}</loc></${index ? 'sitemap' : 'url'}>`).join('')}</${index ? 'sitemapindex' : 'urlset'}>`;
const html = (host, path) => `<!doctype html><html lang="en"><head><title>Authored Forway fixture</title><script>window.IMPORTED_EXECUTED=true;fetch('https://foreign.example.com/executed')</script></head><body><h1>Authored ${path}</h1><p>Observable source with a deliberately missing description.</p>${host === 'owned.example.com' && path === '/' ? '<a href="/about#x">About</a><a href="/guide?topic=one#x">Guide</a><a href="/alias">Alias</a><a href="/private">Private</a><a href="https://foreign.example.com/">Foreign</a>' : ''}<img src="https://foreign.example.com/inert.png"></body></html>`;
const response = (text, type, status = 200, extra = []) => ({ status, headers: [['content-type',type], ...extra], body: Buffer.from(text), close() {} });
const adapters = {
  resolve: async host => { if (!['owned.example.com','many.example.com','slow.example.com'].includes(host)) throw Error('Unlisted authored hostname'); return [{ address:'93.184.216.34', family:4 }]; },
  request: async (url, options) => {
    await emit({ type:'document', url:url.href, kind:options.documentKind ?? 'legacy-page', pinned:options.address === '93.184.216.34' && options.family === 4 });
    const host=url.hostname, path=url.pathname;
    if (host === 'slow.example.com' && path === '/') { await held('crawl'); await emit({ type:'held-document-released', url:url.href }); }
    if (path === '/robots.txt') return response(host === 'owned.example.com' ? 'User-agent: *\nDisallow: /private\nSitemap: https://owned.example.com/index.xml' : '', 'text/plain', host === 'owned.example.com' ? 200 : 404);
    if (path === '/index.xml' && host === 'owned.example.com') return response(xml(host,['/a.xml','/b.xml'],true),'application/xml');
    if (path === '/a.xml' && host === 'owned.example.com') return response(xml(host,['/about','/private']),'application/xml');
    if (path === '/b.xml' && host === 'owned.example.com') return response(xml(host,['/guide?topic=one','/alias']),'application/xml');
    if (path === '/sitemap.xml') return response(xml(host, host === 'many.example.com' ? Array.from({length:30},(_,i)=>'/p'+i) : []),'application/xml');
    if (path === '/alias') return response('', 'text/html',302,[['location','/final']]);
    if (path === '/private' || host === 'owned.example.com' && !['/','/about','/guide','/final'].includes(path)) throw Error('Forbidden/unlisted authored page');
    return response(html(host,path),'text/html');
  },
};
const key = provider => `fixture-${provider}-credential-never-echo-20261115`;
async function providerFetch(target, options) {
  const body = JSON.parse(options.body), headers=options.headers;
  const provider = target === 'https://api.openai.com/v1/responses' ? 'openai' : target === 'https://api.anthropic.com/v1/messages' ? 'anthropic' : target.startsWith('https://generativelanguage.googleapis.com/v1beta/models/') ? 'google' : null;
  if (!provider) throw Error('Unexpected provider target');
  const query = provider === 'openai' ? body.input : provider === 'anthropic' ? body.messages[0].content : body.contents[0].parts[0].text;
  const expected = provider === 'google' ? headers['x-goog-api-key'] === key(provider) && headers.authorization === undefined : headers.authorization === 'Bearer '+key(provider) && headers['x-goog-api-key'] === undefined;
  await emit({type:'provider',provider,target,model:body.model ?? target.split('/models/')[1].split(':')[0],query,keyMatches:expected,redirect:options.redirect,workspaceMatches:provider !== 'anthropic' || headers['anthropic-workspace-id'] === 'wrkspc_authored1234567890'});
  if (!expected) throw Error('Wrong authored credential');
  if (query === 'Held exact query') { await held('provider'); await emit({type:'held-provider-released'}); }
  const second=query === 'Second exact query';
  if (second && provider !== 'openai') return Response.json({error:{message:'PRIVATE_UPSTREAM_DETAIL'}},{status:provider === 'google' ? 403 : 503});
  const answer='Cedar is an authored example. See https://owned.example.com/about';
  return Response.json(provider === 'openai' ? {status:second?'incomplete':'completed',model:'authored-gpt-snapshot',error:null,output:[{type:'message',status:'completed',role:'assistant',content:[{type:'output_text',text:answer,annotations:[{type:'url_citation',url:'https://owned.example.com/',title:'Authored source'}]}]}],usage:{input_tokens:11,output_tokens:7,total_tokens:18}} : provider === 'anthropic' ? {type:'message',role:'assistant',model:'authored-claude-snapshot',stop_reason:'end_turn',content:[{type:'text',text:answer,citations:[{type:'web_search_result_location',url:'https://owned.example.com/',title:'Authored source'}]}],usage:{input_tokens:11,output_tokens:7}} : {candidates:[{finishReason:'STOP',content:{parts:[{text:answer}]},citationMetadata:{citationSources:[{uri:'https://owned.example.com/'}]}}],usageMetadata:{promptTokenCount:11,candidatesTokenCount:7,totalTokenCount:18},modelVersion:'authored-gemini-snapshot'});
}
const crawl=createCrawlHandler({fetchDocument:(input,options)=>fetchPublicDocument(input,{...adapters,...options})});
const audit=createAuditHandler({fetchPage:(input,options)=>fetchPublicPage(input,{...adapters,...options})});
const answer=createAnswerHandler({query:(input,options)=>queryProvider(input,{...options,fetch:providerFetch})});
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer(async(req,res)=>{
  try {
    const path=new URL(req.url,'http://127.0.0.1:4173').pathname;
    if(path==='/api/crawl')return await crawl(req,res);
    if(path==='/api/answer')return await answer(req,res);
    if(path==='/api/audit')return await audit(req,res);
    const file=resolve(publicRoot,'.'+(path==='/'?'/index.html':decodeURIComponent(path)));
    if(!file.startsWith(publicRoot+sep)) { res.writeHead(404);res.end();return; }
    const content=await readFile(file);res.setHeader('content-type',mime[extname(file)]??'application/octet-stream');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.end(content);
  } catch { if(!res.destroyed&&!res.writableEnded){res.statusCode=404;res.end('Not found');} }
});
server.listen(4173,'127.0.0.1',()=>console.log('FORWAY_V2_SERVER_READY'));
process.once('SIGTERM',()=>{closing=true;server.close(async()=>{while(pending)await new Promise(r=>setTimeout(r,25));console.log('FORWAY_V2_SERVER_CLOSED');});server.closeAllConnections();});
