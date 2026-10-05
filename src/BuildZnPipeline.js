import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createDemo } from './BuildZnDemo.js';
export const sha256 = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const run = (bin,args) => execFileSync(bin,args,{stdio:'pipe',maxBuffer:16*1024*1024});
const duration = p => Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',p]).toString().trim());
function localVoice(text,out) {
 const input = out+'.txt'; fs.writeFileSync(input,text);
 if (process.platform === 'darwin') run('say',['-v',process.env.BUILDZN_VOICE || 'Samantha','-r','165','-f',input,'-o',out+'.aiff']);
 else run('espeak-ng',['-s','165','-f',input,'-w',out+'.aiff']);
 run('ffmpeg',['-v','error','-y','-i',out+'.aiff','-c:a','aac','-b:a','128k',out]);
 const seconds=duration(out);if(!Number.isFinite(seconds)||seconds<=0)throw new Error('Local speech produced no audio; on macOS allow speech execution outside the sandbox');return seconds;
}
export async function generateBuildZn(outputDir) {
 fs.mkdirSync(outputDir,{recursive:true});
 const demo = createDemo(); const clips=[]; let cursor=0; const srt=[];
 const font = ['/System/Library/Fonts/Supplemental/Arial.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find(fs.existsSync);
 if (!font) throw new Error('Install a local TTF font');
 for (const [i,scene] of demo.scenes.entries()) {
  const audio=path.join(outputDir,`scene-${i}.m4a`);const length=localVoice(scene.narration,audio);
  const text=path.join(outputDir,`scene-${i}.txt`); fs.writeFileSync(text,scene.lines.join('\n'));
  const narration=path.join(outputDir,`caption-${i}.txt`);
  const words=scene.narration.split(' '); const lines=[];let line='';
  for(const word of words){if((line+' '+word).trim().length>38){lines.push(line);line=word;}else line=(line+' '+word).trim();}if(line)lines.push(line);
  fs.writeFileSync(narration,lines.join('\n'));
  const lineFilters=(rows,prefix,y,size,gap)=>rows.map((line,j)=>{
   const file=path.join(outputDir,`${prefix}-${i}-${j}.txt`);fs.writeFileSync(file,line);
   return `drawtext=fontfile='${font}':textfile='${file}':fontsize=${size}:fontcolor=white:x=80:y=${y+j*gap}`;
  });
  const vf=[`drawbox=x=48:y=280:w=984:h=790:color=0x142b31:t=fill`,
   `drawtext=fontfile='${font}':text='BuildZn':fontsize=64:fontcolor=0x62e3ca:x=64:y=110`,
   `drawtext=fontfile='${font}':text='${scene.label}':fontsize=38:fontcolor=0x62e3ca:x=80:y=320`,
   ...lineFilters(scene.lines,'display',460,42,76),
   ...lineFilters(lines,'subtitle',1230,36,54),
   `drawtext=fontfile='${font}':text='SYNTHETIC SAMPLE - HUMAN REVIEW':fontsize=26:fontcolor=0x9ab6bf:x=80:y=1650`].join(',');
  const clip=path.join(outputDir,`scene-${i}.mp4`);
  run('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=0x091a20:s=1080x1920:r=30','-i',audio,'-vf',vf,'-t',String(length),'-c:v','libx264','-preset','ultrafast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-movflags','+faststart',clip]);
  clips.push(clip);srt.push({start:cursor,end:cursor+length,text:scene.narration});cursor+=length;
 }
 const list=path.join(outputDir,'concat.txt');fs.writeFileSync(list,clips.map(p=>`file '${p.replace(/'/g,"'\\''")}'`).join('\n'));
 const video=path.join(outputDir,'buildzn-inquiry-demo.mp4');
 run('ffmpeg',['-v','error','-y','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',video]);
 const stamp=s=>new Date(Math.round(s*1000)).toISOString().slice(11,23).replace('.',',');
 fs.writeFileSync(path.join(outputDir,'captions.srt'),srt.map((s,i)=>`${i+1}\n${stamp(s.start)} --> ${stamp(s.end)}\n${s.text}\n`).join('\n'));
 fs.writeFileSync(path.join(outputDir,'sample-result.json'),JSON.stringify(demo.lead,null,2));
 fs.writeFileSync(path.join(outputDir,'script.json'),JSON.stringify(demo,null,2));
 const manifest={version:1,status:'pending_review',createdAt:new Date().toISOString(),video:path.basename(video),videoSha256:sha256(video),caption:demo.caption,captionSha256:crypto.createHash('sha256').update(demo.caption).digest('hex'),duration:duration(video),sample:true,voiceProvider:process.platform==='darwin'?'macOS local speech':'espeak-ng local speech',cost:0};
 fs.writeFileSync(path.join(outputDir,'review.json'),JSON.stringify(manifest,null,2));
 console.log(JSON.stringify(manifest,null,2));return manifest;
}
