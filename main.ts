// main.ts — Emberfall Duel build entrypoint for make.fun.
// Copies game/ and screenshots/ into the output directory and writes
// dossier.json from the vendored makefun-game library.
// Node 22, standard library only. Run: node main.ts
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier, DOSSIER_MAX_BYTES } from './vendor/makefun-game.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  // Never delete the output directory itself; only its known contents.
  await rm(join(OUT_DIR, 'game'), { recursive: true, force: true });
  await rm(join(OUT_DIR, 'screenshots'), { recursive: true, force: true });
  await rm(join(OUT_DIR, 'dossier.json'), { force: true });

  await cp(join(HERE, 'game'), join(OUT_DIR, 'game'), { recursive: true });
  await cp(join(HERE, 'screenshots'), join(OUT_DIR, 'screenshots'), { recursive: true });

  const dossier = buildDossier(OUT_DIR, CAPS);
  if (dossier.length > DOSSIER_MAX_BYTES) {
    throw new Error(`dossier.json is ${dossier.length} bytes, over the ${DOSSIER_MAX_BYTES} cap`);
  }
  await writeFile(join(OUT_DIR, 'dossier.json'), dossier);
  console.log(`wrote ${join(OUT_DIR, 'dossier.json')} (${dossier.length} bytes)`);
}

await main();
