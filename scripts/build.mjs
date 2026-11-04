import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';

// Use the Vite installation from the project root (npm ci).
// RIKA intentionally has no npm workspaces for Windows compatibility.
const frontend = resolve('frontend-react');
const frontendPackage = resolve(frontend, 'package.json');
const vite = resolve('node_modules', 'vite', 'bin', 'vite.js');

if (!existsSync(frontendPackage)) {
  console.error('Missing frontend-react/package.json. Re-extract the COMPLETE RIKA ZIP into a fresh folder (not only the small patch).');
  process.exit(1);
}
if (!existsSync(vite)) {
  console.error('Vite is not installed in the RIKA root. Run npm ci from the rika folder, then npm run build.');
  process.exit(1);
}

const result = spawnSync(process.execPath, [vite, 'build'], {
  cwd: frontend,
  stdio: 'inherit',
  env: process.env,
});
if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
