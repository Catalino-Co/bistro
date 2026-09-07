<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import favicon from '$lib/assets/favicon.svg';
	import { session } from '$lib/session.svelte.js';

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

	async function handleLogout() {
		await session.logout();
		goto('/login');
	}
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{#if !session.loaded}
	<p>Cargando…</p>
{:else}
	{#if session.user}
		<header>
			<span>{session.user.fullName}</span>
			{#if session.currentBranch}
				<span> · {session.currentBranch.name}</span>
			{/if}
			<a href="/">Inicio</a>
			<a href="/admin/catalog">Catálogo</a>
			<a href="/admin/modifiers">Modificadores</a>
			<a href="/admin/roles">Roles y permisos</a>
			<button onclick={handleLogout}>Cerrar sesión</button>
		</header>
	{/if}
	{@render children()}
{/if}
