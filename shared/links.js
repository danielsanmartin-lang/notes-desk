// Enlaces adjuntos a una PoC o RFP (Google Docs, Sheets…). Lo usan el servidor (server/documents.js) y el
// formulario de la ficha, así que no depende de nada.

/** Solo enlaces web: http(s) con host. Devuelve la URL normalizada o null. */
export function cleanUrl(raw) {
	let text = String(raw ?? '').trim();
	if (!text) return null;
	if (!/^[a-z][a-z0-9+.-]*:/i.test(text)) text = `https://${text}`;
	try {
		const u = new URL(text);
		if ((u.protocol !== 'http:' && u.protocol !== 'https:') || !u.hostname.includes('.')) return null;
		return u.href;
	} catch {
		return null;
	}
}

/** Nombre por defecto de un enlace: el tipo de documento de Google, o el dominio. */
export function linkTitle(url) {
	const u = new URL(url);
	const host = u.hostname.replace(/^www\./, '');
	if (host === 'docs.google.com') {
		// docs.google.com/spreadsheets/d/… o, con varias cuentas, docs.google.com/u/1/spreadsheets/d/…
		const names = { document: 'Google Doc', spreadsheets: 'Google Sheet', presentation: 'Google Slides', forms: 'Google Form' };
		const kind = u.pathname.split('/').slice(1, 4).find((seg) => seg in names);
		if (kind) return names[kind];
	}
	if (host === 'drive.google.com') return 'Google Drive';
	return host;
}
