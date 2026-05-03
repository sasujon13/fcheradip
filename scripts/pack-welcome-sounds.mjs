/**
 * Writes `src/assets/sounds/welcome-bomb.bundle.json` (base64 s1–s3) so the ceremony
 * can load all clips in one GET and avoid per-.wav download prompts on strict hosts.
 * Run: npm run pack-welcome-sounds
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const soundsDir = path.join(__dirname, '../src/assets/sounds');

function readB64(name) {
  const p = path.join(soundsDir, name);
  if (!fs.existsSync(p)) {
    console.warn(`pack-welcome-sounds: missing ${name}`);
    return '';
  }
  return fs.readFileSync(p).toString('base64');
}

fs.mkdirSync(soundsDir, { recursive: true });
const out = { s1: readB64('s1.wav'), s2: readB64('s2.wav'), s3: readB64('s3.wav') };
fs.writeFileSync(path.join(soundsDir, 'welcome-bomb.bundle.json'), JSON.stringify(out), 'utf8');
console.log('Wrote src/assets/sounds/welcome-bomb.bundle.json');
