// Palabras de una búsqueda (sin mayúsculas ni acentos). Las comparten el buscador del Inicio, en el
// servidor, y el resaltado de lo encontrado, en la interfaz.

const fold = (s) =>
	String(s ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase();

/** «  HSBC, follow-up » → ['hsbc', 'follow-up']: se parte por espacios y se limpia la puntuación de los bordes. */
export const searchTerms = (s) => [
	...new Set(
		fold(s)
			.split(/\s+/)
			.map((t) => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
			.filter(Boolean),
	),
];

/** Trozo de `text` alrededor de la primera aparición de `term` (ya plegado), con «…» si se corta. */
export function snippetAround(text, term, radius = 48) {
	const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
	const at = fold(flat).indexOf(term);
	if (at < 0) return null;
	let start = Math.max(0, at - radius);
	let end = Math.min(flat.length, at + term.length + radius * 1.5);
	// Sin cortar palabras por la mitad.
	if (start > 0) start = flat.indexOf(' ', start) + 1 || start;
	if (end < flat.length) end = flat.lastIndexOf(' ', end) > at + term.length ? flat.lastIndexOf(' ', end) : end;
	return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}
