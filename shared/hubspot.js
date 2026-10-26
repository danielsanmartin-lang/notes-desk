// Etapas del pipeline Sales de HubSpot (mismo mapa que la skill sync-hubspot) y lectura de enlaces a deals.

export const HUBSPOT_STAGES = {
	1884202185: 'SQL',
	1884202186: 'Demo',
	1884202188: 'PoC',
	2421919972: 'Negotiation',
	2724224205: 'Verbal Agreement',
	1884202190: 'Win',
	1884202191: 'Lost',
	1884196070: 'Deferred',
};

export const stageName = (id) => (id == null ? null : HUBSPOT_STAGES[id] ?? String(id));

/**
 * Acepta un ID de deal o un enlace de HubSpot (…/record/0-3/123, …/deal/123) y devuelve
 * { dealId, url, portalId }. Devuelve null si no reconoce nada.
 */
export function parseHubspotRef(input) {
	const s = String(input ?? '').trim();
	if (!s) return null;
	if (/^\d+$/.test(s)) return { dealId: s, url: null, portalId: null };
	const deal = s.match(/\/(?:record\/0-3|deal)\/(\d+)/);
	if (!deal) return null;
	const portal = s.match(/hubspot\.com\/[a-z-]+\/(\d+)\//);
	return { dealId: deal[1], url: s, portalId: portal ? portal[1] : null };
}

/** ID de empresa o enlace de HubSpot (…/record/0-2/123, …/company/123) → { companyId, url, portalId }. */
export function parseHubspotCompanyRef(input) {
	const s = String(input ?? '').trim();
	if (!s) return null;
	if (/^\d+$/.test(s)) return { companyId: s, url: null, portalId: null };
	const m = s.match(/\/(?:record\/0-2|company)\/(\d+)/);
	if (!m) return null;
	const portal = s.match(/hubspot\.com\/[a-z-]+\/(\d+)\//);
	return { companyId: m[1], url: s, portalId: portal ? portal[1] : null };
}

export const companyUrl = (portalId, companyId) =>
	portalId && companyId ? `https://app.hubspot.com/contacts/${portalId}/record/0-2/${companyId}` : null;

export const dealUrl = (portalId, dealId) =>
	portalId && dealId ? `https://app.hubspot.com/contacts/${portalId}/record/0-3/${dealId}` : null;
