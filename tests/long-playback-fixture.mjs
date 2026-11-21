import fs from 'node:fs';import {execFileSync} from 'node:child_process';import{fileURLToPath}from'node:url';
const target=new URL('./safari-long-0710.mkv',import.meta.url);
if(!fs.existsSync(target))execFileSync(process.env.FFMPEG||'ffmpeg',['-hide_banner','-loglevel','error','-y','-stream_loop','2','-i',fileURLToPath(new URL('./safari-fixture.mkv',import.meta.url)),'-t','100','-map','0','-c','copy',fileURLToPath(target)]);
