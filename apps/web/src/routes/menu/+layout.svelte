<script lang="ts">
	import { page } from '$app/state';
	import { isActive } from '$lib/nav.js';

	// Los modificadores dejan de ser una entrada de primer nivel: son parte
	// del catálogo, no un módulo aparte. En la Fase 2 las dos pestañas se
	// funden en una vista maestro-detalle sobre el mismo ítem.
	let { children } = $props();

	const TABS = [
		{ href: '/menu', label: 'Catálogo' },
		{ href: '/menu/modifiers', label: 'Modificadores' },
	];
</script>

<nav class="tabs" aria-label="Secciones del catálogo">
	{#each TABS as tab (tab.href)}
		{@const active = tab.href === '/menu' ? page.url.pathname === '/menu' : isActive(tab.href, page.url.pathname)}
		<a href={tab.href} class="tab" class:active aria-current={active ? 'page' : undefined}>
			{tab.label}
		</a>
	{/each}
</nav>

{@render children()}

<style>
	.tabs {
		display: flex;
		gap: var(--space-1);
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--space-5);
		overflow-x: auto;
	}

	.tab {
		display: flex;
		align-items: center;
		min-height: var(--touch-min);
		padding: 0 var(--space-4);
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		color: var(--color-text-muted);
		text-decoration: none;
		font-weight: 600;
		white-space: nowrap;
	}

	.tab:hover {
		color: var(--color-text);
	}

	.tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.tab:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}
</style>
