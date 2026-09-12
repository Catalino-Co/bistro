<script lang="ts">
	import { session } from '$lib/session.svelte.js';

	let switching = $state(false);

	async function handleSelectBranch(branchId: number) {
		switching = true;
		try {
			await session.selectBranch(branchId);
		} finally {
			switching = false;
		}
	}
</script>

{#if session.user}
	<div class="page">
		<h1>Bistro</h1>

		{#if session.currentBranch}
			<p>Sucursal actual: <strong>{session.currentBranch.name}</strong></p>
		{:else if session.branches.length > 0}
			<p>Selecciona una sucursal para continuar.</p>
		{:else}
			<p>Tu usuario no tiene ninguna sucursal asignada.</p>
		{/if}

		{#if session.branches.length > 1}
			<section>
				<h2>Cambiar sucursal</h2>
				<ul>
					{#each session.branches as branch (branch.id)}
						<li>
							<button
								disabled={switching || branch.id === session.user.branchId}
								onclick={() => handleSelectBranch(branch.id)}
							>
								{branch.name}
							</button>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	</div>
{/if}
