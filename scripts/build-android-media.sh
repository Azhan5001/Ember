#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/.." && pwd)
: "${NDK_HOME:?Set NDK_HOME to Android NDK 27.2.12479018}"
build=${EMBER_ANDROID_MEDIA_BUILD:-$(mktemp -d)}
mkdir -p "$build"
cd "$build"
curl -fL --retry 2 https://ffmpeg.org/releases/ffmpeg-8.1.3.tar.xz -o ffmpeg.tar.xz
printf '%s  %s\n' 7138d28c96d9d3e3af4ee3d8cad72741f8ffb40da90c1112235dea3ecd3178a3 ffmpeg.tar.xz | sha256sum -c
tar xf ffmpeg.tar.xz
cd ffmpeg-8.1.3
export PATH=$NDK_HOME/toolchains/llvm/prebuilt/linux-x86_64/bin:$PATH
./configure --target-os=android --arch=aarch64 --enable-cross-compile --extra-ldflags=-Wl,-z,max-page-size=16384 --cc=aarch64-linux-android24-clang --cxx=aarch64-linux-android24-clang++ --ar=llvm-ar --ranlib=llvm-ranlib --strip=llvm-strip --disable-autodetect --disable-debug --disable-doc --disable-ffplay --disable-avdevice --disable-everything --enable-small --enable-protocol=file,pipe,http,tcp --enable-demuxer=matroska,mov,mpegts,hls,avi,ogg,mp3,ac3,aac,wav,subrip,ass,webvtt --enable-parser=h264,hevc,av1,vp8,vp9,mpeg4video,mpegvideo,aac,aac_latm,ac3,dca,mpegaudio,opus,flac --enable-decoder=h264,hevc,vp8,vp9,mpeg4,mpeg2video,aac,aac_latm,ac3,eac3,truehd,mlp,dca,mp3,opus,vorbis,flac,alac,pcm_s16le,ass,ssa,subrip,mov_text,webvtt,hdmv_pgs_subtitle,dvdsub --enable-encoder=aac,srt --enable-muxer=mp4,srt --enable-filter=aformat,aresample,anull,atrim,asetpts,atempo
make -j "${EMBER_BUILD_JOBS:-4}" ffmpeg ffprobe
out="$root/src-tauri/gen/android/app/src/main/jniLibs/arm64-v8a"
mkdir -p "$out"
install -m755 ffmpeg "$out/libffmpeg.so"
install -m755 ffprobe "$out/libffprobe.so"
