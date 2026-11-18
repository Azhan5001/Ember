import React,{useEffect,useRef,useState} from 'react';
export default function PlayerNotices({message}:{message:string}){
 const [older,setOlder]=useState<{text:string;id:number}[]>([]),last=useRef('');
 useEffect(()=>{
  if(message&&message!==last.current){
   const previous=last.current;
   if(previous)setOlder(rows=>[...rows.filter(r=>r.text!==previous&&r.text!==message),{text:previous,id:Date.now()}].slice(-2));
  }
  last.current=message;
  const timer=setTimeout(()=>setOlder([]),2400);
  return()=>clearTimeout(timer);
 },[message]);
 if(!message)return null;
 return <div className="player-notices"><div aria-hidden="true">{older.map(r=><div className="notice-previous" key={r.id}>{r.text}</div>)}</div><div role="status" className="notice-current">{message}</div></div>;
}
