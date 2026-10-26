// Piezas básicas de interfaz: botones, popovers, menús, diálogos, campos que crecen solos.

import * as RDialog from '@radix-ui/react-dialog';
import * as RMenu from '@radix-ui/react-dropdown-menu';
import * as RPopover from '@radix-ui/react-popover';
import { X } from 'lucide-react';
import {
	forwardRef,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type ButtonHTMLAttributes,
	type ReactNode,
	type TextareaHTMLAttributes,
} from 'react';
import { cx } from '../lib/format';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'soft';
	size?: 'xs' | 'sm' | 'md';
	icon?: ReactNode;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
	{ variant = 'secondary', size = 'sm', icon, className, children, ...rest },
	ref,
) {
	return (
		<button
			ref={ref}
			className={cx(
				'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-[background,box-shadow,color,transform] duration-150 active:scale-[0.97] disabled:opacity-50',
				size === 'xs' && 'h-6 px-2 text-[11.5px]',
				size === 'sm' && 'h-7 px-2.5 text-[12.5px]',
				size === 'md' && 'h-8.5 px-3.5 text-[13px]',
				variant === 'primary' && 'bg-accent text-accent-fg shadow-sm hover:brightness-110',
				variant === 'secondary' && 'bg-raised text-fg shadow-[0_0_0_1px_var(--line-strong)] hover:bg-hover',
				variant === 'ghost' && 'text-fg-2 hover:bg-hover hover:text-fg',
				variant === 'soft' && 'bg-accent-soft text-accent-text hover:brightness-95',
				variant === 'danger' && 'bg-danger-soft text-danger hover:brightness-95',
				className,
			)}
			{...rest}
		>
			{icon}
			{children}
		</button>
	);
});

export function IconButton({ label, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
	return (
		<button
			aria-label={label}
			title={label}
			className={cx(
				'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-fg-3 transition-colors hover:bg-hover hover:text-fg',
				className,
			)}
			{...rest}
		/>
	);
}

export const Kbd = ({ children, className }: { children: ReactNode; className?: string }) => (
	<kbd
		className={cx(
			'inline-flex h-4.5 min-w-4.5 items-center justify-center rounded border border-line-strong px-1 font-sans text-[10.5px] text-fg-3',
			className,
		)}
	>
		{children}
	</kbd>
);

export function Popover({
	trigger,
	children,
	open,
	onOpenChange,
	align = 'start',
	side = 'bottom',
	className,
}: {
	trigger: ReactNode;
	children: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	align?: 'start' | 'center' | 'end';
	side?: 'top' | 'bottom' | 'left' | 'right';
	className?: string;
}) {
	return (
		<RPopover.Root open={open} onOpenChange={onOpenChange}>
			<RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
			<RPopover.Portal>
				<RPopover.Content
					align={align}
					side={side}
					sideOffset={6}
					collisionPadding={12}
					className={cx(
						'z-50 rounded-xl border border-line bg-raised p-3 text-fg shadow-float outline-none',
						'data-[state=open]:animate-[pop_.14s_ease-out]',
						className,
					)}
				>
					{children}
				</RPopover.Content>
			</RPopover.Portal>
		</RPopover.Root>
	);
}

export const PopoverClose = RPopover.Close;

export function Menu({ trigger, children, align = 'end' }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' }) {
	return (
		<RMenu.Root>
			<RMenu.Trigger asChild>{trigger}</RMenu.Trigger>
			<RMenu.Portal>
				<RMenu.Content
					align={align}
					sideOffset={4}
					collisionPadding={12}
					className="z-50 min-w-48 rounded-xl border border-line bg-raised p-1 text-fg shadow-float"
				>
					{children}
				</RMenu.Content>
			</RMenu.Portal>
		</RMenu.Root>
	);
}

export function MenuItem({
	icon,
	children,
	onSelect,
	danger,
	disabled,
}: {
	icon?: ReactNode;
	children: ReactNode;
	onSelect: () => void;
	danger?: boolean;
	disabled?: boolean;
}) {
	return (
		<RMenu.Item
			disabled={disabled}
			onSelect={onSelect}
			className={cx(
				'flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-active',
				danger && 'text-danger',
			)}
		>
			<span className="flex size-4 items-center justify-center text-fg-3 [&>svg]:size-4">{icon}</span>
			{children}
		</RMenu.Item>
	);
}

export const MenuSeparator = () => <RMenu.Separator className="my-1 h-px bg-line" />;
export const MenuLabel = ({ children }: { children: ReactNode }) => (
	<RMenu.Label className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-fg-3">{children}</RMenu.Label>
);

export function Dialog({
	open,
	onOpenChange,
	title,
	description,
	children,
	width = 440,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description?: string;
	children: ReactNode;
	width?: number;
}) {
	return (
		<RDialog.Root open={open} onOpenChange={onOpenChange}>
			<RDialog.Portal>
				<RDialog.Overlay className="fixed inset-0 z-50 bg-[rgb(7_14_52/0.28)] backdrop-blur-[2px] data-[state=open]:animate-[fade_.15s_ease-out]" />
				<RDialog.Content
					style={{ width }}
					className="fixed top-[16%] left-1/2 z-50 max-w-[92vw] -translate-x-1/2 rounded-2xl border border-line bg-raised p-5 text-fg shadow-float outline-none data-[state=open]:animate-[pop_.16s_ease-out]"
				>
					<div className="mb-4 flex items-start gap-3">
						<div className="min-w-0 flex-1">
							<RDialog.Title className="font-display text-[17px] font-semibold">{title}</RDialog.Title>
							{description ? (
								<RDialog.Description className="mt-1 text-[12.5px] text-fg-2">{description}</RDialog.Description>
							) : (
								<RDialog.Description className="sr-only">{title}</RDialog.Description>
							)}
						</div>
						<RDialog.Close asChild>
							<IconButton label="Cerrar">
								<X className="size-4" />
							</IconButton>
						</RDialog.Close>
					</div>
					{children}
				</RDialog.Content>
			</RDialog.Portal>
		</RDialog.Root>
	);
}

export function Confirm({
	open,
	onOpenChange,
	title,
	description,
	confirm,
	onConfirm,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	title: string;
	description: string;
	confirm: string;
	onConfirm: () => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange} title={title} description={description} width={400}>
			<div className="flex justify-end gap-2">
				<Button onClick={() => onOpenChange(false)}>Cancelar</Button>
				<Button
					variant="danger"
					autoFocus
					onClick={() => {
						onConfirm();
						onOpenChange(false);
					}}
				>
					{confirm}
				</Button>
			</div>
		</Dialog>
	);
}

/** Textarea que crece con el contenido. */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
	function AutoTextarea({ className, value, ...rest }, outer) {
		const inner = useRef<HTMLTextAreaElement | null>(null);
		useLayoutEffect(() => {
			const el = inner.current;
			if (!el) return;
			el.style.height = '0px';
			el.style.height = `${el.scrollHeight}px`;
		}, [value]);
		return (
			<textarea
				ref={(el) => {
					inner.current = el;
					if (typeof outer === 'function') outer(el);
					else if (outer) outer.current = el;
				}}
				rows={1}
				value={value}
				className={cx('w-full resize-none overflow-hidden bg-transparent outline-none placeholder:text-fg-3', className)}
				{...rest}
			/>
		);
	},
);

/** Valor local que se guarda al salir del campo (o con ↩ si `saveOnEnter`). */
export function useDraft(value: string | null | undefined, save: (v: string) => void) {
	const [draft, setDraft] = useState(value ?? '');
	const [editing, setEditing] = useState(false);
	useEffect(() => {
		if (!editing) setDraft(value ?? '');
	}, [value, editing]);
	return {
		value: draft,
		onChange: (e: { target: { value: string } }) => setDraft(e.target.value),
		onFocus: () => setEditing(true),
		onBlur: () => {
			setEditing(false);
			if (draft.trim() !== (value ?? '').trim()) save(draft.trim());
		},
	};
}

export const inputClass =
	'h-8 w-full rounded-lg bg-hover px-2.5 text-[13px] text-fg outline-none ring-accent/40 placeholder:text-fg-3 focus:bg-raised focus:ring-2';

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
	return (
		<div className="mb-2 flex items-center gap-2">
			<h3 className="text-[11.5px] font-semibold tracking-wide text-fg-3 uppercase">{children}</h3>
			<div className="ml-auto">{right}</div>
		</div>
	);
}
