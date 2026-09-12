<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import Icon from '$lib/components/Icon.svelte';
	import { session } from '$lib/session.svelte.js';
	import '$lib/styles/tokens.css';

	let { children } = $props();

	const NAV_ITEMS = [
		{ href: '/', label: 'Inicio', icon: 'home' as const },
		{ href: '/admin/floor', label: 'Mesas y áreas', icon: 'tables' as const },
		{ href: '/admin/catalog', label: 'Catálogo', icon: 'catalog' as const },
		{ href: '/admin/modifiers', label: 'Modificadores', icon: 'modifiers' as const },
		{ href: '/admin/roles', label: 'Roles y permisos', icon: 'roles' as const },
		{ href: '/kitchen', label: 'Cocina', icon: 'kitchen' as const },
	];

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

	async function handleLogout() {
		await session.logout();
		goto('/login');
	}

	function isActive(href: string): boolean {
		return href === '/' ? page.url.pathname === '/' : page.url.pathname.startsWith(href);
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if !session.loaded}
	<p class="loading">Cargando…</p>
{:else if session.user}
	<div class="shell">
		<nav class="sidebar">
			<div class="brand">
				<Icon name="plate" size={26} />
				<span>Bistro</span>
			</div>

			<ul class="nav-list">
				{#each NAV_ITEMS as item (item.href)}
					<li>
						<a href={item.href} class:active={isActive(item.href)}>
							<Icon name={item.icon} />
							<span>{item.label}</span>
						</a>
					</li>
				{/each}
			</ul>

			<div class="sidebar-footer">
				<div class="user-info">
					<span class="user-name">{session.user.fullName}</span>
					{#if session.currentBranch}
						<span class="branch-name">{session.currentBranch.name}</span>
					{/if}
				</div>
				<button type="button" class="logout" onclick={handleLogout}>
					<Icon name="logout" size={18} />
					Cerrar sesión
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

<style>
	.loading {
		padding: 2rem;
	}

	.shell {
		display: flex;
		min-height: 100vh;
	}

	.sidebar {
		width: 240px;
		flex-shrink: 0;
		background: var(--color-surface);
		border-right: 1px solid var(--color-border);
		display: flex;
		flex-direction: column;
		padding: 1.25rem 1rem;
	}

	.brand {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-family: var(--font-display);
		font-weight: 700;
		font-size: 1.25rem;
		color: var(--color-primary);
		padding: 0 0.5rem 1.5rem;
	}

	.nav-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		flex: 1;
	}

	.nav-list a {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.55rem 0.75rem;
		border-radius: var(--radius-sm);
		color: var(--color-text-muted);
		text-decoration: none;
		font-weight: 500;
	}

	.nav-list a:hover {
		background: var(--color-primary-tint);
		color: var(--color-text);
	}

	.nav-list a.active {
		background: var(--color-primary-tint);
		color: var(--color-primary);
	}

	.sidebar-footer {
		border-top: 1px solid var(--color-border);
		padding-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.user-info {
		display: flex;
		flex-direction: column;
		padding: 0 0.5rem;
	}

	.user-name {
		font-weight: 600;
	}

	.branch-name {
		font-size: 0.8rem;
		color: var(--color-text-muted);
	}

	.logout {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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
		padding: 2rem;
		min-width: 0;
	}
</style>
