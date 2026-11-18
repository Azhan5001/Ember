#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
version=8.1.3
sha=7138d28c96d9d3e3af4ee3d8cad72741f8ffb40da90c1112235dea3ecd3178a3
build=${EMBER_FFMPEG_BUILD_DIR:-$(mktemp -d)}
mkdir -p "$build"
cd "$build"
archive=ffmpeg-$version.tar.xz
if [ ! -f "$archive" ]; then
  curl --fail --location --retry 2 "https://ffmpeg.org/releases/$archive" -o "$archive"
fi
printf '%s  %s\n' "$sha" "$archive" | sha256sum -c
tar --no-same-owner -xf "$archive"
cd "ffmpeg-$version"
./configure \
  --pkg-config-flags=--static --disable-autodetect --disable-debug --disable-doc --disable-ffplay \
  --disable-avdevice --disable-everything --enable-small --enable-gpl --enable-version3 \
  --enable-openssl --enable-zlib --enable-libvpx --enable-libopus --enable-libx264 --enable-libdav1d \
  --enable-protocol=file,pipe,http,https,tcp,tls,crypto,httpproxy,udp \
  --enable-demuxer=matroska,mov,mpegts,hls,avi,mpegvideo,mpegps,flv,ogg,mp3,ac3,aac,wav,asf,rm,subrip,ass,webvtt,m4v,hevc,h264,ivf \
  --enable-parser=h264,hevc,av1,vp8,vp9,mpeg4video,mpegvideo,aac,aac_latm,ac3,dca,mpegaudio,opus,flac \
  --enable-decoder=h264,hevc,libdav1d,vp8,vp9,mpeg4,mpeg2video,mpeg1video,msmpeg4v3,vc1,wmv3,mjpeg,png,aac,aac_latm,ac3,eac3,truehd,mlp,dca,mp2,mp3,opus,vorbis,flac,alac,pcm_s16le,pcm_s16be,pcm_s24le,pcm_s24be,pcm_s32le,pcm_f32le,wmav2,ass,ssa,subrip,mov_text,webvtt,hdmv_pgs_subtitle,dvdsub,dvbsub,xsub \
  --enable-encoder=libvpx_vp8,libopus,libx264,aac,srt \
  --enable-muxer=webm,mp4,srt \
  --enable-filter=aformat,aresample,format,scale,overlay,trim,atrim,anull,null,setpts,asetpts,fps,atempo
make -j "${EMBER_BUILD_JOBS:-$(nproc)}" ffmpeg ffprobe
mkdir -p "$root/vendor/media/linux"
install -m 755 ffmpeg ffprobe "$root/vendor/media/linux"
install -m 644 COPYING.GPLv3 "$root/vendor/media/linux/LICENSE.txt"
