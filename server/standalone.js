// Servidor sin ventanas para desarrollar la UI en el navegador: `npm run dev:web`
// (Vite en :5173 con proxy de /api a este servidor en :4100). Usa data/dev.db.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { startServer } from './index.js';
import { createRepo } from './repo.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dbPath = process.env.NOTES_DESK_DB ?? path.join(root, 'data', 'dev.db');
const repo = createRepo(openDb(dbPath));
repo.housekeeping();

const { port } = await startServer({ repo, port: Number(process.env.PORT ?? 4100), meta: { dbPath, dev: true } });
console.log(`Notes Desk API en http://127.0.0.1:${port} · DB ${dbPath}`);
