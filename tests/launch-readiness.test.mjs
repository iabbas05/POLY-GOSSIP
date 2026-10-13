import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read=name=>readFile(new URL(`../${name}`,import.meta.url),'utf8');

test('all production hosts and the cleanup schedule are configured',async()=>{
  const config=await read('wrangler.jsonc');
  for(const host of ['gossipbh.com','www.gossipbh.com','admin.gossipbh.com','partner.gossipbh.com'])assert.match(config,new RegExp(host.replaceAll('.','\\.')));
  assert.match(config,/"crons"/);
});

test('secrets are never persisted in frontend or schema',async()=>{
  const files=await Promise.all(['index.html','admin.html','partner.html','0002_launch_readiness.sql'].map(read));
  for(const source of files)assert.doesNotMatch(source,/RESEND_API_KEY|AUTH_SECRET/);
});

test('launch-critical routes are connected',async()=>{
  const [worker,social,partner]=await Promise.all(['index.js','social.js','partner.js'].map(read));
  assert.match(worker,/partnerApi/);
  assert.match(worker,/scheduled/);
  assert.match(social,/account\/delete-request/);
  assert.match(social,/mediaSignature/);
  assert.match(partner,/route==='redeem'/);
});

test('PWA has install icons and an offline cache',async()=>{
  const [manifest,worker]=await Promise.all(['manifest.json','sw.js'].map(read));
  assert.match(manifest,/icon-192\.png/);
  assert.match(manifest,/icon-512\.png/);
  assert.match(worker,/caches\.match/);
});
