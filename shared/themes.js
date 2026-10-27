// Temas visuales y modo claro/oscuro. Cada tema da los colores de superficie, texto y acento de los dos modos;
// la interfaz los aplica como variables CSS y Ajustes los usa para las miniaturas. Las gráficas y los colores
// de estado (ok, aviso, peligro) no cambian con el tema: su paleta está validada aparte.

export const APPEARANCES = ['system', 'light', 'dark'];

/** `ink` es el color del texto en «r g b»: de él salen líneas y hovers con transparencia. */
const mode = ({ bg, panel, sidebar, raised, fg, fg2, fg3, ink, accent, accentFg, accentText, accentRgb, soft = 0.1 }) => ({
	'--bg': bg,
	'--panel': panel,
	'--sidebar': sidebar,
	'--raised': raised,
	'--fg': fg,
	'--fg-2': fg2,
	'--fg-3': fg3,
	'--line': `rgb(${ink} / 0.08)`,
	'--line-strong': `rgb(${ink} / 0.15)`,
	'--hover': `rgb(${ink} / ${soft > 0.12 ? 0.05 : 0.04})`,
	'--active': `rgb(${accentRgb} / ${soft})`,
	'--accent': accent,
	'--accent-fg': accentFg,
	'--accent-soft': `rgb(${accentRgb} / ${soft})`,
	'--accent-text': accentText,
});

export const THEMES = [
	{
		id: 'zepo',
		name: 'Zepo',
		hint: 'Azul eléctrico',
		light: mode({
			bg: '#ffffff', panel: '#fbfbfd', sidebar: '#f3f4f9', raised: '#ffffff',
			fg: '#0b1030', fg2: '#565c7a', fg3: '#9399b2', ink: '11 16 48',
			accent: '#142cd1', accentFg: '#ffffff', accentText: '#1428b8', accentRgb: '20 44 209', soft: 0.09,
		}),
		dark: mode({
			bg: '#12152b', panel: '#161a33', sidebar: '#0d1024', raised: '#1c2040',
			fg: '#e8eafa', fg2: '#a3a8c6', fg3: '#6b7090', ink: '232 234 250',
			accent: '#4f63ff', accentFg: '#ffffff', accentText: '#a6b1ff', accentRgb: '91 109 255', soft: 0.18,
		}),
	},
	{
		id: 'oceano',
		name: 'Océano',
		hint: 'Petróleo y turquesa',
		light: mode({
			bg: '#ffffff', panel: '#fafcfc', sidebar: '#edf5f6', raised: '#ffffff',
			fg: '#0a1f24', fg2: '#4d6267', fg3: '#8ea0a4', ink: '10 31 36',
			accent: '#0b6f80', accentFg: '#ffffff', accentText: '#0a6474', accentRgb: '11 111 128',
		}),
		dark: mode({
			bg: '#0f1b1f', panel: '#132226', sidebar: '#0a1417', raised: '#182b30',
			fg: '#e3f1f2', fg2: '#9db7ba', fg3: '#65807f', ink: '227 241 242',
			accent: '#4fd1dc', accentFg: '#05272c', accentText: '#7fe3ea', accentRgb: '79 209 220', soft: 0.16,
		}),
	},
	{
		id: 'bosque',
		name: 'Bosque',
		hint: 'Verde',
		light: mode({
			bg: '#ffffff', panel: '#fafcfa', sidebar: '#eef5f0', raised: '#ffffff',
			fg: '#0f2016', fg2: '#4f6257', fg3: '#91a197', ink: '15 32 22',
			accent: '#2a7549', accentFg: '#ffffff', accentText: '#22653e', accentRgb: '42 117 73',
		}),
		dark: mode({
			bg: '#111a14', panel: '#152019', sidebar: '#0b130e', raised: '#1b2a20',
			fg: '#e4f0e7', fg2: '#a0b7a6', fg3: '#68806f', ink: '228 240 231',
			accent: '#5fcf8c', accentFg: '#062414', accentText: '#8fe0ae', accentRgb: '95 207 140', soft: 0.16,
		}),
	},
	{
		id: 'coral',
		name: 'Coral',
		hint: 'Cálido',
		light: mode({
			bg: '#ffffff', panel: '#fffbfa', sidebar: '#faf0ef', raised: '#ffffff',
			fg: '#2a0f15', fg2: '#6c5357', fg3: '#ab9598', ink: '42 15 21',
			accent: '#c9253f', accentFg: '#ffffff', accentText: '#b01f38', accentRgb: '201 37 63',
		}),
		dark: mode({
			bg: '#1d1416', panel: '#23181b', sidebar: '#150e10', raised: '#2c1e22',
			fg: '#f6e8ea', fg2: '#c3a8ac', fg3: '#8a7074', ink: '246 232 234',
			accent: '#ff7a91', accentFg: '#2a0710', accentText: '#ffa8b7', accentRgb: '255 122 145', soft: 0.16,
		}),
	},
	{
		id: 'lavanda',
		name: 'Lavanda',
		hint: 'Violeta',
		light: mode({
			bg: '#ffffff', panel: '#fcfbff', sidebar: '#f2f0fb', raised: '#ffffff',
			fg: '#1a1233', fg2: '#5c5677', fg3: '#9c97b3', ink: '26 18 51',
			accent: '#6440d6', accentFg: '#ffffff', accentText: '#5833c2', accentRgb: '100 64 214',
		}),
		dark: mode({
			bg: '#16132a', panel: '#1b1733', sidebar: '#0f0d1f', raised: '#231e3e',
			fg: '#ece8fb', fg2: '#aca6c8', fg3: '#736d90', ink: '236 232 251',
			accent: '#a593ff', accentFg: '#150a38', accentText: '#c6baff', accentRgb: '165 147 255', soft: 0.17,
		}),
	},
	{
		id: 'grafito',
		name: 'Grafito',
		hint: 'Blanco y negro',
		light: mode({
			bg: '#ffffff', panel: '#fbfbfb', sidebar: '#f2f2f3', raised: '#ffffff',
			fg: '#17181c', fg2: '#5a5d66', fg3: '#999ba3', ink: '23 24 28',
			accent: '#25272e', accentFg: '#ffffff', accentText: '#25272e', accentRgb: '37 39 46', soft: 0.08,
		}),
		dark: mode({
			bg: '#161618', panel: '#1b1b1e', sidebar: '#0f0f11', raised: '#232327',
			fg: '#ededef', fg2: '#a6a7ad', fg3: '#6e6f76', ink: '237 237 239',
			accent: '#e8e8ea', accentFg: '#17181c', accentText: '#f4f4f5', accentRgb: '232 232 234', soft: 0.12,
		}),
	},
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const themeById = (id) => THEMES.find((t) => t.id === id) ?? THEMES[0];
