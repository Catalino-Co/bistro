<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * La vuelta al índice de un módulo, para las rutas hijas.
	 *
	 * Va de la mano de `CardNav`: si se entra por tarjetas, tiene que haber
	 * forma de volver. En una tableta montada en la pared, sin botón de atrás
	 * del navegador, es la diferencia entre navegar y quedarse encerrado.
	 */
	interface Props {
		href: string;
		label: string;
	}

	let { href, label }: Props = $props();
</script>

<a class="back" {href}>
	<Icon name="chevron" size={16} />
	{label}
</a>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		min-height: var(--touch-min);
		margin-bottom: var(--space-1);
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.back :global(svg) {
		transform: rotate(180deg);
	}

	.back:hover {
		color: var(--color-primary);
	}

	.back:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
		border-radius: var(--radius-sm);
	}
</style>
