import { useEffect, type ReactNode } from 'react';
import { cx } from '../lib/format';
import { useUI } from '../lib/store';

export function ViewHeader({
	icon,
	iconClass,
	title,
	subtitle,
	right,
}: {
	icon?: ReactNode;
	iconClass?: string;
	title: ReactNode;
	subtitle?: ReactNode;
	right?: ReactNode;
}) {
	return (
		<header className="drag shrink-0 px-10 pt-9 pb-4">
			<div className="flex items-end gap-3">
				{icon && (
					<span className={cx('mb-0.5 flex size-8 items-center justify-center rounded-xl [&>svg]:size-[18px]', iconClass)}>
						{icon}
					</span>
				)}
				<div className="min-w-0 flex-1">
					<h1 className="font-display text-[26px] leading-8 font-bold tracking-tight">{title}</h1>
					{subtitle && <div className="mt-0.5 text-[12.5px] text-fg-2">{subtitle}</div>}
				</div>
				{right && <div className="no-drag flex items-center gap-2 pb-1">{right}</div>}
			</div>
		</header>
	);
}

export function ViewBody({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className="scroll min-h-0 flex-1">
			<div className={cx('mx-auto max-w-[780px] px-8 pb-24', className)}>{children}</div>
		</div>
	);
}

/** Publica el orden de la lista visible para moverse con ↑ ↓. */
export function useListIds(ids: number[]) {
	const setListIds = useUI((s) => s.setListIds);
	const key = ids.join(',');
	useEffect(() => {
		setListIds(key ? key.split(',').map(Number) : []);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [key]);
}
