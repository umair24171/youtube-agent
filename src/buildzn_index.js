import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';
import { generateBuildZn } from './BuildZnPipeline.js';
import { BuildZnInstagram,validateReview } from './BuildZnInstagram.js';
const [command='generate',directory='tmp/buildzn-review']=process.argv.slice(2);
const dir=path.resolve(directory);
try {
 if(command==='generate')await generateBuildZn(dir);
 else if(command==='readiness')console.log(JSON.stringify(await new BuildZnInstagram().readiness(),null,2));
 else if(command==='approve'){
  if(!process.argv.includes('--approve'))throw new Error('Review reel and caption, then pass --approve');
  const review=validateReview(dir);review.status='approved';review.approvedAt=new Date().toISOString();fs.writeFileSync(path.join(dir,'review.json'),JSON.stringify(review,null,2));
 }else if(command==='publish')console.log(await new BuildZnInstagram().publish(dir,{approved:process.argv.includes('--approve'),videoUrl:process.env.BUILDZN_APPROVED_VIDEO_URL}));
 else throw new Error('Unknown command');
}catch(err){console.error(err.message);process.exitCode=1;}
