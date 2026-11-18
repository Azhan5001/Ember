"""Stage the pinned FFmpeg and FFprobe programs for this host's Ember installer."""
import hashlib
import json
import platform
import shutil
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET = ROOT / "vendor" / "media"
SYSTEM = platform.system().lower()
if SYSTEM not in ("windows", "linux") or platform.machine().lower() not in ("amd64", "x86_64"):
    raise SystemExit("The prebuilt Ember decoder is available for x64 Windows and Linux.")

asset = json.loads((ROOT / "scripts/ffmpeg-assets.json").read_text())[SYSTEM]
TARGET.mkdir(parents=True, exist_ok=True)
suffix = ".exe" if SYSTEM == "windows" else ""
wanted = {f"bin/{tool}{suffix}": TARGET / (tool + suffix) for tool in ("ffmpeg", "ffprobe")}
wanted["LICENSE.txt"] = ROOT / "vendor" / "media.LICENSE.txt"

with tempfile.TemporaryDirectory() as folder:
    archive = Path(folder) / asset["name"]
    with urllib.request.urlopen(asset["url"], timeout=120) as response, archive.open("wb") as output:
        shutil.copyfileobj(response, output)
    with archive.open("rb") as handle:
        if hashlib.file_digest(handle, "sha256").hexdigest() != asset["sha256"]:
            raise SystemExit("FFmpeg download checksum mismatch.")
    if suffix:
        with zipfile.ZipFile(archive) as package:
            for relative, dest in wanted.items():
                entry = next(name for name in package.namelist() if name.split("/", 1)[-1] == relative)
                with package.open(entry) as source, dest.open("wb") as output:
                    shutil.copyfileobj(source, output)
    else:
        with tarfile.open(archive) as package:
            for relative, dest in wanted.items():
                entry = next(member for member in package if member.isfile() and member.name.split("/", 1)[-1] == relative)
                with package.extractfile(entry) as source, dest.open("wb") as output:
                    shutil.copyfileobj(source, output)
                if relative.startswith("bin/"):
                    dest.chmod(0o755)
    print(f"Prepared FFmpeg and FFprobe for {SYSTEM}.")
