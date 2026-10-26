// Conexión SQLite (better-sqlite3), migraciones versionadas con PRAGMA user_version y backups diarios.

import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');
const BACKUP_RE = /^zepo-desk-\d{4}-\d{2}-\d{2}\.db$/;

export function openDb(file) {
	if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
	const db = new Database(file);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	db.pragma('busy_timeout = 3000');
	migrate(db);
	return db;
}

export function migrate(db) {
	const current = db.pragma('user_version', { simple: true });
	const files = fs
		.readdirSync(MIGRATIONS_DIR)
		.filter((f) => /^\d+_.+\.sql$/.test(f))
		.sort();
	for (const f of files) {
		const version = parseInt(f, 10);
		if (version <= current) continue;
		const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
		db.transaction(() => {
			db.exec(sql);
			db.pragma(`user_version = ${version}`);
		})();
	}
}

/** Una copia por día en dir, guardando las `keep` más recientes. Devuelve la ruta de la de hoy. */
export async function backupDaily(db, dir, today, keep = 14) {
	fs.mkdirSync(dir, { recursive: true });
	const target = path.join(dir, `zepo-desk-${today}.db`);
	if (!fs.existsSync(target)) await db.backup(target);
	const files = fs.readdirSync(dir).filter((f) => BACKUP_RE.test(f)).sort();
	for (const f of files.slice(0, Math.max(0, files.length - keep))) fs.rmSync(path.join(dir, f));
	return target;
}
