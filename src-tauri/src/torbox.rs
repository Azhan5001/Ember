use anyhow::{bail,Result};use serde_json::{json,Value};
const BASE:&str="https://api.torbox.app/v1/api/torrents";
async fn response(request:reqwest::RequestBuilder)->Result<Value>{
 let mut response=request.timeout(std::time::Duration::from_secs(15)).send().await?;let status=response.status();
 if status==401||status==403{bail!("TorBox rejected the API key.")}if status==429{bail!("TorBox is limiting requests.")}
 let mut bytes=Vec::new();while let Some(chunk)=response.chunk().await?{if bytes.len()+chunk.len()>2_000_000{bail!("TorBox response too large.")}bytes.extend_from_slice(&chunk);}
 let result:Value=serde_json::from_slice(&bytes)?;if result["error"]=="DOWNLOAD_NOT_CACHED"{bail!("DOWNLOAD_NOT_CACHED")}if !status.is_success()||result["success"]!=true{bail!("TorBox could not open this release.")}Ok(result["data"].clone())
}
fn basename(s:&str)->String{s.rsplit(['/', '\\']).next().unwrap_or("").to_lowercase()}
pub async fn resolve(client:&reqwest::Client,token:&str,hash:&str,index:Option<u64>,filename:Option<&str>,movie:bool,queue:bool)->Result<Value>{
 if hash.len()!=40||!hash.bytes().all(|b|b.is_ascii_hexdigit())||token.is_empty()||token.len()>512{bail!("Invalid TorBox request.")}
 let form=reqwest::multipart::Form::new().text("magnet",format!("magnet:?xt=urn:btih:{hash}")).text("add_only_if_cached",if queue{"false"}else{"true"}).text("allow_zip","false");
 let created=response(client.post(format!("{BASE}/createtorrent")).bearer_auth(token).multipart(form)).await?;if queue{return Ok(json!({"queued":true}))}
 let id=created["torrent_id"].as_u64().ok_or_else(||anyhow::anyhow!("TorBox returned no torrent ID."))?;
 let list=response(client.get(format!("{BASE}/mylist")).bearer_auth(token).query(&[("id",id.to_string()),("bypass_cache","true".into())])).await?;
 let release=if let Some(list)=list.as_array(){list.iter().find(|x|x["id"].as_u64()==Some(id)).cloned().unwrap_or(Value::Null)}else{list};
 if let Some(found)=release["hash"].as_str(){if !found.eq_ignore_ascii_case(hash){bail!("TorBox returned another release.")}}
 let files:Vec<_>=release["files"].as_array().into_iter().flatten().filter(|f|f["id"].as_u64().is_some()&&["mkv","mp4","webm","m4v","avi","mov","ts","mpg","wmv"].iter().any(|ext|basename(f["short_name"].as_str().or(f["name"].as_str()).unwrap_or("")).ends_with(&format!(".{ext}")))).collect();
 let named:Vec<_>=files.iter().copied().filter(|f|filename.is_some_and(|n|basename(n)==basename(f["short_name"].as_str().or(f["name"].as_str()).unwrap_or("")))).collect();
 let file=if named.len()==1{Some(named[0])}else if let Some(i)=index{files.iter().copied().find(|f|f["id"].as_u64()==Some(i))}else if files.len()==1{Some(files[0])}else if movie{files.iter().copied().max_by_key(|f|f["size"].as_u64().unwrap_or(0))}else{None};
 let file=file.and_then(|f|f["id"].as_u64()).ok_or_else(||anyhow::anyhow!("Could not identify the episode in this release."))?;
 let link=response(client.get(format!("{BASE}/requestdl")).bearer_auth(token).query(&[("token",token.to_string()),("torrent_id",id.to_string()),("file_id",file.to_string()),("zip_link","false".into())])).await?;
 let url=crate::network::checked(link.as_str().unwrap_or(""))?;if url.scheme()!="https"{bail!("TorBox did not return a secure stream.")}Ok(json!({"url":url.as_str()}))
}
