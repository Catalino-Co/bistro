<script lang="ts">
	import Button from './Button.svelte';
	import Modal from './Modal.svelte';

	/**
	 * Confirmación para acciones irreversibles.
	 *
	 * Hoy "Eliminar área" y "Eliminar mesa" borran al primer clic, sin ni
	 * siquiera un `confirm()`. Toda acción destructiva pasa por aquí.
	 *
	 * `onconfirm` puede ser asíncrona: mientras se resuelve, el botón queda
	 * en estado de carga y el diálogo no se cierra, así el usuario ve que la
	 * acción sigue en curso y no la dispara dos veces.
	 */
	interface Props {
		open?: boolean;
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		/** `danger` para borrados y anulaciones; `primary` para lo demás. */
		tone?: 'danger' | 'primary';
		onconfirm: () => void | Promise<void>;
	}

	let {
		open = $bindable(false),
		title,
		message,
		confirmLabel = 'Confirmar',
		cancelLabel = 'Cancelar',
		tone = 'danger',
		onconfirm,
	}: Props = $props();

	let running = $state(false);

	async function confirm() {
		running = true;
		try {
			await onconfirm();
			open = false;
		} finally {
			running = false;
		}
	}
</script>

<Modal bind:open {title} size="sm">
	<p class="message">{message}</p>

	{#snippet footer()}
		<Button variant="ghost" disabled={running} onclick={() => (open = false)}>
			{cancelLabel}
		</Button>
		<Button variant={tone} loading={running} onclick={confirm}>
			{confirmLabel}
		</Button>
	{/snippet}
</Modal>

<style>
	.message {
		margin: 0;
		color: var(--color-text-muted);
	}
</style>
