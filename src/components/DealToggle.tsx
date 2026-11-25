// «Deal abierto»: se marca en la cuenta (la empresa de la tarea o de su PoC), no en la tarea, así que vale para
// todas sus tareas y sigue ahí aunque se completen. Con deal abierto, la cuenta sale en Inicio si se queda quieta.

import { toast } from 'sonner';
import { useActions, useSettings } from '../api/hooks';
import { cx, plural } from '../lib/format';

export function DealToggle({ account, open }: { account: string; open: boolean }) {
	const a = useActions();
	const { data: s } = useSettings();
	const set = async (v: boolean) => {
		if (v === open) return;
		await a.setAccountDeal(account, v).catch(() => null);
		const days = s?.deal_stale_days ?? 0;
		toast.success(v ? `Deal abierto con ${account}` : `Deal con ${account} cerrado`, {
			description: v && days > 0 ? `Saldrá en Inicio si pasa ${plural(days, 'día', 'días')} sin nada nuevo en la cuenta.` : undefined,
			action: { label: 'Deshacer', onClick: () => a.setAccountDeal(account, !v) },
		});
	};
	const seg = (on: boolean) =>
		cx(
			'inline-flex h-6.5 items-center rounded-md px-2.5 text-[12.5px] font-medium transition-colors',
			on ? 'bg-raised text-fg shadow-sm' : 'text-fg-3 hover:text-fg-2',
		);
	return (
		<div className="inline-flex gap-0.5 rounded-lg bg-hover p-0.5" title={`El deal se guarda en la cuenta ${account}`}>
			<button type="button" onClick={() => set(true)} className={seg(open)}>
				Sí
			</button>
			<button type="button" onClick={() => set(false)} className={seg(!open)}>
				No
			</button>
		</div>
	);
}
