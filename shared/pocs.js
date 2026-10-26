// Región e importe de una PoC. Lo usan el servidor (estadísticas) y la interfaz.

/** Iberia: España, Portugal y Andorra (la lleva el equipo de España). El resto, LATAM. */
export const IBERIA = new Set(['ES', 'PT', 'AD']);

/** @returns {'iberia' | 'latam' | 'none'} */
export const regionOf = (country) => (!country ? 'none' : IBERIA.has(country) ? 'iberia' : 'latam');

/** El importe del deal de HubSpot si lo hay; si no, el que se puso a mano. */
export function pocAmount(p) {
	if (p.hubspot_deal_id && p.hubspot_amount != null)
		return { value: p.hubspot_amount, currency: p.hubspot_currency ?? 'EUR', source: 'hubspot' };
	if (p.amount != null) return { value: p.amount, currency: p.currency ?? 'EUR', source: 'manual' };
	return null;
}

/** Suma por moneda: [{ currency, value }], sin mezclar euros y dólares. */
export function sumByCurrency(pocs) {
	const sums = new Map();
	for (const p of pocs) {
		const a = pocAmount(p);
		if (a) sums.set(a.currency, (sums.get(a.currency) ?? 0) + a.value);
	}
	return [...sums].map(([currency, value]) => ({ currency, value }));
}
