<script module lang="ts">
	import type { IconName } from '$lib/icons.js';

	export interface CardNavItem {
		href: string;
		label: string;
		/** Qué se administra aquí. Una línea, en los términos del restaurante. */
		description: string;
		icon: IconName;
		/** Fase en la que llega. Si está, la tarjeta se dibuja apagada y no navega. */
		pending?: string;
	}
</script>

<script lang="ts">
	import Icon from './Icon.svelte';

	/**
	 * El índice de un módulo: una tarjeta por sección, cada una con su icono,
	 * su nombre y una línea de qué se administra ahí.
	 *
	 * Es el estándar de la app para cuando un módulo tiene varias secciones
	 * (ver `docs/ui-standards.md`). Sustituye a las pestañas, que obligan a
	 * leer una palabra suelta para adivinar qué hay detrás y que se rompen en
	 * cuanto pasan de cuatro. Una tarjeta cabe explicarse.
	 */
	interface Props {
		items: CardNavItem[];
		/** Etiqueta del `<nav>` para lectores de pantalla. */
		label: string;
	}

	let { items, label }: Props = $props();
</script>

<nav class="cards" aria-label={label}>
	{#each items as item (item.href)}
		{#if item.pending}
			<div class="card is-pending" title="Llega en la {item.pending}">
				<span class="tile"><Icon name={item.icon} size={22} /></span>
				<span class="text">
					<span class="label">{item.label}</span>
					<span class="description">{item.description}</span>
				</span>
				<span class="phase">{item.pending}</span>
			</div>
		{:else}
			<a class="card" href={item.href}>
				<span class="tile"><Icon name={item.icon} size={22} /></span>
				<span class="text">
					<span class="label">{item.label}</span>
					<span class="description">{item.description}</span>
				</span>
				<span class="chevron" aria-hidden="true"><Icon name="chevron" size={18} /></span>
			</a>
		{/if}
	{/each}
</nav>

<style>
	.cards {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: var(--space-4);
	}

	.card {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		/* Alto cómodo para un dedo en tableta, que es donde se usa. */
		min-height: 84px;
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		color: inherit;
		text-decoration: none;
	}

	a.card:hover {
		border-color: var(--color-primary);
		box-shadow: var(--shadow-md);
	}

	a.card:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.tile {
		display: grid;
		place-items: center;
		flex-shrink: 0;
		width: 44px;
		height: 44px;
		border-radius: var(--radius-sm);
		background: var(--color-primary-tint);
		color: var(--color-primary);
	}

	.text {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.label {
		font-weight: 600;
	}

	.description {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.chevron {
		flex-shrink: 0;
		color: var(--color-text-muted);
	}

	a.card:hover .chevron {
		color: var(--color-primary);
	}

	.card.is-pending {
		opacity: 0.55;
	}

	.phase {
		flex-shrink: 0;
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-muted);
	}
</style>
