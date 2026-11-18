import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {transformSync} from 'esbuild';
const context={module:{exports:{}},Date};vm.runInNewContext(transformSync(fs.readFileSync('src/defaults.ts','utf8'),{loader:'ts',format:'cjs'}).code,context);const {migrate,essentials}=context.module.exports;
test('upgrading installs the checked anime catalog once and keeps configured provider secrets and disabled state',()=>{
 const privateAddon={base:'https://provider.invalid/private-token',manifest:{id:'com.stremio.torrentio.addon',types:['series'],resources:['stream']},enabled:false};
 const old={addonDefaultsVersion:2,addons:[privateAddon],settings:{}};const upgraded=migrate(old);
 assert.equal(upgraded.addonDefaultsVersion,3);assert.ok(upgraded.addons.some(a=>a.manifest.id==='animes-season-addon'));assert.equal(upgraded.addons.find(a=>a.base===privateAddon.base),privateAddon);
 const removed={...upgraded,addons:upgraded.addons.filter(a=>a.manifest.id!=='animes-season-addon')};assert.equal(migrate(removed).addons.some(a=>a.manifest.id==='animes-season-addon'),false);
});
test('official starter manifests retain genre/pagination declarations and anime stream IDs',()=>{
 const cinema=essentials.find(a=>a.manifest.id==='com.linvo.cinemeta');assert.ok(cinema.manifest.catalogs.some(c=>c.extra?.some(e=>e.name==='genre'&&e.options.includes('Romance'))));assert.ok(cinema.manifest.catalogs.some(c=>c.extra?.some(e=>e.name==='skip')));
 assert.equal(essentials.some(a=>a.manifest.resources.some(r=>(typeof r==='string'?r:r.name)==='stream')),false);
});
