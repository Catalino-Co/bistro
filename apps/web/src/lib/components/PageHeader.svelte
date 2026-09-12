<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Encabezado de pantalla: título, descripción y acción primaria siempre
	 * en la misma posición. Hoy cada pantalla abre con un `<h1>` suelto y la
	 * acción de crear aparece donde caiga -- a veces arriba, a veces al pie
	 * de la lista.
	 */
	interface Props {
		title: string;
		description?: string;
		/** Acciones alineadas a la derecha; la primaria va de última. */
		actions?: Snippet;
	}

	let { title, description, actions }: Props = $props();
</script>

<header class="page-header">
	<div class="heading">
		<h1>{title}</h1>
		{#if description}<p>{description}</p>{/if}
	</div>
	{#if actions}
		<div class="actions">{@render actions()}</div>
	{/if}
</header>

<style>
	.page-header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-5);
	}

	.heading {
		min-width: 0;
	}

	h1 {
		margin: 0;
		font-size: var(--text-2xl);
	}

	.heading p {
		margin: var(--space-1) 0 0;
		max-width: 60ch;
		color: var(--color-text-muted);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}
</style>
