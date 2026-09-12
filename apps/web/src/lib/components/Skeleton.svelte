<script lang="ts">
	/**
	 * Marcador de carga. Reserva el espacio que va a ocupar el contenido en
	 * vez de dejar la pantalla en blanco mientras llega la respuesta.
	 *
	 * Se anuncia como `aria-busy` en una región viva para que un lector de
	 * pantalla sepa que hay algo cargando y no solo silencio.
	 */
	interface Props {
		/** Cantidad de barras apiladas. */
		lines?: number;
		/** Alto de cada barra. */
		height?: string;
		label?: string;
	}

	let { lines = 3, height = '1rem', label = 'Cargando…' }: Props = $props();
</script>

<div class="skeleton" role="status" aria-busy="true" aria-label={label}>
	{#each Array.from({ length: lines }, (_, i) => i) as line (line)}
		<span class="bar" style:height style:width={line === lines - 1 ? '60%' : '100%'}></span>
	{/each}
</div>

<style>
	.skeleton {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.bar {
		display: block;
		border-radius: var(--radius-sm);
		background: linear-gradient(
			90deg,
			var(--color-neutral-tint) 25%,
			var(--color-surface-sunk) 50%,
			var(--color-neutral-tint) 75%
		);
		background-size: 200% 100%;
		animation: shimmer 1.4s ease-in-out infinite;
	}

	@keyframes shimmer {
		from {
			background-position: 200% 0;
		}
		to {
			background-position: -200% 0;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.bar {
			animation: none;
			background: var(--color-neutral-tint);
		}
	}
</style>
