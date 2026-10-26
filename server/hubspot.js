// Lectura de deals de HubSpot (solo lectura: nunca escribe). El token se busca igual que en
// ~/.hermes/scripts/hubspot_fechas.py: variable de entorno HUBSPOT_TOKEN o la línea HUBSPOT_TOKEN=… de
// ~/.hermes/.env. Nunca se registra ni se devuelve al cliente.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { dealUrl, stageName } from '../shared/hubspot.js';
import { HttpError } from './repo.js';

const ENV_PATH = path.join(os.homedir(), '.hermes', '.env');
const API = 'https://api.hubapi.com';
const OWNER_ID = '34012706';
const PIPELINE = '1380563180';
const PROPS = ['dealname', 'dealstage', 'amount', 'deal_currency_code', 'closedate', 'pipeline'];

export function readToken() {
	const env = (process.env.HUBSPOT_TOKEN ?? '').trim();
	if (env) return env;
	try {
		for (const line of fs.readFileSync(ENV_PATH, 'utf8').split('\n')) {
			const m = line.match(/^\s*(?:export\s+)?HUBSPOT_TOKEN\s*=\s*(.*?)\s*$/);
			if (m) return m[1].replace(/^['"]|['"]$/g, '').trim() || null;
		}
	} catch {
		// Sin ~/.hermes/.env: no hay token.
	}
	return null;
}

export const hasToken = () => !!readToken();

async function call(pathname, { method = 'GET', body } = {}) {
	const token = readToken();
	if (!token) throw new HttpError(409, 'Falta HUBSPOT_TOKEN en ~/.hermes/.env');
	let res;
	try {
		res = await fetch(API + pathname, {
			method,
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined,
			signal: AbortSignal.timeout(15000),
		});
	} catch {
		throw new HttpError(502, 'No se pudo conectar con HubSpot');
	}
	if (res.status === 401) throw new HttpError(502, 'HubSpot rechaza el token (401)');
	if (res.status === 404) throw new HttpError(404, 'Ese deal no existe en HubSpot');
	if (!res.ok) throw new HttpError(502, `HubSpot respondió ${res.status}`);
	return res.json();
}

export function mapDeal(d, portalId) {
	const p = d.properties ?? {};
	return {
		id: String(d.id),
		name: p.dealname ?? null,
		stage: stageName(p.dealstage),
		amount: p.amount != null && p.amount !== '' ? Number(p.amount) : null,
		currency: p.deal_currency_code || null,
		closeDate: p.closedate ? String(p.closedate).slice(0, 10) : null,
		url: dealUrl(portalId, d.id),
	};
}

export async function fetchDeal(dealId, portalId) {
	return mapDeal(await call(`/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=${PROPS.join(',')}`), portalId);
}

/** Deals de Daniel en el pipeline Sales, los más recientes primero. */
export async function searchDeals(query, portalId) {
	const body = {
		filterGroups: [
			{
				filters: [
					{ propertyName: 'hubspot_owner_id', operator: 'EQ', value: OWNER_ID },
					{ propertyName: 'pipeline', operator: 'EQ', value: PIPELINE },
				],
			},
		],
		properties: PROPS,
		sorts: [{ propertyName: 'hs_lastmodifieddate', direction: 'DESCENDING' }],
		limit: 20,
	};
	if (String(query ?? '').trim()) body.query = String(query).trim();
	const data = await call('/crm/v3/objects/deals/search', { method: 'POST', body });
	return (data.results ?? []).map((d) => mapDeal(d, portalId));
}

export async function fetchPortalId() {
	const d = await call('/account-info/v3/details');
	return d.portalId ? String(d.portalId) : null;
}
