<script lang="ts">
	import type { Snippet } from 'svelte';
	import Button from './Button.svelte';

	/**
	 * Diálogo modal sobre `<dialog>` nativo: el navegador ya sabe atrapar el
	 * foco, cerrar con Esc y pintar el backdrop, así que no hay que
	 * reimplementarlo mal.
	 *
	 * Sustituye el patrón actual de inyectar un `<fieldset>` dentro del
	 * `<li>` de la lista, que empuja el resto de las filas hacia abajo y
	 * deja al usuario sin saber a qué elemento pertenece el formulario.
	 *
	 * No cierra al hacer clic en el backdrop: en una tableta, dentro de un
	 * restaurante, un roce no debe descartar un formulario a medio llenar.
	 */
	interface Props {
		open?: boolean;
		title: string;
		description?: string;
		size?: 'sm' | 'md' | 'lg';
		children: Snippet;
		/** Barra de acciones al pie; se alinea a la derecha. */
		footer?: Snippet;
	}

	let {
		open = $bindable(false),
		title,
		description,
		size = 'md',
		children,
		footer,
	}: Props = $props();

	let dialog = $state<HTMLDialogElement | null>(null);
	const titleId = $props.id();

	$effect(() => {
		if (!dialog) return;
		if (open && !dialog.open) {
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	});

	// El cierre SIEMPRE pasa por el estado, nunca por el navegador a
	// nuestras espaldas: si el `<dialog>` se cierra solo y el evento `close`
	// no llega, `open` se queda en true, el efecto de arriba no vuelve a
	// dispararse y el modal no abre nunca más. Por eso se cancela el cierre
	// nativo y lo hacemos nosotros bajando `open`.
	function handleKeydown(event: KeyboardEvent) {
		if (!open || event.key !== 'Escape') return;
		event.preventDefault();
		open = false;
	}

	function handleCancel(event: Event) {
		event.preventDefault();
		open = false;
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<dialog
	bind:this={dialog}
	class="modal modal--{size}"
	aria-labelledby={titleId}
	oncancel={handleCancel}
	onclose={() => (open = false)}
>
	{#if open}
		<header>
			<div class="heading">
				<h2 id={titleId}>{title}</h2>
				{#if description}<p>{description}</p>{/if}
			</div>
			<Button
				variant="ghost"
				size="sm"
				icon="close"
				aria-label="Cerrar"
				onclick={() => (open = false)}
			/>
		</header>

		<div class="body">
			{@render children()}
		</div>

		{#if footer}
			<footer>{@render footer()}</footer>
		{/if}
	{/if}
</dialog>

<style>
	.modal {
		width: calc(100vw - var(--space-6));
		padding: 0;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--color-surface);
		color: var(--color-text);
		box-shadow: var(--shadow-lg);
	}

	.modal--sm {
		max-width: 380px;
	}

	.modal--md {
		max-width: 520px;
	}

	.modal--lg {
		max-width: 760px;
	}

	.modal::backdrop {
		background: var(--color-overlay);
	}

	header {
		display: flex;
		align-items: flex-start;
		gap: var(--space-4);
		padding: var(--space-5) var(--space-5) var(--space-3);
	}

	.heading {
		flex: 1;
		min-width: 0;
	}

	h2 {
		margin: 0;
		font-size: var(--text-xl);
	}

	.heading p {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.body {
		padding: 0 var(--space-5) var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		max-height: min(60vh, 520px);
		overflow-y: auto;
	}

	footer {
		display: flex;
		justify-content: flex-end;
		gap: var(--space-2);
		flex-wrap: wrap;
		padding: var(--space-4) var(--space-5);
		border-top: 1px solid var(--color-border);
		background: var(--color-surface-sunk);
		border-radius: 0 0 var(--radius-lg) var(--radius-lg);
	}
</style>
