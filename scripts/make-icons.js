// Genera el icono de la app (build/icon.icns) y el de la barra de menús (build/tray/trayTemplate*.png) sin
// dependencias: dibuja con funciones de distancia, suaviza con supermuestreo y escribe PNG con zlib.
//   npm run icons

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ── PNG ──
const CRC = new Int32Array(256).map((_, n) => {
	let c = n;
	for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	return c;
});
const crc32 = (buf) => {
	let c = -1;
	for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
	return (c ^ -1) >>> 0;
};
function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length);
	const td = Buffer.concat([Buffer.from(type), data]);
	const crc = Buffer.alloc(4);
	crc.writeUInt32BE(crc32(td));
	return Buffer.concat([len, td, crc]);
}
function png(size, rgba) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(size, 0);
	ihdr.writeUInt32BE(size, 4);
	ihdr.set([8, 6, 0, 0, 0], 8);
	const raw = Buffer.alloc(size * (size * 4 + 1));
	for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
		chunk('IEND', Buffer.alloc(0)),
	]);
}

// ── Formas (coordenadas 0..1) ──
const sdRoundRect = (x, y, cx, cy, hw, hh, r) => {
	const qx = Math.abs(x - cx) - hw + r;
	const qy = Math.abs(y - cy) - hh + r;
	return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
const sdSegment = (x, y, ax, ay, bx, by) => {
	const pax = x - ax;
	const pay = y - ay;
	const bax = bx - ax;
	const bay = by - ay;
	const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
	return Math.hypot(pax - bax * h, pay - bay * h);
};
const sdPolyline = (x, y, pts) => {
	let d = Infinity;
	for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, sdSegment(x, y, ...pts[i], ...pts[i + 1]));
	return d;
};

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const NAVY = hex('#2A3270');
const BLUE = hex('#142CD1');
const TEAL = hex('#7BE9E4');
// El check del logo (src/components/Logo.tsx) en un lienzo de 32.
const CHECK = [
	[9, 16.5],
	[13.5, 21],
	[23, 11.5],
].map(([x, y]) => [x / 32, y / 32]);

function render(size, shade) {
	const out = Buffer.alloc(size * size * 4);
	const S = 4; // supermuestreo S×S
	for (let py = 0; py < size; py++) {
		for (let px = 0; px < size; px++) {
			let r = 0;
			let g = 0;
			let b = 0;
			let a = 0;
			for (let sy = 0; sy < S; sy++) {
				for (let sx = 0; sx < S; sx++) {
					const c = shade((px + (sx + 0.5) / S) / size, (py + (sy + 0.5) / S) / size);
					if (!c) continue;
					r += c[0] * c[3];
					g += c[1] * c[3];
					b += c[2] * c[3];
					a += c[3];
				}
			}
			const i = (py * size + px) * 4;
			if (a > 0) {
				out[i] = Math.round(r / a);
				out[i + 1] = Math.round(g / a);
				out[i + 2] = Math.round(b / a);
			}
			out[i + 3] = Math.round((a / (S * S)) * 255);
		}
	}
	return out;
}

// Icono de la app: rejilla de macOS (cuerpo de 824/1024 con esquinas de 185) y el logo encima.
function appIcon(x, y) {
	const inset = 100 / 1024;
	const half = 0.5 - inset;
	if (sdRoundRect(x, y, 0.5, 0.5, half, half, 185 / 1024) > 0) return null;
	// Coordenadas dentro del cuerpo del icono.
	const u = (x - inset) / (half * 2);
	const v = (y - inset) / (half * 2);
	if (sdPolyline(u, v, CHECK) < 3.4 / 64) return [255, 255, 255, 1];
	if (Math.hypot(u - 24.5 / 32, v - 23.5 / 32) < 3.1 / 32) return [...TEAL, 1];
	const t = Math.min(1, Math.max(0, (u + v) / 2));
	const glow = Math.max(0, 1 - Math.hypot(u - 0.25, v - 0.2) * 1.6) * 0.18;
	return [0, 1, 2].map((k) => Math.min(255, NAVY[k] + (BLUE[k] - NAVY[k]) * t + 255 * glow)).concat(1);
}

// Icono de plantilla para la barra de menús: solo alfa (macOS lo tiñe en claro u oscuro).
function trayIcon(x, y) {
	const ring = Math.abs(sdRoundRect(x, y, 0.5, 0.5, 0.39, 0.39, 0.16)) < 0.055;
	const check = sdPolyline((x - 0.11) / 0.78, (y - 0.11) / 0.78, CHECK) < 0.085;
	return ring || check ? [0, 0, 0, 1] : null;
}

const write = (file, buf) => {
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, buf);
	console.log('→', path.relative(root, file));
};

write(path.join(root, 'build', 'tray', 'trayTemplate.png'), png(18, render(18, trayIcon)));
write(path.join(root, 'build', 'tray', 'trayTemplate@2x.png'), png(36, render(36, trayIcon)));

const iconset = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-desk-')) + '/icon.iconset';
fs.mkdirSync(iconset);
for (const base of [16, 32, 128, 256, 512]) {
	fs.writeFileSync(path.join(iconset, `icon_${base}x${base}.png`), png(base, render(base, appIcon)));
	fs.writeFileSync(path.join(iconset, `icon_${base}x${base}@2x.png`), png(base * 2, render(base * 2, appIcon)));
}
write(path.join(root, 'build', 'icon.png'), fs.readFileSync(path.join(iconset, 'icon_512x512@2x.png')));
execFileSync('iconutil', ['-c', 'icns', iconset, '-o', path.join(root, 'build', 'icon.icns')]);
console.log('→ build/icon.icns');
