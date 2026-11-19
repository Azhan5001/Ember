// Native apps serve provider video through a bounded, diskless relay. The provider URL
// and authentication headers stay in Rust, and the webview receives no-store responses.
use anyhow::{anyhow, bail, Result};
use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, HeaderMap, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use std::{collections::HashMap, sync::Arc, time::{Duration, Instant}};
use tokio::sync::Mutex;
use url::Url;
use uuid::Uuid;

#[derive(Clone)]
struct Source {
    url: Url,
    headers: HeaderMap,
    content_type: String,
    length: Option<u64>,
    ranges: bool,
    used: Instant,
}

pub struct Remote {
    client: reqwest::Client,
    sources: Mutex<HashMap<Uuid, Source>>,
}

pub struct Opened {
    pub id: Uuid,
    pub content_type: String,
    pub playlist: bool,
}

impl Remote {
    pub fn new() -> Result<Self> {
        Ok(Self {
            client: reqwest::Client::builder()
                .redirect(reqwest::redirect::Policy::none())
                .connect_timeout(Duration::from_secs(4))
                .read_timeout(Duration::from_secs(30))
                .pool_max_idle_per_host(2)
                .user_agent(concat!("Ember/", env!("CARGO_PKG_VERSION")))
                .build()?,
            sources: Mutex::new(HashMap::new()),
        })
    }

    pub fn routes(self: &Arc<Self>, token: String) -> Router {
        Router::new().route("/{token}/remote/{id}", get(stream))
            .with_state((self.clone(), token))
    }

    pub async fn open(&self, url: &str, mut headers: HeaderMap) -> Result<Opened> {
        let mut url = crate::network::checked(url)?;
        // Playback owns the range. Compressing it would change the byte offsets.
        headers.remove(header::RANGE);
        headers.remove(header::ACCEPT_ENCODING);
        let response = tokio::time::timeout(Duration::from_secs(7), async {
            let first = self.get(&mut url, &mut headers, Some(header::HeaderValue::from_static("bytes=0-0"))).await?;
            if first.status() == StatusCode::RANGE_NOT_SATISFIABLE {
                drop(first);
                return self.get(&mut url, &mut headers, None).await;
            }
            Ok::<_, anyhow::Error>(first)
        }).await.map_err(|_| anyhow!("The provider took too long to open this stream."))??;
        if !response.status().is_success() {
            bail!(match response.status().as_u16() {
                401 | 403 => "The provider rejected this stream. Check your debrid addon credentials.",
                404 | 410 | 425 => "The provider has not made this video available yet.",
                429 => "The provider is limiting requests. Try again shortly.",
                _ => "The provider could not open this video.",
            });
        }
        let kind = response.headers().get(header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()).unwrap_or_default();
        let kind = kind.split(';').next().unwrap_or_default().trim().to_ascii_lowercase();
        let path = url.path().to_ascii_lowercase();
        let playlist = kind.contains("mpegurl") || path.ends_with(".m3u8");
        if kind.starts_with("text/") && !playlist
            || matches!(kind.as_str(), "application/json" | "application/problem+json" | "application/xml")
            || response.status() == StatusCode::NO_CONTENT {
            bail!("The provider returned a message instead of video. Select a cached source.");
        }
        // HLS playlists refer to other files. Keep their original URL and normal HLS loader.
        let id = Uuid::new_v4();
        let content_type = if kind.is_empty() || kind == "application/octet-stream" {
            if path.ends_with(".mp4") || path.ends_with(".m4v") { "video/mp4".into() }
            else if path.ends_with(".webm") { "video/webm".into() }
            else if path.ends_with(".mkv") { "video/x-matroska".into() }
            else { "application/octet-stream".into() }
        } else { kind };
        if playlist { return Ok(Opened { id, content_type, playlist }); }
        let ranges = response.status() == StatusCode::PARTIAL_CONTENT;
        let length = if ranges {
            response.headers().get(header::CONTENT_RANGE).and_then(|v| v.to_str().ok())
                .and_then(|v| v.rsplit_once('/')).and_then(|(_, v)| v.parse().ok())
        } else { response.content_length() };
        if length == Some(0) { bail!("The provider returned an empty video."); }
        let mut sources = self.sources.lock().await;
        sources.retain(|_, source| source.used.elapsed() < Duration::from_secs(8 * 3600));
        if sources.len() >= 8 {
            if let Some(oldest) = sources.iter().min_by_key(|(_, source)| source.used).map(|(id, _)| *id) {
                sources.remove(&oldest);
            }
        }
        sources.insert(id, Source { url, headers, content_type: content_type.clone(), length, ranges, used: Instant::now() });
        Ok(Opened { id, content_type, playlist })
    }

    async fn get(&self, url: &mut Url, headers: &mut HeaderMap, range: Option<header::HeaderValue>) -> Result<reqwest::Response> {
        for _ in 0..6 {
            let mut request = self.client.get(url.clone()).headers(headers.clone()).header(header::ACCEPT_ENCODING, "identity");
            if let Some(value) = range.clone() { request = request.header(header::RANGE, value); }
            let response = request.send().await.map_err(|_| anyhow!("Could not connect to the video provider."))?;
            if !response.status().is_redirection() { return Ok(response); }
            let location = response.headers().get(header::LOCATION).and_then(|v| v.to_str().ok())
                .ok_or_else(|| anyhow!("The provider returned an invalid video redirect."))?;
            let next = crate::network::checked(url.join(location).map_err(|_| anyhow!("Invalid provider redirect."))?.as_str())?;
            if url.scheme() == "https" && next.scheme() != "https" { bail!("The provider returned an insecure video redirect."); }
            if url.origin() != next.origin() { headers.clear(); }
            *url = next;
        }
        bail!("The provider redirected the stream too many times.")
    }
}

async fn stream(
    State((remote, secret)): State<(Arc<Remote>, String)>,
    Path((token, id)): Path<(String, String)>,
    headers: HeaderMap,
    method: Method,
) -> Response {
    if token != secret { return StatusCode::NOT_FOUND.into_response(); }
    let Ok(id) = Uuid::parse_str(&id) else { return StatusCode::NOT_FOUND.into_response(); };
    let source = {
        let mut sources = remote.sources.lock().await;
        let Some(source) = sources.get_mut(&id) else { return StatusCode::NOT_FOUND.into_response(); };
        source.used = Instant::now();
        source.clone()
    };
    let mut response = Response::builder()
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .header(header::ACCESS_CONTROL_EXPOSE_HEADERS, "Content-Range, Accept-Ranges, Content-Length")
        .header(header::CACHE_CONTROL, "no-store")
        .header(header::CONTENT_TYPE, &source.content_type);
    if method == Method::HEAD {
        if let Some(length) = source.length { response = response.header(header::CONTENT_LENGTH, length); }
        if source.ranges { response = response.header(header::ACCEPT_RANGES, "bytes"); }
        return response.body(Body::empty()).unwrap();
    }
    let range = headers.get(header::RANGE).cloned();
    let mut url = source.url;
    let mut origin_headers = source.headers;
    let Ok(upstream) = remote.get(&mut url, &mut origin_headers, range).await else {
        return response.status(StatusCode::BAD_GATEWAY).body(Body::empty()).unwrap();
    };
    response = response.status(upstream.status());
    if !upstream.status().is_success() { return response.body(Body::empty()).unwrap(); }
    for name in [header::ACCEPT_RANGES, header::CONTENT_LENGTH, header::CONTENT_RANGE] {
        if let Some(value) = upstream.headers().get(&name) { response = response.header(name, value); }
    }
    response.body(Body::from_stream(upstream.bytes_stream())).unwrap()
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn serve(router: Router) -> String {
        let socket = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = socket.local_addr().unwrap();
        tokio::spawn(async move { axum::serve(socket, router).await.unwrap(); });
        format!("http://{address}")
    }

    #[tokio::test]
    async fn redirect_reuses_cdn_and_preserves_ranges_without_caching() {
        let cdn = serve(Router::new().route("/clip.mkv", get(|headers: HeaderMap| async move {
            assert!(!headers.contains_key(header::AUTHORIZATION));
            let range = headers.get(header::RANGE).unwrap().to_str().unwrap();
            let (content_range, body) = match range {
                "bytes=0-0" => ("bytes 0-0/6", "a"),
                "bytes=2-4" => ("bytes 2-4/6", "cde"),
                _ => panic!("Unexpected range {range}"),
            };
            Response::builder().status(StatusCode::PARTIAL_CONTENT)
                .header(header::CONTENT_RANGE, content_range).header(header::CONTENT_LENGTH, body.len())
                .body(Body::from(body)).unwrap()
        }))).await;
        let origin = serve(Router::new()
            .route("/queued", get(|| async { ([(header::CONTENT_TYPE, "application/json")], "{}") }))
            .route("/watch", get(move |headers: HeaderMap| {
                let location = format!("{cdn}/clip.mkv?signature=fixture");
                async move {
                    assert_eq!(headers[header::AUTHORIZATION], "fixture");
                    (StatusCode::TEMPORARY_REDIRECT, [(header::LOCATION, location)])
                }
            }))).await;

        let remote = Arc::new(Remote::new().unwrap());
        let mut headers = HeaderMap::new();
        headers.insert(header::AUTHORIZATION, "fixture".parse().unwrap());
        let opened = remote.open(&format!("{origin}/watch"), headers).await.unwrap();
        assert_eq!(opened.content_type, "video/x-matroska");
        assert!(remote.open(&format!("{origin}/queued"), HeaderMap::new()).await.is_err());

        let relay = serve(remote.routes("secret".into())).await;
        let client = reqwest::Client::new();
        let media = format!("{relay}/secret/remote/{}", opened.id);
        let head = client.head(&media).send().await.unwrap();
        assert_eq!(head.headers()[header::CONTENT_LENGTH], "6");
        let bytes = client.get(&media).header(header::RANGE, "bytes=2-4").send().await.unwrap();
        assert_eq!(bytes.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(bytes.headers()[header::CACHE_CONTROL], "no-store");
        assert!(bytes.headers()[header::ACCESS_CONTROL_EXPOSE_HEADERS].to_str().unwrap().contains("Content-Range"));
        assert_eq!(bytes.headers()[header::CONTENT_RANGE], "bytes 2-4/6");
        assert_eq!(bytes.text().await.unwrap(), "cde");
        let denied = client.get(media.replace("/secret/", "/invalid/")).send().await.unwrap();
        assert_eq!(denied.status(), StatusCode::NOT_FOUND);
    }
}
