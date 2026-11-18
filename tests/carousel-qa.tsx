import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import ProfileChooser from '../src/ProfileChooser';
import {migrate} from '../src/defaults';
import {ensurePeople,addProfile} from '../src/profile-core.mjs';
import '../src/style.css';
const blank=migrate({profile:'Guest',settings:{},addons:[],library:[],progress:{}});
let initial=ensurePeople(blank,blank);
for(const [index,name] of ['Alex','Sam','Jordan'].entries()){
  initial=addProfile(initial,'preview-account',{id:'preview-'+index,name,avatar:index},blank);
}
function Test(){
 const [state,setState]=useState(initial);
 return <div className="app" style={{width:360,height:800}}><ProfileChooser state={state} setState={setState} account={{id:'preview-account',email:'Preview account'}} onClose={()=>{}} onAuth={()=>{}}/></div>;
}
createRoot(document.getElementById('root')!).render(<Test/>);
