use anyhow::{anyhow, bail, Result};
use axum::{
    body::Body, extract::{Path, State}, http::{Method, StatusCode}, response::{IntoResponse, Response},
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{collections::HashMap, path::PathBuf, process::Stdio, time::{Duration, Instant}};
use tokio::{io::{AsyncReadExt, BufReader}, process::{Child, Command}, sync::{Mutex, Semaphore}};
use uuid::Uuid;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Input {
    url: String,
    #[serde(default)]
    headers: Value,
}

impl Input {
    fn apply(&self, command: &mut Command) -> Result<()> {
        let url = crate::network::checked(&self.url)?;
        let headers = crate::network::headers(&self.headers)?;
        let mut fields = String::new();
        for (key, value) in &headers {
            fields.push_str(&format!("{}: {}\r\n", key, value.to_str()?));
        }
        command.args(["-protocol_whitelist", "http,https,tcp,tls,crypto,httpproxy", "-rw_timeout",
            if cfg!(target_os="linux") { "8000000" } else { "15000000" }]);
        if !fields.is_empty() {
            command.args(["-headers", &fields]);
        }
        command.args(["-i", url.as_str()]);
        Ok(())
    }
}

pub struct Media {
    ffmpeg: PathBuf,
    ffprobe: PathBuf,
    tickets: Mutex<HashMap<Uuid, (Instant, Encode)>>,
    probes: Semaphore,
    encoders: std::sync::Arc<Semaphore>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Encode {
    input: Input,
    start: f64,
    audio: Option<u32>,
    bitmap: Option<u32>,
    height: Option<u32>,
    format: Format,
    #[serde(default = "normal_rate")]
    rate: f64,
}

fn normal_rate() -> f64 { 1.0 }

#[derive(Clone, Copy, Deserialize)]
#[serde(rename_all = "lowercase")]
enum Format { Webm, Mp4 }

impl Format {
    fn content_type(self) -> &'static str {
        match self { Self::Webm => "video/webm", Self::Mp4 => "video/mp4" }
    }
}

impl Media {
    pub fn new(ffmpeg: PathBuf, ffprobe: PathBuf) -> Self {
        Self { ffmpeg, ffprobe, tickets: Mutex::new(HashMap::new()), probes: Semaphore::new(3), encoders: std::sync::Arc::new(Semaphore::new(2)) }
    }

    pub async fn probe(&self, input: Input) -> Result<Value> {
        let _permit = self.probes.acquire().await?;
        let mut command = process(&self.ffprobe);
        let (analysis, size, timeout) = if cfg!(target_os="linux") {
            ("1100000", "1800000", 8)
        } else { ("3000000", "4000000", 18) };
        command.args([
            "-v", "error", "-analyzeduration", analysis, "-probesize", size,
            "-show_entries", "format=duration:stream=index,codec_type,codec_name,color_transfer:stream_tags=language,title:stream_disposition=default,attached_pic",
            "-of", "json",
        ]);
        input.apply(&mut command)?;
        let bytes = collect(command, 1_000_000, Duration::from_secs(timeout)).await?;
        let info: Value = serde_json::from_slice(&bytes)?;
        let streams = info["streams"].as_array().ok_or_else(|| anyhow!("No media tracks were found."))?;
        let tracks: Vec<_> = streams.iter().filter_map(|stream| {
            let kind = match stream["codec_type"].as_str()? {
                "audio" => "audio",
                "subtitle" => "sub",
                _ => return None,
            };
            let codec = stream["codec_name"].as_str().unwrap_or("");
            let bitmap = matches!(codec, "hdmv_pgs_subtitle" | "dvd_subtitle" | "dvb_subtitle" | "xsub");
            Some(json!({
                "id": stream["index"], "type": kind, "lang": stream["tags"]["language"],
                "title": stream["tags"]["title"], "codec": codec, "bitmap": bitmap,
                "default": stream["disposition"]["default"] == 1
            }))
        }).collect();
        let video = streams.iter().find(|s| s["codec_type"] == "video" && s["disposition"]["attached_pic"] != 1);
        let duration = info["format"]["duration"].as_str().and_then(|d| d.parse::<f64>().ok()).filter(|d| d.is_finite() && *d > 0.);
        Ok(json!({"duration": duration, "tracks": tracks, "video": video.map(|s| &s["codec_name"]), "hdr": video.is_some_and(|s| matches!(s["color_transfer"].as_str(), Some("smpte2084" | "arib-std-b67")))}))
    }

    pub async fn open(&self, request: Encode) -> Result<Uuid> {
        if !request.start.is_finite() || request.start < 0. || request.start > 604_800. {
            bail!("Invalid playback position");
        }
        if !request.rate.is_finite() || !(1.0..=2.0).contains(&request.rate) { bail!("Invalid playback speed"); }
        crate::network::checked(&request.input.url)?;
        let mut tickets = self.tickets.lock().await;
        tickets.retain(|_, (issued, _)| issued.elapsed() < Duration::from_secs(30));
        if tickets.len() >= 12 { bail!("Too many pending video requests"); }
        let id = Uuid::new_v4();
        tickets.insert(id, (Instant::now(), request));
        Ok(id)
    }

    pub async fn subtitle(&self, input: Input, track: u32, start: Option<f64>) -> Result<String> {
        let _permit = self.probes.acquire().await?;
        let mut command = process(&self.ffmpeg);
        command.args(["-v", "error", "-nostdin", "-copyts"]);
        if let Some(start) = start {
            if !start.is_finite() || !(0.0..=604800.0).contains(&start) { bail!("Invalid subtitle position"); }
            command.args(["-ss", &start.to_string(), "-t", "42"]);
        }
        input.apply(&mut command)?;
        if let Some(start)=start { command.args(["-to", &(start+42.0).to_string()]); }
        command.args(["-map", &format!("0:{track}"), "-avoid_negative_ts", "disabled", "-f", "srt", "pipe:1"]);
        let bytes = collect(command, 2_000_000, Duration::from_secs(35)).await?;
        Ok(String::from_utf8(bytes)?)
    }
}

fn process(binary: &PathBuf) -> Command {
    let mut command = Command::new(binary);
    command.stdin(Stdio::null()).stdout(Stdio::piped()).stderr(Stdio::null()).kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(0x08000000);
    command
}

async fn collect(mut command: Command, max: u64, limit: Duration) -> Result<Vec<u8>> {
    let mut child = command.spawn().map_err(|_| anyhow!("The compatibility decoder could not start."))?;
    let mut pipe = child.stdout.take().unwrap().take(max + 1);
    let mut bytes = Vec::new();
    tokio::time::timeout(limit, async {
        pipe.read_to_end(&mut bytes).await?;
        if bytes.len() as u64 > max { bail!("Decoder output exceeded its limit."); }
        if !child.wait().await?.success() { bail!("The decoder could not read this source."); }
        Ok::<(), anyhow::Error>(())
    }).await??;
    Ok(bytes)
}

fn encode(binary: &PathBuf, request: Encode) -> Result<Child> {
    let mut command = process(binary);
    command.args(["-v", "error", "-nostdin", "-filter_threads", "2", "-filter_complex_threads", "2", "-threads", "3"]);
    #[cfg(target_os="linux")]
    command.args(["-analyzeduration", "1500000", "-probesize", "3000000"]);
    if matches!(request.format, Format::Webm) {
        command.args(["-readrate", &format!("{:.2}", request.rate * 1.25), "-readrate_initial_burst", "6"]);
    }
    if request.start > 0. {
        command.args(["-ss", &format!("{:.3}", request.start)]);
    }
    request.input.apply(&mut command)?;
    #[cfg(target_os="android")]
    {
      if request.bitmap.is_some(){bail!("Image subtitles need desktop playback. Select a text subtitle on Android.")}
      let audio=request.audio.map(|i|format!("0:{i}")).unwrap_or_else(||"0:a:0?".into());
      command.args(["-map","0:V:0","-map",&audio,"-c:v","copy","-c:a","aac","-ac","2","-b:a","160k","-sn","-dn","-movflags","+frag_keyframe+empty_moov+default_base_moof","-frag_duration","500000","-f","mp4","pipe:1"]);
      return Ok(command.spawn()?);
    }
    let max_height = if cfg!(target_os="linux") { 1080 } else { 2160 };
    let height = request.height.unwrap_or(1080).clamp(360, max_height);
    let scale = format!("scale=-2:trunc(min(ih\\,{height})/2)*2,format=yuv420p");
    let scale = if request.rate > 1.0 { format!("{scale},setpts=(PTS-STARTPTS)/{}",request.rate) } else { scale };
    if request.rate > 1.0 { command.args(["-af", &format!("asetpts=PTS-STARTPTS,atempo={}",request.rate)]); }
    if let Some(bitmap) = request.bitmap {
        command.args(["-filter_complex", &format!("[0:V:0][0:{bitmap}]overlay,{scale}[video]"), "-map", "[video]"]);
    } else {
        command.args(["-map", "0:V:0", "-vf", &scale]);
    }
    let audio = request.audio.map(|index| format!("0:{index}")).unwrap_or_else(|| "0:a:0?".into());
    command.args(["-map", &audio, "-map_metadata", "-1", "-map_chapters", "-1", "-sn", "-dn",
        "-threads", "2", "-g", "48", "-ac", "2", "-b:a", "160k", "-flush_packets", "1"]);
    match request.format {
        Format::Webm => {
            #[cfg(target_os="linux")]
            command.args(["-lag-in-frames", "0"]);
            command.args(["-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8",
                "-crf", if cfg!(target_os="linux") { "23" } else { "17" },
                "-b:v", if height > 1080 { "10M" } else { "5M" },
                "-c:a", "libopus", "-f", "webm", "-live", "1", "-cluster_time_limit", "500"]);
        }
        Format::Mp4 => {
            command.args(["-c:v", "libx264", "-preset", "ultrafast", "-profile:v", "main",
                "-level:v", "5.2", "-crf", "22", "-c:a", "aac", "-movflags",
                "+frag_keyframe+empty_moov+default_base_moof", "-frag_duration", "500000", "-f", "mp4"]);
        }
    }
    Ok(command.arg("pipe:1").spawn()?)
}

pub async fn video(State(server): State<crate::server::Server>, Path((token, id)): Path<(String, String)>, method: Method) -> Response {
    if token != server.token { return StatusCode::NOT_FOUND.into_response(); }
    let Ok(id) = Uuid::parse_str(&id) else { return StatusCode::NOT_FOUND.into_response(); };
    let media = server.media.clone();
    if method == Method::HEAD {
        let tickets = media.tickets.lock().await;
        let Some((issued, request)) = tickets.get(&id) else { return StatusCode::NOT_FOUND.into_response(); };
        if issued.elapsed() >= Duration::from_secs(30) { return StatusCode::GONE.into_response(); }
        return Response::builder().header("content-type", request.format.content_type())
            .header("access-control-allow-origin", "*").header("cache-control", "no-store")
            .body(Body::empty()).unwrap();
    }
    let Ok(permit) = media.encoders.clone().try_acquire_owned() else {
        return StatusCode::TOO_MANY_REQUESTS.into_response();
    };
    let Some((issued, request)) = media.tickets.lock().await.remove(&id) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if issued.elapsed() >= Duration::from_secs(30) { return StatusCode::GONE.into_response(); }
    let content_type = request.format.content_type();
    let Ok(mut child) = encode(&media.ffmpeg, request) else { return StatusCode::BAD_GATEWAY.into_response(); };
    let stdout = BufReader::with_capacity(64 * 1024, child.stdout.take().unwrap());
    let stream = async_stream::try_stream! {
        let _permit = permit;
        let mut stdout = stdout;
        let mut buffer = vec![0; 64 * 1024];
        loop {
            let read = stdout.read(&mut buffer).await?;
            if read == 0 { break; }
            yield axum::body::Bytes::copy_from_slice(&buffer[..read]);
        }
        if !child.wait().await?.success() {
            Err(std::io::Error::other("Compatibility decoder failed"))?;
        }
    };
    let stream = typed_stream(stream);
    Response::builder().header("content-type", content_type)
        .header("access-control-allow-origin", "*").header("cache-control", "no-store")
        .body(Body::from_stream(stream)).unwrap()
}

fn typed_stream(stream: impl futures_core::Stream<Item = std::io::Result<axum::body::Bytes>>) -> impl futures_core::Stream<Item = std::io::Result<axum::body::Bytes>> {
    stream
}
