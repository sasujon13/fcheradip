/**
 * Permanently delete Angular CLI cache (.angular/) before dev server start.
 * Wired via npm "prestart" / "prestart:quiet" in package.json.
 */
import { existsSync, rmSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(projectRoot, '.angular');

if (!existsSync(cacheDir)) {
  console.log('[clean-angular-cache] .angular not present — nothing to remove.');
  process.exit(0);
}

rmSync(cacheDir, { recursive: true, force: true });
console.log('[clean-angular-cache] Removed:', cacheDir);
