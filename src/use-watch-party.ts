import {useEffect,useRef,useState} from 'react';
import {cloud} from './store';
import {partyMedia,mediaKey} from './party-core.mjs';
export function useWatchParty(account:any,state:any,session:any){
 const [snapshot,setSnapshot]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(false);
 const [rooms,setRooms]=useState<any>({owner:'',items:[]}),[listError,setListError]=useState('');
 const accountId=useRef(account?.id);accountId.current=account?.id;
 const refreshRooms=async()=>{
  const owner=accountId.current;if(!owner)return;
  const {data,error}=await cloud().rpc('ember_party_list_v1');
  if(accountId.current!==owner||!mounted.current)return;
  if(error){setListError(error.code==='PGRST202'?'Run the included watch-party SQL update to see parties on your other devices.':'Could not refresh your account parties.');return;}
  setListError('');setRooms({owner,items:Array.isArray(data)?data:[]});
 };
 const client=useRef(crypto.randomUUID()),current=useRef<any>(null),sample=useRef({ready:false,duration:0,position:0,key:''}),lastReply=useRef(0),offset=useRef(0),mounted=useRef(true),identity=useRef(''),lifecycle=useRef(0),mediaBusy=useRef('');current.current=snapshot;
 async function rpc(action:string,payload:any={},room=current.current?.room.id){
  const attempt=lifecycle.current,sent=Date.now();
  const {data,error}=await cloud().rpc('ember_party_v1',{p_room:room||null,p_client:client.current,p_action:action,p_payload:payload});
  if(error)throw Error(error.code==='PGRST202'?'Watch parties need the included ember-watch-party.sql database update.':error.message);
  if(!mounted.current||attempt!==lifecycle.current)return data;
  if(data.left){setSnapshot(null);current.current=null;setConnected(false);return data}
  if(Date.parse(data.server_now)>=Date.parse(current.current?.server_now||'1970-01-01')){offset.current=Date.parse(data.server_now)-(sent+Date.now())/2;setSnapshot(data);current.current=data}
  lastReply.current=Date.now();setConnected(true);setError('');return data;
 }
 const call=async(action:string,payload:any={})=>{try{return await rpc(action,payload)}catch(e:any){if(mounted.current)setError(e.message);return null}};
 const command=async(action:string,payload:any={})=>call(action,{...payload,epoch:current.current?.room.epoch});
 const leave=async()=>{lifecycle.current++;const room=current.current?.room.id;setSnapshot(null);current.current=null;setConnected(false);if(room)try{await rpc('leave',{},room)}catch{}};
 const start=async(code?:string)=>{if(!account||!state?._people?.owner){setError('Sign in and choose a profile to use watch parties.');return}if(snapshot)await leave();setBusy(true);const media=partyMedia(session);if(!code&&!media){setError('Play a movie or episode first.');setBusy(false);return}await call(code?'join':'create',{code,profile:state._people.activeId,name:state.profile,media,position:sample.current.position});setBusy(false)};
 useEffect(()=>{const key=`${account?.id||''}:${state?._people?.activeId||''}`;if(identity.current&&identity.current!==key)void leave();identity.current=key},[account?.id,state?._people?.activeId]);
 useEffect(()=>{if(!account?.id)return;void refreshRooms();const timer=setInterval(()=>void refreshRooms(),5000);return()=>clearInterval(timer)},[account?.id]);
 useEffect(()=>{
  if(!snapshot?.room.id)return;const room=snapshot.room.id;let alive=true,inFlight=false;
  const pulse=async()=>{if(!alive||inFlight)return;inFlight=true;const s=current.current;try{await rpc('pulse',{epoch:s?.room.epoch,ready:sample.current.ready&&sample.current.key===mediaKey(s?.room.media),duration:sample.current.duration},room)}catch(e:any){if(alive){setError(e.message);if(Date.now()-lastReply.current>6000)setConnected(false)}}finally{inFlight=false}};
  const channel=cloud().channel(`ember-party:${room}:${client.current}`).on('postgres_changes',{event:'UPDATE',schema:'public',table:'ember_party_rooms',filter:`id=eq.${room}`},()=>void pulse()).subscribe();
  const timer=setInterval(()=>{if(Date.now()-lastReply.current>6000)setConnected(false);void pulse()},1500);void pulse();window.addEventListener('online',pulse);
  return()=>{alive=false;clearInterval(timer);window.removeEventListener('online',pulse);void cloud().removeChannel(channel)};
 },[snapshot?.room.id]);
 useEffect(()=>()=>{mounted.current=false;const room=current.current?.room.id;if(room)void cloud().rpc('ember_party_v1',{p_room:room,p_client:client.current,p_action:'leave',p_payload:{}})},[]);
 useEffect(()=>{if(!snapshot||snapshot.room.host_client!==client.current||!session)return;const media=partyMedia(session),key=mediaKey(media);if(key&&key!==mediaKey(snapshot.room.media)&&mediaBusy.current!==key){mediaBusy.current=key;void command('media',{media,position:0}).finally(()=>{mediaBusy.current=''})}},[session?.vid,snapshot?.room.id,snapshot?.room.host_client]);
 return{snapshot,error,busy,connected,rooms:rooms.owner===account?.id?rooms.items:[],listError,refreshRooms,client:client.current,isHost:snapshot?.room.host_client===client.current,serverNow:()=>Date.now()+offset.current,start,leave,command,report:(value:any)=>{sample.current=value}};
}
export type WatchParty=ReturnType<typeof useWatchParty>;
