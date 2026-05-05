import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = resolve(here, '..', 'dist', 'index.js');

const SHEBANG = '#!/usr/bin/env node';
const contents = readFileSync(target, 'utf8');

if (!contents.startsWith(SHEBANG)) {
  writeFileSync(target, `${SHEBANG}\n${contents}`);
}

chmodSync(target, 0o755);
