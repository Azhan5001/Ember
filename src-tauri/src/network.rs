use anyhow::{Result, bail};
use reqwest::{Client, header::HeaderMap};
use std::time::Duration;
use url::Url;

pub fn checked(raw: &str) -> Result<Url> {
 let u=Url::parse(raw)?;
 if !["http","https"].contains(&u.scheme()) || !u.username().is_empty() || u.password().is_some() {bail!("Only HTTP(S) URLs without embedded credentials are supported")}
 Ok(u)
}
pub fn client() -> Result<Client> { Ok(Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(20)).pool_max_idle_per_host(2).pool_idle_timeout(Duration::from_secs(30)).user_agent(concat!("Ember/",env!("CARGO_PKG_VERSION"))).build()?) }
pub fn headers(v: &serde_json::Value)->Result<HeaderMap> {
 let mut h=HeaderMap::new();
 if let Some(o)=v.as_object(){ for(k,v) in o { if let Some(v)=v.as_str(){h.insert(reqwest::header::HeaderName::from_bytes(k.as_bytes())?,v.parse()?);} } }
 Ok(h)
}
pub async fn download(client:&Client,raw:&str,mut h:HeaderMap)->Result<(Vec<u8>,String)> {
 let mut u=checked(raw)?;
 for _ in 0..6 {
  let mut r=client.get(u.clone()).headers(h.clone()).send().await.map_err(|_|anyhow::anyhow!("{}: connection failed",u.host_str().unwrap_or("Provider")))?;
  if r.status().is_redirection(){
   let next=checked(u.join(r.headers().get("location").ok_or_else(||anyhow::anyhow!("Missing redirect"))?.to_str()?)?.as_str())?;
   if u.scheme()=="https" && next.scheme()!="https" {bail!("Insecure redirect")}
   if u.origin()!=next.origin(){h.clear()}
   u=next;continue
  }
  if !r.status().is_success(){bail!("HTTP {}",r.status().as_u16())}
  let ty=r.headers().get("content-type").and_then(|v|v.to_str().ok()).unwrap_or("").to_string();
  if r.content_length().unwrap_or(0)>10_000_000 {bail!("Response too large")}
  let mut data=Vec::new();
  while let Some(c)=r.chunk().await?{if data.len()+c.len()>10_000_000 {bail!("Response too large")}data.extend_from_slice(&c)}
  return Ok((data,ty))
 }
 bail!("Too many redirects")
}
#[cfg(test)] mod tests {use super::*;#[test]fn urls(){assert!(checked("file:///tmp/x").is_err());assert!(checked("https://user:secret@a.test").is_err());assert!(checked("https://a.test/path?token=private").is_ok());}}
