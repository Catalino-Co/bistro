<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from '$lib/icons.js';

	/**
	 * Lista vacía. Hoy una sección sin datos simplemente no pinta nada, y no
	 * hay forma de distinguir "todavía no hay nada" de "no cargó". Siempre
	 * debe decir qué falta y, si aplica, ofrecer la acción para crearlo.
	 */
	interface Props {
		title: string;
		description?: string;
		icon?: IconName;
		/** Acción primaria: normalmente el botón de crear el primer registro. */
		action?: Snippet;
	}

	let { title, description, icon = 'inbox', action }: Props = $props();
</script>

<div class="empty">
	<span class="icon"><Icon name={icon} size={26} /></span>
	<p class="title">{title}</p>
	{#if description}<p class="description">{description}</p>{/if}
	{#if action}
		<div class="action">{@render action()}</div>
	{/if}
</div>

<style>
	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-7) var(--space-5);
		text-align: center;
		border: 1px dashed var(--color-border-strong);
		border-radius: var(--radius-md);
		background: var(--color-surface-sunk);
	}

	.icon {
		display: flex;
		color: var(--color-text-muted);
	}

	.title {
		margin: 0;
		font-family: var(--font-display);
		font-weight: 600;
		font-size: var(--text-lg);
	}

	.description {
		margin: 0;
		max-width: 42ch;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.action {
		margin-top: var(--space-2);
	}
</style>
