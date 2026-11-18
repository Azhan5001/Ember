#[cfg(windows)]pub fn memory()->serde_json::Value{
 use windows_sys::Win32::{Foundation::{CloseHandle,INVALID_HANDLE_VALUE},System::{Diagnostics::ToolHelp::{CreateToolhelp32Snapshot,Process32FirstW,Process32NextW,PROCESSENTRY32W,TH32CS_SNAPPROCESS},Threading::{OpenProcess,PROCESS_QUERY_INFORMATION,PROCESS_VM_READ},ProcessStatus::{GetProcessMemoryInfo,PROCESS_MEMORY_COUNTERS}}};
 let mut entries=Vec::new();let mut result=Vec::new();
 unsafe{let snap=CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS,0);if snap==INVALID_HANDLE_VALUE{return serde_json::json!([])}let mut e:PROCESSENTRY32W=std::mem::zeroed();e.dwSize=std::mem::size_of::<PROCESSENTRY32W>()as u32;let mut ok=Process32FirstW(snap,&mut e);while ok!=0{let n=e.szExeFile.iter().position(|c|*c==0).unwrap_or(e.szExeFile.len());entries.push((e.th32ProcessID,e.th32ParentProcessID,String::from_utf16_lossy(&e.szExeFile[..n])));ok=Process32NextW(snap,&mut e);}CloseHandle(snap);}
 let mut ids=std::collections::HashSet::from([std::process::id()]);loop{let before=ids.len();for(id,parent,_)in &entries{if ids.contains(parent){ids.insert(*id);}}if before==ids.len(){break}}
 for(id,_,name)in entries{if !ids.contains(&id){continue}unsafe{let h=OpenProcess(PROCESS_QUERY_INFORMATION|PROCESS_VM_READ,0,id);if h.is_null(){continue}let mut m:PROCESS_MEMORY_COUNTERS=std::mem::zeroed();let size=std::mem::size_of::<PROCESS_MEMORY_COUNTERS>()as u32;if GetProcessMemoryInfo(h,&mut m,size)!=0{result.push(serde_json::json!({"type":name,"pid":id,"KiB":m.WorkingSetSize/1024}));}CloseHandle(h);}}
 serde_json::json!(result)
}
#[cfg(not(windows))]pub fn memory()->serde_json::Value{serde_json::json!([])}
