import {invoke} from '@tauri-apps/api/core';
let pending:Promise<unknown>=Promise.resolve();
function durable<T>(command:string,args:Record<string,unknown>):Promise<T>{const next=pending.then(()=>invoke<T>(command,args));pending=next.catch(()=>{});return next;}
export const secureAuth={getItem:(key:string)=>invoke<string|null>('auth_storage',{action:'get',key}),setItem:(key:string,value:string)=>durable<void>('auth_storage',{action:'set',key,value}),removeItem:(key:string)=>durable<void>('auth_storage',{action:'remove',key})};
