<script lang="ts">
	import { page } from '$app/state';
	import { apiFetch } from '$lib/api.js';

	const stationId = Number(page.params.stationId);

	interface Ticket {
		id: number;
		orderId: number;
		dineTableName: string;
		itemName: string;
		quantity: number;
		note: string | null;
		sentToKitchenAt: string;
	}

	let tickets = $state<Ticket[]>([]);
	let errorMessage = $state('');

	async function loadTickets() {
		const response = await apiFetch(`/kitchen/stations/${stationId}/tickets`);
		if (response.ok) {
			tickets = ((await response.json()) as { lines: Ticket[] }).lines;
		}
	}

	async function markPrepared(lineId: number) {
		errorMessage = '';
		const response = await apiFetch(`/kitchen/lines/${lineId}/prepared`, { method: 'POST' });
		if (response.ok) {
			await loadTickets();
		} else {
			const body = (await response.json()) as { error: string };
			errorMessage = body.error;
		}
	}

	$effect(() => {
		loadTickets();
	});
</script>

<div class="page">
	<h1>Cocina — estación #{stationId}</h1>
	{#if tickets.length === 0}
		<p>Sin pendientes.</p>
	{:else}
		<ul>
			{#each tickets as ticket (ticket.id)}
				<li>
					<strong>{ticket.dineTableName}</strong> (orden #{ticket.orderId}) —
					{ticket.quantity}× {ticket.itemName}
					{#if ticket.note}
						— <em>{ticket.note}</em>
					{/if}
					<button type="button" onclick={() => markPrepared(ticket.id)}>Preparado</button>
				</li>
			{/each}
		</ul>
	{/if}
	{#if errorMessage}
		<p role="alert">{errorMessage}</p>
	{/if}
</div>
