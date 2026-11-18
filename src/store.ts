import {isTauri} from '@tauri-apps/api/core';
import { CLOUD_URL,CLOUD_KEY } from "./cloud-config";
import {migrate} from "./defaults";
import {ensurePeople,compactForStorage} from "./profile-core.mjs";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
export const defaults = {
  addons: [],
  progress: {},
  history: {},
  library: [],
  profile: "You",
  settings: {
    quality: 0,
    native: false,
    cloudUrl: "",
    cloudKey: "",
  },
};
export async function load() {
  try {
    return ensurePeople(migrate({
      ...defaults,
      ...(window.ember
        ? await window.ember.read()
        : JSON.parse(localStorage.getItem("ember") || "null")),
    }),migrate(defaults));
  } catch (error) {
    if(window.ember) throw error;
    return ensurePeople(migrate(defaults),migrate(defaults));
  }
}
export async function save(state: any) {
  const compact=compactForStorage(state);
  if (window.ember) await window.ember.write(compact);
  else localStorage.setItem("ember", JSON.stringify(compact));
}
let cached: SupabaseClient | null = null;
export function cloud(_state?: any): SupabaseClient {
  cached ||= createClient(CLOUD_URL,CLOUD_KEY,{auth:{storageKey:"ember-account-v1",storage:isTauri()?{getItem:async(key:string)=>{const {invoke}=await import("@tauri-apps/api/core");return invoke<string|null>("auth_storage",{action:"get",key})},setItem:async(key:string,value:string)=>{const {invoke}=await import("@tauri-apps/api/core");await invoke("auth_storage",{action:"set",key,value})},removeItem:async(key:string)=>{const {invoke}=await import("@tauri-apps/api/core");await invoke("auth_storage",{action:"remove",key})}}:undefined,persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});
  return cached;
}
