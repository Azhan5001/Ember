import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform === 'win32') {
  const script = fileURLToPath(new URL('./setup-media.ps1', import.meta.url));
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], { stdio: 'inherit' });
}
