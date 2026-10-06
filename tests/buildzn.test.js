import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';
import {processInquiry,sampleInquiry} from '../src/BuildZnDemo.js';
import {BuildZnInstagram} from '../src/BuildZnInstagram.js';
const hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function queue(){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'buildzn-test-'));fs.writeFileSync(path.join(dir,'reel.mp4'),'sample');fs.writeFileSync(path.join(dir,'review.json'),JSON.stringify({video:'reel.mp4',videoSha256:hash('sample'),caption:'demo',captionSha256:hash('demo'),status:'approved'}));return dir;}
test('sample workflow extracts real fields and waits for human',()=>{const r=processInquiry(sampleInquiry);assert.equal(r.budget,1500);assert.equal(r.status,'Awaiting human review');assert.equal(r.sample,true);assert.throws(()=>processInquiry({}));});
test('approval and tamper gates make zero network calls',async()=>{let calls=0;const client=new BuildZnInstagram({fetchImpl:async()=>{calls++;}});const dir=queue();try{await assert.rejects(client.publish(dir),/approval/);fs.writeFileSync(path.join(dir,'reel.mp4'),'changed');await assert.rejects(client.publish(dir,{approved:true,videoUrl:'https://example.com/v.mp4'}),/Video changed/);assert.equal(calls,0);}finally{fs.rmSync(dir,{recursive:true});}});
test('official publish polls, uses real permalink, prevents duplicate publish',async()=>{const replies=[{id:'container'},{status_code:'IN_PROGRESS'},{status_code:'FINISHED'},{id:'media'},{permalink:'https://www.instagram.com/reel/realcode/'}];const calls=[];const client=new BuildZnInstagram({env:{INSTAGRAM_GRAPH_TOKEN:'fake',INSTAGRAM_GRAPH_USER_ID:'123'},wait:async()=>{},fetchImpl:async(url,opts)=>{if(String(url).startsWith('https://example.com/'))return {ok:true,arrayBuffer:async()=>Buffer.from('sample')};calls.push([String(url),opts]);return {ok:true,status:200,json:async()=>replies.shift()};}});const dir=queue();try{const result=await client.publish(dir,{approved:true,videoUrl:'https://example.com/video.mp4'});assert.match(result.permalink,/realcode/);assert.equal(calls.length,5);assert.ok(calls.every(([u])=>!u.includes('fake')));await assert.rejects(client.publish(dir,{approved:true,videoUrl:'https://example.com/video.mp4'}),/already recorded/);}finally{fs.rmSync(dir,{recursive:true});}});
test('processing failure never publishes',async()=>{let calls=0;const client=new BuildZnInstagram({env:{INSTAGRAM_GRAPH_TOKEN:'fake',INSTAGRAM_GRAPH_USER_ID:'123'},fetchImpl:async(url)=>String(url).startsWith('https://example.com/')?{ok:true,arrayBuffer:async()=>Buffer.from('sample')}:{ok:true,status:200,json:async()=>++calls===1?{id:'c'}:{status_code:'ERROR'}}});const dir=queue();try{await assert.rejects(client.publish(dir,{approved:true,videoUrl:'https://example.com/v.mp4'}),/processing failed/);assert.equal(calls,2);}finally{fs.rmSync(dir,{recursive:true});}});

test('concurrent publisher is rejected before any network request',async()=>{
 const dir=queue();let release;let hostedCalls=0;
 const gate=new Promise(resolve=>{release=resolve;});
 const client=new BuildZnInstagram({env:{INSTAGRAM_GRAPH_TOKEN:'fake',INSTAGRAM_GRAPH_USER_ID:'123'},fetchImpl:async()=>{hostedCalls++;await gate;return {ok:false};}});
 try {
  const first=client.publish(dir,{approved:true,videoUrl:'https://example.com/v.mp4'});
  const failure=assert.rejects(first,/not reachable/);
  await assert.rejects(client.publish(dir,{approved:true,videoUrl:'https://example.com/v.mp4'}),/already in progress/);
  assert.equal(hostedCalls,1);release();await failure;
  assert.equal(fs.existsSync(path.join(dir,'publish.lock')),false);
 } finally {release();fs.rmSync(dir,{recursive:true});}
});
test('stale lock requires reconciliation and makes zero network calls',async()=>{
 const dir=queue();let calls=0;fs.writeFileSync(path.join(dir,'publish.lock'),'{}');
 try {await assert.rejects(new BuildZnInstagram({env:{INSTAGRAM_GRAPH_USER_ID:'123'},fetchImpl:async()=>{calls++;}}).publish(dir,{approved:true,videoUrl:'https://example.com/v.mp4'}),/stale lock/);assert.equal(calls,0);}
 finally {fs.rmSync(dir,{recursive:true});}
});
