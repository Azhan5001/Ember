import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const root=path.resolve(process.argv[2]||'src-tauri/target/release');
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const exe=fs.readFileSync(path.join(root,'ember.exe'));assert.equal(exe.subarray(0,2).toString(),'MZ');assert.equal(exe.readUInt16LE(exe.readUInt32LE(0x3c)+4),0x8664,'Expected Windows x64 executable');
assert.equal(hash(path.join(root,'mpv/mpv.exe')),'8c2e4d24eb961723cc5e2f1f4401982836e82c96e0e0a944c0576090fc48993f');
assert.ok(fs.statSync(path.join(root,'licenses/NOTICE.txt')).size>10000);
for(const file of ['resources/app.asar','resources.pak','chrome_100_percent.pak','node_modules','ffmpeg.exe'])assert.equal(fs.existsSync(path.join(root,file)),false,'Unexpected legacy/runtime dependency: '+file);
console.log(JSON.stringify({passed:true,architecture:'x64',appSHA256:hash(path.join(root,'ember.exe')),mpvSHA256:hash(path.join(root,'mpv/mpv.exe')),bundledMpvVerified:true,electronAbsent:true},null,2));
