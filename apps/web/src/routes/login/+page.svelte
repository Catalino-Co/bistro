<script lang="ts">
	import { goto } from '$app/navigation';
	import Icon from '$lib/components/Icon.svelte';
	import { session } from '$lib/session.svelte.js';

	let username = $state('');
	let password = $state('');
	let error = $state<string | null>(null);
	let submitting = $state(false);

	async function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		error = null;
		submitting = true;
		try {
			const result = await session.login(username, password);
			if (result.ok) {
				await goto('/');
			} else {
				error =
					result.error === 'too_many_attempts'
						? 'Demasiados intentos fallidos. Intenta de nuevo más tarde.'
						: 'Usuario o contraseña incorrectos.';
			}
		} finally {
			submitting = false;
		}
	}
</script>

<main class="login-page">
	<div class="login-card">
		<div class="brand">
			<Icon name="plate" size={40} />
			<h1>Bistro</h1>
		</div>
		<p class="tagline">Inicia sesión para continuar</p>

		<form onsubmit={handleSubmit}>
			<label class="field">
				<span>Usuario</span>
				<div class="input-with-icon">
					<Icon name="user" size={18} />
					<input type="text" bind:value={username} autocomplete="username" required />
				</div>
			</label>
			<label class="field">
				<span>Contraseña</span>
				<div class="input-with-icon">
					<Icon name="lock" size={18} />
					<input
						type="password"
						bind:value={password}
						autocomplete="current-password"
						required
					/>
				</div>
			</label>
			{#if error}
				<p role="alert">{error}</p>
			{/if}
			<button type="submit" disabled={submitting}>
				{submitting ? 'Entrando…' : 'Entrar'}
			</button>
		</form>
	</div>
</main>

<style>
	.login-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: radial-gradient(circle at top, var(--color-primary-tint), var(--color-bg) 60%);
	}

	.login-card {
		width: 100%;
		max-width: 360px;
		background: var(--color-surface);
		border-radius: var(--radius-lg);
		box-shadow: var(--shadow-md);
		padding: 2.5rem 2rem;
	}

	.brand {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		color: var(--color-primary);
	}

	.brand h1 {
		font-size: 1.75rem;
		margin: 0;
	}

	.tagline {
		text-align: center;
		color: var(--color-text-muted);
		margin: 0.25rem 0 1.75rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	.input-with-icon {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-sm);
		padding: 0 0.65rem;
		background: var(--color-surface);
		color: var(--color-text-muted);
	}

	.input-with-icon:focus-within {
		outline: 2px solid var(--color-primary);
		outline-offset: 1px;
		border-color: var(--color-primary);
	}

	.input-with-icon input {
		border: none;
		padding: 0.6rem 0;
		flex: 1;
		outline: none;
	}

	.input-with-icon input:focus {
		outline: none;
	}

	button[type='submit'] {
		margin-top: 0.5rem;
		padding: 0.65rem;
	}
</style>
