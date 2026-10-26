// Importa (o actualiza) en Zepo Desk las PoCs que vienen de HubSpot: un JSON con los deals en etapa PoC,
// su empresa y sus tareas abiertas, sacado de HubSpot con Claude (conector) o a mano.
//   ELECTRON_RUN_AS_NODE=1 electron scripts/import-hubspot-pocs.js deals.json [ruta.db]
// Sin ruta usa la base real (~/Library/Application Support/Zepo Desk/zepo-desk.db). Se puede repetir:
// una PoC se reconoce por su deal de HubSpot y una tarea por su título dentro de la PoC.
//
// Formato del JSON:
// { "portalId": "…", "owner": "…", "deals": [{ "id", "dealname", "amount", "currency", "closedate",
//   "entered_poc", "company": { "name", "country" }, "tasks": [{ "subject", "due", "type" }] }] }

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../server/db.js';
import { createRepo } from '../server/repo.js';
import { toDateStr } from '../shared/dates.js';
import { dealUrl } from '../shared/hubspot.js';

const COUNTRIES = {
	spain: 'ES', españa: 'ES', peru: 'PE', perú: 'PE', argentina: 'AR', panama: 'PA', panamá: 'PA', chile: 'CL',
	colombia: 'CO', mexico: 'MX', méxico: 'MX', ecuador: 'EC', uruguay: 'UY', paraguay: 'PY', bolivia: 'BO',
	'costa rica': 'CR', guatemala: 'GT', 'dominican republic': 'DO', 'república dominicana': 'DO', portugal: 'PT',
	andorra: 'AD', 'united states': 'US', 'united kingdom': 'GB',
};
const CHANNEL_BY_TASK_TYPE = { CALL: 'call', EMAIL: 'email', LINKED_IN: 'linkedin', LINKED_IN_MESSAGE: 'linkedin' };

const [file, dbArg] = process.argv.slice(2);
if (!file) {
	console.error('Uso: electron scripts/import-hubspot-pocs.js deals.json [ruta.db]');
	process.exit(1);
}
const dbPath = dbArg ?? process.env.ZEPO_DESK_DB ?? path.join(os.homedir(), 'Library', 'Application Support', 'Zepo Desk', 'zepo-desk.db');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const repo = createRepo(openDb(dbPath));
const localDate = (iso) => (iso ? toDateStr(new Date(iso)) : null);

/** "Global Bank (Sofistic) - Panamá - 2026" → "Global Bank (Sofistic)": fuera el año y el país. */
function pocName(dealname) {
	const parts = dealname.split(' - ').map((s) => s.trim());
	const kept = parts.filter((p) => !/^\d{4}$/.test(p) && !(p.toLowerCase() in COUNTRIES));
	return kept.join(' - ') || dealname;
}

/** "Global Bank (Sofistic) - Panamá - 2026" → "Sofistic": el partner va entre paréntesis en el nombre del deal. */
const partnerOf = (dealname) => dealname.split(' - ')[0].match(/\(([^)]+)\)/)?.[1]?.trim() ?? null;

if (data.portalId) repo.setSettings({ hubspot_portal_id: String(data.portalId) });
const existing = repo.listPocs();
let created = 0;
let updated = 0;
let tasks = 0;

for (const deal of data.deals) {
	const fields = {
		company: deal.company?.name ?? null,
		country: COUNTRIES[(deal.company?.country ?? '').toLowerCase()] ?? null,
		owner: data.owner ?? null,
		partner: partnerOf(deal.dealname),
		start_date: localDate(deal.entered_poc),
	};
	let poc = existing.find((p) => p.hubspot_deal_id === String(deal.id));
	if (poc) {
		// No pisa lo que hayas cambiado a mano en la app: solo rellena lo que esté vacío.
		const fill = Object.fromEntries(Object.entries(fields).filter(([k, v]) => v && !poc[k]));
		if (Object.keys(fill).length) repo.updatePoc(poc.id, fill);
		updated++;
	} else {
		poc = repo.createPoc({ name: pocName(deal.dealname), hubspot: String(deal.id), ...fields });
		created++;
	}
	repo.applyHubspotDeal(poc.id, {
		id: String(deal.id),
		name: deal.dealname,
		stage: 'PoC',
		amount: deal.amount ?? null,
		currency: deal.currency ?? null,
		closeDate: localDate(deal.closedate),
		url: dealUrl(data.portalId, deal.id),
	});

	const { items, done } = repo.listItems('poc', { pocId: poc.id });
	const titles = new Set([...items, ...done].map((i) => i.title.trim().toLowerCase()));
	for (const t of deal.tasks ?? []) {
		if (titles.has(t.subject.trim().toLowerCase())) continue;
		repo.createItem({
			category: 'poc',
			poc_id: poc.id,
			title: t.subject.trim(),
			due_date: localDate(t.due),
			channel: CHANNEL_BY_TASK_TYPE[t.type] ?? null,
			notes: 'Tarea de HubSpot',
		});
		tasks++;
	}
	console.log(`${created + updated}. ${pocName(deal.dealname)} (${fields.company ?? 'sin empresa'}, ${fields.country ?? '?'})`);
}

console.log(`\n${created} PoCs nuevas, ${updated} actualizadas, ${tasks} tareas añadidas · ${dbPath}`);
