<script lang="ts">
	import { page } from '$app/state';
	import Icon from '$lib/components/Icon.svelte';
	import { isActive, SETTINGS_ITEMS } from '$lib/nav.js';

	// Todo lo que se configura una vez y no se vuelve a tocar vive detrás de
	// esta única entrada, con su propia sub-navegación. Antes cuatro de estas
	// secciones competían por espacio en la barra principal con las pantallas
	// que se usan durante el servicio.
	let { children } = $props();

	let nav = $state<HTMLElement | null>(null);

	// En la tira horizontal (tableta) la sección activa puede quedar fuera de
	// pantalla, y entonces nada indica dónde estás. Se trae a la vista al
	// entrar y en cada cambio de ruta.
	$effect(() => {
		const current = page.url.pathname;
		nav
			?.querySelector(`a[href="${current}"]`)
			?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	});
</script>

<div class="settings">
	<nav class="subnav" aria-label="Secciones de ajustes" bind:this={nav}>
		<p class="subnav-title">Ajustes</p>
		<ul>
			{#each SETTINGS_ITEMS as item (item.href)}
				<li>
					{#if item.pending}
						<span class="subnav-link is-pending" title="Llega en la {item.pending}">
							<Icon name={item.icon} size={17} />
							<span class="subnav-label">{item.label}</span>
							<span class="subnav-phase">{item.pending}</span>
						</span>
					{:else}
						<a
							href={item.href}
							class="subnav-link"
							class:active={isActive(item.href, page.url.pathname)}
							aria-current={isActive(item.href, page.url.pathname) ? 'page' : undefined}
						>
							<Icon name={item.icon} size={17} />
							<span class="subnav-label">{item.label}</span>
						</a>
					{/if}
				</li>
			{/each}
		</ul>
	</nav>

	<div class="settings-content">
		{@render children()}
	</div>
</div>

<style>
	.settings {
		display: flex;
		align-items: flex-start;
		gap: var(--space-6);
	}

	.subnav {
		width: 232px;
		flex-shrink: 0;
	}

	.subnav-title {
		margin: 0 0 var(--space-3);
		padding: 0 var(--space-3);
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 600;
	}

	.subnav ul {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.subnav-link {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--touch-min);
		padding: 0 var(--space-3);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		text-decoration: none;
		font-size: var(--text-sm);
		font-weight: 500;
	}

	a.subnav-link:hover {
		background: var(--color-surface);
		color: var(--color-text);
	}

	a.subnav-link.active {
		background: var(--color-surface);
		color: var(--color-primary);
		font-weight: 600;
		box-shadow: var(--shadow-sm);
	}

	a.subnav-link:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	.subnav-link.is-pending {
		opacity: 0.45;
		cursor: default;
	}

	.subnav-label {
		flex: 1;
		min-width: 0;
	}

	.subnav-phase {
		font-size: var(--text-xs);
		font-weight: 600;
	}

	.settings-content {
		flex: 1;
		min-width: 0;
	}

	/* En tableta la sub-navegación pasa a ser una tira horizontal con scroll:
	   dos columnas no caben junto a un formulario utilizable. */
	@media (max-width: 900px) {
		.settings {
			flex-direction: column;
			gap: var(--space-4);
		}

		.subnav {
			width: 100%;
		}

		.subnav ul {
			flex-direction: row;
			overflow-x: auto;
			scrollbar-width: thin;
			gap: var(--space-1);
			padding-bottom: var(--space-1);
		}

		.subnav-link {
			white-space: nowrap;
		}

		.settings-content {
			width: 100%;
		}
	}
</style>
