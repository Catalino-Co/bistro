<script lang="ts">
	import CardNav from '$lib/components/CardNav.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { SETTINGS_ITEMS } from '$lib/nav.js';

	// `/settings` entraba por redirección a la primera sección que existiera,
	// porque una sub-navegación lateral no es una pantalla. Ahora sí lo es:
	// el índice del módulo, que además dice de qué va cada sección en vez de
	// dejarlo en una palabra suelta de la barra.
</script>

<PageHeader
	title="Ajustes"
	description="Todo lo que se configura una vez al montar el local y casi no se vuelve a tocar."
/>

<CardNav items={SETTINGS_ITEMS} label="Secciones de ajustes" />
