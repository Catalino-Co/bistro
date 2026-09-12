<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import Icon from '$lib/components/Icon.svelte';
	import Toast from '$lib/components/Toast.svelte';
	import { isActive, NAV_GROUPS } from '$lib/nav.js';
	import { session } from '$lib/session.svelte.js';
	import '$lib/styles/tokens.css';

	let { children } = $props();

	onMount(() => {
		session.load();
	});

	$effect(() => {
		if (!session.loaded) return;
		const isLoginPage = page.url.pathname === '/login';
		if (!session.user && !isLoginPage) {
			goto('/login');
		} else if (session.user && isLoginPage) {
			goto('/');
		}
	});

	// El cambio de sucursal vivía suelto en la pantalla de Inicio, que ahora
	// es el panel del día. Aquí está siempre a mano y deja claro sobre qué
	// sucursal se está trabajando.
	let switching = $state(false);

	async function handleSelectBranch(event: Event) {
		const branchId = Number((event.currentTarget as HTMLSelectElement).value);
		if (!Number.isInteger(branchId) || branchId === session.user?.branchId) return;
		switching = true;
		try {
			await session.selectBranch(branchId);
			// Recarga dura a propósito: cada pantalla trae datos de la sucursal
			// activa y ninguna sabe volver a pedirlos por su cuenta.
			location.reload();
		} finally {
			switching = false;
		}
	}

	async function handleLogout() {
		await session.logout();
		goto('/login');
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if !session.loaded}
	<p class="loading">Cargando…</p>
{:else if session.user}
	<div class="shell">
		<nav class="sidebar" aria-label="Navegación principal">
			<div class="brand">
				<Icon name="plate" size={26} />
				<span class="brand-name">Bistro</span>
			</div>

			{#if session.branches.length > 0}
				<div class="branch-picker">
					<label for="branch-picker">Sucursal</label>
					{#if session.branches.length === 1}
						<p class="branch-single">{session.branches[0]!.name}</p>
					{:else}
						<select
							id="branch-picker"
							value={session.user.branchId ?? ''}
							disabled={switching}
							onchange={handleSelectBranch}
						>
							{#if session.user.branchId === null}
								<option value="">Elige una…</option>
							{/if}
							{#each session.branches as branch (branch.id)}
								<option value={branch.id}>{branch.name}</option>
							{/each}
						</select>
					{/if}
				</div>
			{/if}

			<div class="nav-groups">
				{#each NAV_GROUPS as group (group.label)}
					<div class="nav-group">
						<p class="group-label">{group.label}</p>
						<ul>
							{#each group.items as item (item.href)}
								<li>
									{#if item.pending}
										<span class="nav-link is-pending" title="Llega en la {item.pending}">
											<Icon name={item.icon} />
											<span class="nav-label">{item.label}</span>
											<span class="nav-phase">{item.pending}</span>
										</span>
									{:else}
										<a
											href={item.href}
											class="nav-link"
											class:active={isActive(item.href, page.url.pathname)}
											aria-current={isActive(item.href, page.url.pathname) ? 'page' : undefined}
											title={item.label}
										>
											<Icon name={item.icon} />
											<span class="nav-label">{item.label}</span>
										</a>
									{/if}
								</li>
							{/each}
						</ul>
					</div>
				{/each}
			</div>

			<div class="sidebar-footer">
				<div class="user-info">
					<span class="user-name">{session.user.fullName}</span>
				</div>
				<button type="button" class="logout" onclick={handleLogout}>
					<Icon name="logout" size={18} />
					<span class="nav-label">Cerrar sesión</span>
				</button>
			</div>
		</nav>

		<main class="content">
			{@render children()}
		</main>
	</div>
{:else}
	{@render children()}
{/if}

<!-- Único punto de montaje de los avisos: toda la app escribe en el store. -->
<Toast />

<style>
	.loading {
		padding: var(--space-6);
	}

	.shell {
		display: flex;
		align-items: flex-start;
		min-height: 100vh;
	}

	/* Pegada al viewport: antes se iba con el scroll y en una pantalla larga
	   (catálogo, cocina) la navegación desaparecía. */
	.sidebar {
		position: sticky;
		top: 0;
		width: 240px;
		flex-shrink: 0;
		height: 100vh;
		overflow-y: auto;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
		padding: var(--space-5) var(--space-4);
	}

	.brand {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-family: var(--font-display);
		font-weight: 700;
		font-size: var(--text-xl);
		color: var(--color-primary);
		padding: 0 var(--space-2);
	}

	.nav-groups {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: var(--space-5);
	}

	.nav-group ul {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.group-label {
		margin: 0 0 var(--space-2);
		padding: 0 var(--space-3);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.nav-link {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		min-height: var(--touch-min);
		padding: 0 var(--space-3);
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		text-decoration: none;
		font-weight: 500;
	}

	a.nav-link:hover {
		background: var(--color-primary-tint);
		color: var(--color-text);
	}

	a.nav-link.active {
		background: var(--color-primary-tint);
		color: var(--color-primary);
		font-weight: 600;
	}

	a.nav-link:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	/* Entradas del plan que todavía no tienen pantalla: se ven, no navegan. */
	.nav-link.is-pending {
		opacity: 0.45;
		cursor: default;
	}

	.nav-label {
		flex: 1;
		min-width: 0;
	}

	.nav-phase {
		font-size: var(--text-xs);
		font-weight: 600;
		color: var(--color-text-muted);
	}

	.sidebar-footer {
		border-top: 1px solid var(--color-border);
		padding-top: var(--space-3);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.user-info {
		display: flex;
		flex-direction: column;
		padding: 0 var(--space-2);
		min-width: 0;
	}

	.user-name {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.branch-picker {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: 0 var(--space-2);
	}

	.branch-picker label {
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.branch-picker select {
		width: 100%;
		min-height: var(--control-h-md);
		font-weight: 600;
	}

	.branch-single {
		margin: 0;
		font-weight: 600;
	}

	.logout {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		min-height: var(--control-h-md);
		background: transparent;
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
	}

	.logout:hover {
		background: var(--color-danger-tint);
		color: var(--color-danger);
	}

	.content {
		flex: 1;
		padding: var(--space-6);
		min-width: 0;
	}

	/* Por debajo de 900px la barra se reduce a iconos: mantiene la navegación
	   siempre visible sin robarle la mitad del ancho a una tableta. */
	@media (max-width: 900px) {
		.sidebar {
			width: 68px;
			padding: var(--space-4) var(--space-2);
			align-items: center;
		}

		/* Los rótulos se ocultan a la vista, no al lector de pantalla: con
		   `display: none` la barra colapsada se quedaría sin nombres y cada
		   entrada sería un icono mudo. */
		.brand-name,
		.branch-picker,
		.nav-label,
		.nav-phase,
		.group-label,
		.user-info {
			position: absolute;
			width: 1px;
			height: 1px;
			overflow: hidden;
			clip-path: inset(50%);
			white-space: nowrap;
		}

		.nav-link,
		.logout {
			justify-content: center;
			padding: 0;
		}

		.nav-group + .nav-group {
			border-top: 1px solid var(--color-border);
			padding-top: var(--space-3);
		}

		.nav-groups {
			gap: var(--space-3);
			width: 100%;
		}

		.sidebar-footer {
			width: 100%;
		}

		.content {
			padding: var(--space-4);
		}
	}
</style>
