<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';
	import Icon from './Icon.svelte';
	import type { IconName } from '$lib/icons.js';

	/**
	 * El botón del sistema. Tres cosas que no existían antes y que este
	 * componente resuelve de una vez:
	 *
	 * 1. Jerarquía real: `primary` es la acción de la pantalla, `secondary`
	 *    lo demás, `ghost` lo terciario. Solo debe haber un `primary` visible
	 *    por bloque.
	 * 2. Variante `danger`: lo destructivo deja de verse idéntico a "Editar".
	 * 3. Estado `loading`: deshabilita el botón mientras la mutación está en
	 *    vuelo, así el doble clic deja de duplicar órdenes y pagos.
	 *
	 * El default es `secondary` a propósito: obliga a marcar explícitamente
	 * cuál es la acción primaria en vez de que todo lo sea por omisión.
	 */
	interface Props extends HTMLButtonAttributes {
		variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
		size?: 'sm' | 'md' | 'lg';
		icon?: IconName;
		loading?: boolean;
		/** Ocupa todo el ancho disponible (formularios angostos, modales). */
		block?: boolean;
		children?: Snippet;
	}

	let {
		variant = 'secondary',
		size = 'md',
		type = 'button',
		icon,
		loading = false,
		block = false,
		disabled = false,
		class: extraClass = '',
		children,
		...rest
	}: Props = $props();

	const iconSize = $derived(size === 'sm' ? 15 : size === 'lg' ? 20 : 17);
</script>

<button
	{...rest}
	{type}
	class="btn btn--{variant} btn--{size} {extraClass}"
	class:btn--block={block}
	class:btn--square={!children}
	disabled={disabled || loading}
	aria-busy={loading}
>
	{#if loading}
		<span class="spinner" aria-hidden="true"></span>
	{:else if icon}
		<Icon name={icon} size={iconSize} />
	{/if}
	{#if children}
		<span>{@render children()}</span>
	{/if}
</button>

<style>
	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		font: inherit;
		font-weight: 600;
		line-height: 1;
		white-space: nowrap;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition:
			background-color 0.15s ease,
			border-color 0.15s ease,
			color 0.15s ease;
	}

	.btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.btn:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	/* Tamaños */
	.btn--sm {
		min-height: var(--control-h-sm);
		padding: 0 var(--space-3);
		font-size: var(--text-sm);
	}

	.btn--md {
		min-height: var(--control-h-md);
		padding: 0 var(--space-4);
		font-size: var(--text-md);
	}

	.btn--lg {
		min-height: var(--control-h-lg);
		padding: 0 var(--space-5);
		font-size: var(--text-lg);
	}

	.btn--square {
		padding: 0;
		aspect-ratio: 1;
	}

	.btn--block {
		display: flex;
		width: 100%;
	}

	/* Variantes */
	.btn--primary {
		background: var(--color-primary);
		color: var(--color-surface);
	}

	.btn--primary:hover:not(:disabled) {
		background: var(--color-primary-hover);
	}

	.btn--secondary {
		background: var(--color-surface);
		color: var(--color-text);
		border-color: var(--color-border);
	}

	.btn--secondary:hover:not(:disabled) {
		background: var(--color-primary-tint);
		border-color: var(--color-primary);
	}

	.btn--ghost {
		background: transparent;
		color: var(--color-text-muted);
	}

	.btn--ghost:hover:not(:disabled) {
		background: var(--color-primary-tint);
		color: var(--color-text);
	}

	.btn--danger {
		background: var(--color-surface);
		color: var(--color-danger);
		border-color: var(--color-danger);
	}

	.btn--danger:hover:not(:disabled) {
		background: var(--color-danger);
		color: var(--color-surface);
	}

	/* Indicador de carga */
	.spinner {
		width: 1em;
		height: 1em;
		border: 2px solid currentColor;
		border-top-color: transparent;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.btn {
			transition: none;
		}

		.spinner {
			animation-duration: 1.8s;
		}
	}
</style>
