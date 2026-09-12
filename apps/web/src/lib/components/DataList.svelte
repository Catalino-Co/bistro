<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Contenedor de filas. Se usa con `DataListRow`, que es quien alinea
	 * título, metadatos y acciones en la misma posición fila tras fila --
	 * hoy cada pantalla suelta sus botones a continuación del texto y la
	 * columna de acciones baila según el largo del nombre.
	 */
	interface Props {
		children: Snippet;
	}

	let { children }: Props = $props();
</script>

<ul class="data-list">
	{@render children()}
</ul>

<style>
	.data-list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		overflow: hidden;
		background: var(--color-surface);
	}
</style>
