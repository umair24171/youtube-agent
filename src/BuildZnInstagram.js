import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sha256 } from './BuildZnPipeline.js';
export function validateReview(dir) {
 const review=JSON.parse(fs.readFileSync(path.join(dir,'review.json')));
 if (review.video !== path.basename(review.video)) throw new Error('Invalid media path');
 if (sha256(path.join(dir,review.video)) !== review.videoSha256) throw new Error('Video changed: review again');
 if (crypto.createHash('sha256').update(review.caption).digest('hex') !== review.captionSha256) throw new Error('Caption changed: review again');
 return review;
}
export class BuildZnInstagram {
 constructor({fetchImpl=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),env=process.env}={}) {
  this.fetch=fetchImpl;this.wait=wait;this.env=env;
  const version=env.INSTAGRAM_API_VERSION || 'v21.0';
  if(!/^v\d+\.0$/.test(version))throw new Error('Invalid Graph API version');
  this.base=`https://graph.instagram.com/${version}`;
 }
 async request(endpoint,params={},method='GET') {
  const token=this.env.INSTAGRAM_GRAPH_TOKEN;
  if(!token)throw new Error('INSTAGRAM_GRAPH_TOKEN missing');
  const url=new URL(this.base+'/'+endpoint);
  const options={method,headers:{Authorization:`Bearer ${token}`},signal:AbortSignal.timeout(30000)};
  if(method==='GET')for(const [k,v] of Object.entries(params))url.searchParams.set(k,v);
  else options.body=new URLSearchParams(params);
  const response=await this.fetch(url,options);const data=await response.json();
  if(!response.ok || data.error)throw new Error(`Instagram request failed (HTTP ${response.status}; code ${data.error?.code || 'unknown'})`);
  return data;
 }
 async readiness() {
  if(!this.env.INSTAGRAM_GRAPH_USER_ID)throw new Error('INSTAGRAM_GRAPH_USER_ID missing');
  const account=await this.request(this.env.INSTAGRAM_GRAPH_USER_ID,{fields:'id,username'});
  return {connected:true,username:account.username,idMatches:String(account.id)===String(this.env.INSTAGRAM_GRAPH_USER_ID),publishingPermission:'Not proven by identity check; verify instagram_business_content_publish in Meta app'};
 }
 async publish(dir,{approved=false,videoUrl}={}) {
  const review=validateReview(dir);
  if(!approved || review.status!=='approved')throw new Error('Explicit approval required');
  if(!videoUrl || !videoUrl.startsWith('https://'))throw new Error('Provide approved HTTPS video URL; no automatic public CDN uploads');
  if(!this.env.INSTAGRAM_GRAPH_USER_ID)throw new Error('INSTAGRAM_GRAPH_USER_ID missing');
  const receiptPath=path.join(dir,'publish-receipt.json');
  // Exclusive filesystem creation serializes separate CLI processes as well as calls.
  const lockPath=path.join(dir,'publish.lock');
  let lock;
  try { lock=fs.openSync(lockPath,'wx',0o600); }
  catch(err) { if(err.code==='EEXIST')throw new Error('Publish already in progress; reconcile any stale lock before retry');throw err; }
  try {
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}));
  if(fs.existsSync(receiptPath))throw new Error('Publish attempt already recorded; reconcile before retry');
  const hosted=await this.fetch(videoUrl,{signal:AbortSignal.timeout(30000)});
  if(!hosted.ok)throw new Error('Approved media URL is not reachable');
  const bytes=await hosted.arrayBuffer();
  if(crypto.createHash('sha256').update(Buffer.from(bytes)).digest('hex')!==review.videoSha256)throw new Error('Hosted video differs from approved video');
  const {id}=await this.request(this.env.INSTAGRAM_GRAPH_USER_ID+'/media',{media_type:'REELS',video_url:videoUrl,caption:review.caption,share_to_feed:'true'},'POST');
  if(!id)throw new Error('Missing container ID');
  let finished=false;
  for(let i=0;i<60;i++){
   const status=await this.request(id,{fields:'status_code'});
   if(status.status_code==='FINISHED'){finished=true;break;}
   if(['ERROR','EXPIRED'].includes(status.status_code))throw new Error('Media processing failed');
   await this.wait(5000);
  }
  if(!finished)throw new Error('Media processing timeout');
  fs.writeFileSync(receiptPath,JSON.stringify({status:'publishing',containerId:id,videoSha256:review.videoSha256}));
  const result=await this.request(this.env.INSTAGRAM_GRAPH_USER_ID+'/media_publish',{creation_id:id},'POST');
  if(!result.id)throw new Error('Missing published media ID; reconcile receipt');
  fs.writeFileSync(receiptPath,JSON.stringify({status:'published',id:result.id}));
  const media=await this.request(result.id,{fields:'permalink'});
  fs.writeFileSync(receiptPath,JSON.stringify({status:'published',id:result.id,permalink:media.permalink,videoSha256:review.videoSha256}));
  return {id:result.id,permalink:media.permalink};
  } finally { fs.closeSync(lock);fs.unlinkSync(lockPath); }
 }
}
