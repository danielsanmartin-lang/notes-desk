// Acciones con su toast de "Deshacer", compartidas por filas, panel de detalle y atajos de teclado.

import { useMemo } from 'react';
import { toast } from 'sonner';
import { formatDay } from '../../shared/dates.js';
import { useActions } from '../api/hooks';
import type { Item } from '../api/types';

export function useItemOps() {
	const a = useActions();
	return useMemo(
		() => ({
			toggle: async (item: Pick<Item, 'id' | 'title' | 'state'>) => {
				if (item.state === 'done') {
					await a.reopen(item.id);
					return;
				}
				await a.complete(item.id);
				toast.success('Completada', {
					description: item.title,
					action: { label: 'Deshacer', onClick: () => a.reopen(item.id) },
				});
			},
			remove: async (item: Pick<Item, 'id' | 'title'>) => {
				await a.remove(item.id);
				toast('Movida a la papelera', {
					description: item.title,
					action: { label: 'Deshacer', onClick: () => a.restore(item.id) },
				});
			},
			touch: async (item: Pick<Item, 'id'>, body: { channel?: string | null; body?: string; next_date?: string | null }) => {
				const res = await a.touch(item.id, body);
				const next = res.item.due_date;
				toast.success('Toque registrado', {
					description: next ? `Próximo follow-up: ${formatDay(next)}` : 'Sin fecha de próximo follow-up',
					action: { label: 'Deshacer', onClick: () => a.deleteActivity(res.activity_id) },
				});
			},
			reply: async (item: Pick<Item, 'id'>, body: { body?: string; complete?: boolean }) => {
				const res = await a.reply(item.id, body);
				toast.success(body.complete ? 'Respondido y cerrado' : 'Han respondido: te toca a ti', {
					action: { label: 'Deshacer', onClick: () => a.deleteActivity(res.activity_id) },
				});
			},
		}),
		[a],
	);
}
