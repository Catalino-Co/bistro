<script lang="ts">
	import { page } from '$app/state';
	import BackLink from '$lib/components/BackLink.svelte';

	// Todo lo que se configura una vez y no se vuelve a tocar vive detrás de
	// esta única entrada de la barra lateral. Antes cuatro de estas secciones
	// competían por espacio con las pantallas que se usan durante el servicio.
	let { children } = $props();

	const atIndex = $derived(page.url.pathname === '/settings');
</script>

{#if !atIndex}
	<BackLink href="/settings" label="Ajustes" />
{/if}

{@render children()}
