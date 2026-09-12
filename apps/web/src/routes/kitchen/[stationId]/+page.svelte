<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { apiFetch } from '$lib/api.js';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { apiErrorMessage } from '$lib/errors.js';
	import { toasts } from '$lib/toasts.svelte.js';

	const stationId = Number(page.params.stationId);

	// Un tablero de cocina que solo se actualiza al recargar la página no
	// sirve durante el servicio: nadie va a estar pulsando F5 con las manos
	// ocupadas. Se recarga solo, y el reloj corre aparte para que la
	// antigüedad de cada comanda avance aunque no llegue nada nuevo.
	const REFRESH_MS = 10_000;

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
	let stationName = $state('');
	let loading = $state(true);
	let now = $state(Date.now());
	let preparingId = $state<number | null>(null);

	async function loadTickets() {
		const response = await apiFetch(`/kitchen/stations/${stationId}/tickets`);
		if (response.ok) {
			tickets = ((await response.json()) as { lines: Ticket[] }).lines;
		}
	}

	async function loadStationName() {
		// Un cocinero puede no tener permiso de catálogo; si no llega el
		// nombre, el tablero sigue siendo usable con el número.
		const response = await apiFetch('/catalog/kitchen-stations');
		if (!response.ok) return;
		const { kitchenStations } = (await response.json()) as {
			kitchenStations: { id: number; name: string }[];
		};
		stationName = kitchenStations.find((s) => s.id === stationId)?.name ?? '';
	}

	async function markPrepared(ticket: Ticket) {
		preparingId = ticket.id;
		try {
			const response = await apiFetch(`/kitchen/lines/${ticket.id}/prepared`, { method: 'POST' });
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo marcar como preparada.'));
				return;
			}
			await loadTickets();
			toasts.success(`${ticket.itemName} lista para ${ticket.dineTableName}.`);
		} finally {
			preparingId = null;
		}
	}

	function minutesWaiting(sentAt: string): number {
		return Math.max(0, Math.floor((now - new Date(sentAt).getTime()) / 60_000));
	}

	function ageLabel(minutes: number): string {
		if (minutes < 1) return 'Recién llegada';
		if (minutes === 1) return 'Hace 1 min';
		return `Hace ${minutes} min`;
	}

	/** Verde hasta 5 min, ámbar hasta 10, rojo a partir de ahí. */
	function ageTone(minutes: number): 'success' | 'warning' | 'danger' {
		if (minutes < 5) return 'success';
		if (minutes < 10) return 'warning';
		return 'danger';
	}

	onMount(() => {
		loadStationName();
		loadTickets().finally(() => {
			loading = false;
		});

		const refresh = setInterval(loadTickets, REFRESH_MS);
		const clock = setInterval(() => (now = Date.now()), 10_000);
		return () => {
			clearInterval(refresh);
			clearInterval(clock);
		};
	});
</script>

<PageHeader
	title={stationName || `Estación #${stationId}`}
	description="Las comandas aparecen solas a medida que los meseros las envían. Se actualiza cada 10 segundos."
>
	{#snippet actions()}
		<Button variant="ghost" onclick={() => goto('/kitchen')}>Ver otras estaciones</Button>
	{/snippet}
</PageHeader>

{#if loading}
	<Skeleton lines={3} height="4rem" />
{:else if tickets.length === 0}
	<EmptyState
		icon="check"
		title="Sin pendientes"
		description="Todo lo que llegó a esta estación ya está preparado."
	/>
{:else}
	<div class="board">
		{#each tickets as ticket (ticket.id)}
			{@const minutes = minutesWaiting(ticket.sentToKitchenAt)}
			<article class="ticket" data-age={ageTone(minutes)}>
				<header>
					<span class="table">{ticket.dineTableName}</span>
					<Badge tone={ageTone(minutes)}>{ageLabel(minutes)}</Badge>
				</header>

				<p class="item">
					<span class="quantity">{ticket.quantity}×</span>
					{ticket.itemName}
				</p>

				{#if ticket.note}
					<p class="note">{ticket.note}</p>
				{/if}

				<footer>
					<span class="order">Orden #{ticket.orderId}</span>
					<Button
						variant="primary"
						size="lg"
						icon="check"
						loading={preparingId === ticket.id}
						onclick={() => markPrepared(ticket)}
					>
						Preparado
					</Button>
				</footer>
			</article>
		{/each}
	</div>
{/if}

<style>
	.board {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: var(--space-4);
	}

	.ticket {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		padding: var(--space-4);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 4px solid var(--color-success);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
	}

	.ticket[data-age='warning'] {
		border-left-color: var(--color-warning);
	}

	.ticket[data-age='danger'] {
		border-left-color: var(--color-danger);
	}

	header,
	footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.table {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.item {
		margin: 0;
		font-size: var(--text-lg);
	}

	.quantity {
		font-weight: 700;
		color: var(--color-primary);
	}

	.note {
		margin: 0;
		padding: var(--space-2) var(--space-3);
		background: var(--color-warning-tint);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
		color: var(--color-warning);
		font-weight: 500;
	}

	.order {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}
</style>
