<script lang="ts">
	import { page } from '$app/state';
	import BackLink from '$lib/components/BackLink.svelte';

	// Las dos pestañas (Catálogo · Modificadores) se fueron: el módulo tiene
	// cinco secciones y se entra por tarjetas desde `/menu`.
	let { children } = $props();

	const atIndex = $derived(page.url.pathname === '/menu');
</script>

{#if !atIndex}
	<BackLink href="/menu" label="Catálogo" />
{/if}

{@render children()}
