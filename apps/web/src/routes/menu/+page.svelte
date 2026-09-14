<script lang="ts">
	import CardNav from '$lib/components/CardNav.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { CATALOG_ITEMS } from '$lib/nav.js';

	// El catálogo era una sola pantalla con el árbol entero en cuatro columnas
	// y los modificadores en una pestaña aparte. Cabía, pero obligaba a
	// atravesar tres niveles para llegar a lo que se venía a hacer, y cada
	// columna competía por el ancho con las demás.
	//
	// Ahora cada nivel es su propia pantalla y esto es el índice del módulo.
</script>

<PageHeader
	title="Catálogo"
	description="El menú se organiza en tres niveles —categoría, familia y subfamilia— y los ítems cuelgan del último."
/>

<CardNav items={CATALOG_ITEMS} label="Secciones del catálogo" />
