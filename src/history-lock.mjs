import {verifyPin} from './profile-core.mjs';

export function historyLock(state) {
  const configuration=state.settings?.historyLock || {mode:'off'};
  const owner=state._people?.owner;
  const profile=owner && state._people.accounts[owner]?.profiles.find(p=>p.id===state._people.activeId);
  const mode=['separate','profile'].includes(configuration.mode)?configuration.mode:'off';
  return {mode,credential:mode==='profile'?profile?.pin:configuration.pin,
    scope:`${owner || 'local'}:${state._people?.activeId || 'guest'}`,profile};
}
export function historyAccessKey(state) {
  const lock=historyLock(state);
  return `${lock.scope}:${lock.mode}:${lock.credential?.salt || ''}:${lock.credential?.hash || ''}`;
}
const fallback=new Map();
const storageKey=scope=>'ember-history-attempts:'+scope;
function attempts(scope) {
  try { return JSON.parse(sessionStorage.getItem(storageKey(scope)) || 'null') || fallback.get(scope) || {failures:0,until:0}; }
  catch { return fallback.get(scope) || {failures:0,until:0}; }
}
function save(scope,value) {
  fallback.set(scope,value);
  try {sessionStorage.setItem(storageKey(scope),JSON.stringify(value));}catch{}
}
export const cooldown = (scope,now=Date.now()) => Math.max(0,Math.ceil((attempts(scope).until-now)/1000));
export async function unlockHistory(state,pin,now=Date.now()) {
  const lock=historyLock(state);
  if(lock.mode==='off')return true;
  if(cooldown(lock.scope,now)>0)throw Error('Too many attempts. Wait one minute before trying again.');
  if(!lock.credential)throw Error('The profile PIN is unavailable. Restore its profile PIN to unlock history.');
  if(await verifyPin(pin,lock.credential)){save(lock.scope,{failures:0,until:0});return true;}
  const failures=attempts(lock.scope).failures+1;
  save(lock.scope,failures>=5?{failures:0,until:now+60000}:{failures,until:0});
  throw Error(failures>=5?'Too many attempts. Wait one minute before trying again.':'Incorrect PIN.');
}
