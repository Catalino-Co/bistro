<script lang="ts">
	import { goto } from '$app/navigation';
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

<main>
	<h1>Bistro</h1>
	<form onsubmit={handleSubmit}>
		<label>
			Usuario
			<input type="text" bind:value={username} autocomplete="username" required />
		</label>
		<label>
			Contraseña
			<input type="password" bind:value={password} autocomplete="current-password" required />
		</label>
		{#if error}
			<p role="alert">{error}</p>
		{/if}
		<button type="submit" disabled={submitting}>Entrar</button>
	</form>
</main>
