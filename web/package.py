from pathlib import Path
import zipfile,json

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
if not (dist / "index.html").is_file():
    raise SystemExit("Run npm run build first.")
version=json.loads((root / "package.json").read_text())["version"]
output = root.parent / f"Ember-Web-{version}-Cloudflare-Pages.zip"
with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as bundle:
    for path in sorted(dist.rglob("*")):
        if path.is_file():
            bundle.write(path, path.relative_to(dist))
    for name in ("_worker.js", "_headers"):
        bundle.write(root / "web" / name, name)
with zipfile.ZipFile(output) as bundle:
    assert bundle.testzip() is None
    assert max(info.file_size for info in bundle.infolist()) < 25 * 1024 * 1024
    assert len(bundle.infolist()) < 1000
print(output)
