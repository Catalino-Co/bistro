<script lang="ts">
	import { fly } from 'svelte/transition';
	import Button from './Button.svelte';
	import Icon from './Icon.svelte';
	import type { IconName } from '$lib/icons.js';
	import { toasts, type ToastTone } from '$lib/toasts.svelte.js';

	// Se monta una sola vez, en el layout raíz; las pantallas solo llaman a
	// `toasts.success(...)` / `toasts.error(...)`.
	const ICON: Record<ToastTone, IconName> = {
		success: 'check',
		error: 'alert',
		info: 'info',
	};
</script>

<div class="toast-host" role="region" aria-live="polite" aria-label="Notificaciones">
	{#each toasts.items as toast (toast.id)}
		<div class="toast toast--{toast.tone}" transition:fly={{ y: 12, duration: 180 }}>
			<span class="icon"><Icon name={ICON[toast.tone]} size={18} /></span>
			<p>{toast.message}</p>
			<Button
				variant="ghost"
				size="sm"
				icon="close"
				aria-label="Descartar"
				onclick={() => toasts.dismiss(toast.id)}
			/>
		</div>
	{/each}
</div>

<style>
	.toast-host {
		position: fixed;
		right: var(--space-4);
		bottom: var(--space-4);
		z-index: var(--z-toast);
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
		width: min(380px, calc(100vw - var(--space-6)));
		pointer-events: none;
	}

	.toast {
		pointer-events: auto;
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding: var(--space-3);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 3px solid var(--color-neutral);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-md);
	}

	.toast p {
		margin: 0;
		flex: 1;
		min-width: 0;
		font-size: var(--text-sm);
	}

	.icon {
		display: flex;
		padding-top: 1px;
	}

	.toast--success {
		border-left-color: var(--color-success);
	}

	.toast--success .icon {
		color: var(--color-success);
	}

	.toast--error {
		border-left-color: var(--color-danger);
	}

	.toast--error .icon {
		color: var(--color-danger);
	}

	.toast--info {
		border-left-color: var(--color-primary);
	}

	.toast--info .icon {
		color: var(--color-primary);
	}
</style>
