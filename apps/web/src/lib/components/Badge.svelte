<script module lang="ts">
	export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Etiqueta de estado. Los tonos son semánticos, no decorativos: el color
	 * tiene que significar lo mismo en todas las pantallas.
	 *
	 * Las traducciones de los enums de la base viven en `$lib/status.ts`.
	 */
	interface Props {
		tone?: BadgeTone;
		children: Snippet;
	}

	let { tone = 'neutral', children }: Props = $props();
</script>

<span class="badge badge--{tone}">{@render children()}</span>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: 0.15rem var(--space-2);
		border-radius: var(--radius-pill);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.02em;
		white-space: nowrap;
	}

	.badge--neutral {
		background: var(--color-neutral-tint);
		color: var(--color-neutral);
	}

	.badge--primary {
		background: var(--color-primary-tint);
		color: var(--color-primary-hover);
	}

	.badge--success {
		background: var(--color-success-tint);
		color: var(--color-success);
	}

	.badge--warning {
		background: var(--color-warning-tint);
		color: var(--color-warning);
	}

	.badge--danger {
		background: var(--color-danger-tint);
		color: var(--color-danger);
	}
</style>
