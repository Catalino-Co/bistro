<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';

	// Las dos pestañas (Catálogo · Modificadores) se fueron: el módulo tiene
	// cinco secciones y se entra por tarjetas desde `/menu`. Lo único que
	// queda aquí es la vuelta al índice, que en una tableta sin botón de
	// atrás es la diferencia entre navegar y quedarse encerrado.
	let { children } = $props();

	const atIndex = $derived(page.url.pathname === '/menu');
</script>

{#if !atIndex}
	<a class="back" href="/menu">
		<Icon name="chevron" size={16} />
		Catálogo
	</a>
{/if}

{@render children()}

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
