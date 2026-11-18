from pathlib import Path
import argparse, json, zipfile
root = Path(__file__).resolve().parent.parent
version = json.loads((root / 'package.json').read_text())['version']
parser = argparse.ArgumentParser()
parser.add_argument('--output', type=Path, default=root.parent / f'Ember-v{version}-Source.zip')
output = parser.parse_args().output
roots = ['src', 'public', 'assets', 'supabase', 'licenses', 'scripts', 'tests', 'docs', 'web', 'src-tauri']
excluded = {'node_modules', 'target', 'vendor', 'dist', '.git', '__pycache__', 'media-tools', 'binaries'}
files = [p for p in root.iterdir() if p.is_file() and (p.name in {'README.md', 'index.html', 'rust-toolchain.toml', '.gitignore'} or p.name.startswith(('package', 'tsconfig', 'vite.config')))]
for name in roots:
    files.extend(p for p in (root / name).rglob('*') if p.is_file() and not p.is_symlink() and not excluded.intersection(p.relative_to(root).parts) and p.suffix not in {'.log', '.pyc'})
output.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9, strict_timestamps=False) as archive:
    for p in sorted(set(files)):
        archive.write(p, 'ember/' + p.relative_to(root).as_posix())
with zipfile.ZipFile(output) as archive:
    assert archive.testzip() is None
print(f'{output}: {len(files)} source files, {output.stat().st_size} bytes')
