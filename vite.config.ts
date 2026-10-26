import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// En desarrollo, /api va al servidor de Electron (npm run dev) o al standalone (npm run dev:web), ambos en :4100.
export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		port: 5173,
		strictPort: true,
		proxy: { '/api': 'http://127.0.0.1:4100' },
	},
	build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
