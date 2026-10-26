// Marca de Zepo Desk: cuadrado navy → azul Zepo con un check y un punto turquesa (el "toque").
export function Logo({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 32 32" className={className} aria-hidden="true">
			<defs>
				<linearGradient id="zd-logo" x1="0" y1="0" x2="1" y2="1">
					<stop offset="0" stopColor="#2A3270" />
					<stop offset="1" stopColor="#142CD1" />
				</linearGradient>
			</defs>
			<rect width="32" height="32" rx="8" fill="url(#zd-logo)" />
			<path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
			<circle cx="24.5" cy="23.5" r="3" fill="#7BE9E4" />
		</svg>
	);
}
