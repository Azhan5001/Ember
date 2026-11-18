import {chromium} from '@playwright/test';
import {spawn} from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function launch(profile,{chooseGuest=true}={}){
 const listener=net.createServer();await new Promise(r=>listener.listen(0,'127.0.0.1',r));const port=listener.address().port;await new Promise(r=>listener.close(r));
 const child=spawn(path.resolve(process.env.EMBER_TEST_BINARY||'src-tauri/target/debug/ember.exe'),[],{env:{...process.env,EMBER_DATA_DIR:profile,WEBVIEW2_USER_DATA_FOLDER:path.join(profile,"webview"),...(process.env.EMBER_USE_BUNDLED_MPV?{}:{EMBER_MPV:path.resolve('vendor/mpv/mpv.exe')}),WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS:`--remote-debugging-port=${port} --disk-cache-size=33554432`},windowsHide:true,stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',d=>stderr+=d);child.stdout.on('data',d=>stderr+=d);
 let browser;
 for(let i=0;i<160;i++){if(child.exitCode!==null)throw Error(`Ember exited: ${stderr}`);try{browser=await chromium.connectOverCDP(`http://127.0.0.1:${port}`);break}catch{await delay(250)}}
 if(!browser){child.kill();throw Error('WebView2 debug endpoint not available: '+stderr)}
 let page;for(let i=0;i<80;i++){page=browser.contexts()[0]?.pages()[0];if(page)break;await delay(100)}
 await page.waitForFunction(()=>!!window.ember,{timeout:20000});
 if(chooseGuest){const guest=page.locator('.profilegateway .profilechoice').filter({hasText:'Guest'});await guest.waitFor({timeout:10000});await guest.click();}
 return {page,child,browser,async read(){return page.evaluate(()=>window.ember.read())},async close(){await page.evaluate(()=>window.__TAURI_INTERNALS__.invoke('plugin:window|close',{label:'main'}));for(let i=0;i<100&&child.exitCode===null;i++)await delay(100);if(child.exitCode===null){child.kill();throw Error('Close did not flush and exit')}await browser.close().catch(()=>{})},async forceClose(){child.kill();await browser.close().catch(()=>{})},get stderr(){return stderr}};
}

