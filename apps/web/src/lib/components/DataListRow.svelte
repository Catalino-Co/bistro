<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Una fila: título + metadatos a la izquierda, acciones a la derecha,
	 * siempre en el mismo sitio. Si la fila entera es navegable (`href`) o
	 * seleccionable (`onclick`), esa zona se renderiza como un control real
	 * -- nada de `onclick` sobre un `<div>`, que no responde al teclado.
	 */
	interface Props {
		title: string;
		meta?: string;
		href?: string;
		onclick?: () => void;
		selected?: boolean;
		/** Detalle adicional bajo el título (badges, notas, subtítulos). */
		children?: Snippet;
		/** Botones alineados a la derecha. */
		actions?: Snippet;
	}

	let { title, meta, href, onclick, selected = false, children, actions }: Props = $props();
</script>

<li class="row" class:row--selected={selected}>
	{#if href}
		<a class="main" {href} aria-current={selected ? 'true' : undefined}>
			<span class="title">{title}</span>
			{#if meta}<span class="meta">{meta}</span>{/if}
			{#if children}<span class="detail">{@render children()}</span>{/if}
		</a>
	{:else if onclick}
		<button type="button" class="main" aria-pressed={selected} {onclick}>
			<span class="title">{title}</span>
			{#if meta}<span class="meta">{meta}</span>{/if}
			{#if children}<span class="detail">{@render children()}</span>{/if}
		</button>
	{:else}
		<div class="main">
			<span class="title">{title}</span>
			{#if meta}<span class="meta">{meta}</span>{/if}
			{#if children}<span class="detail">{@render children()}</span>{/if}
		</div>
	{/if}

	{#if actions}
		<div class="actions">{@render actions()}</div>
	{/if}
</li>

<style>
	.row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		padding-right: var(--space-3);
		border-bottom: 1px solid var(--color-border);
	}

	.row:last-child {
		border-bottom: none;
	}

	.row--selected {
		background: var(--color-primary-tint);
	}

	.main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: var(--space-1) var(--space-3);
		min-height: var(--touch-min);
		padding: var(--space-2) var(--space-3);
		text-align: left;
		font: inherit;
		color: inherit;
		text-decoration: none;
	}

	/* `.main` puede ser <a>, <button> o <div>; los dos primeros traen
	   estilos propios del navegador que hay que apagar aquí. */
	button.main {
		background: none;
		border: none;
		cursor: pointer;
		border-radius: 0;
	}

	button.main:hover,
	a.main:hover {
		background: var(--color-surface-sunk);
	}

	.main:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	.title {
		font-weight: 600;
	}

	.meta {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.detail {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-1);
		flex-shrink: 0;
	}
</style>
