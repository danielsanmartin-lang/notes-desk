import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, type CSSProperties } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import { subscribe } from './api/client';
import { App } from './App';
import { ThemeSync } from './lib/theme';
import { QuickCapture } from './QuickCapture';
import './styles.css';

const isQuick = location.hash.startsWith('#/quick');
if (window.zd) document.documentElement.classList.add('electron');
if (isQuick) document.documentElement.classList.add('quick');

const queryClient = new QueryClient({
	defaultOptions: { queries: { staleTime: 10_000, refetchOnWindowFocus: true, retry: 1 } },
});
// Lo que cambie otra ventana (captura rápida, avisos, tray) se refleja aquí al momento.
subscribe(() => queryClient.invalidateQueries());

const toastStyle = {
	'--normal-bg': 'var(--raised)',
	'--normal-text': 'var(--fg)',
	'--normal-border': 'var(--line-strong)',
	'--border-radius': '12px',
} as CSSProperties;

createRoot(document.getElementById('root')!).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<ThemeSync />
			{isQuick ? <QuickCapture /> : <App />}
			<Toaster position={isQuick ? 'bottom-center' : 'bottom-center'} style={toastStyle} duration={4500} gap={8} visibleToasts={3} />
		</QueryClientProvider>
	</StrictMode>,
);
