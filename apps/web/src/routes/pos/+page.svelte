<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api.js';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import DataList from '$lib/components/DataList.svelte';
	import DataListRow from '$lib/components/DataListRow.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import Icon from '$lib/components/Icon.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { apiErrorMessage } from '$lib/errors.js';
	import { session } from '$lib/session.svelte.js';
	import { toasts } from '$lib/toasts.svelte.js';

	// La pantalla de operación: el mesero llega, ve el salón completo y toca
	// una mesa. Se refresca sola porque en un turno hay varios meseros
	// abriendo y cobrando a la vez sobre las mismas mesas.
	const REFRESH_MS = 15_000;

	interface MapOrder {
		id: number;
		openedAt: string;
		dispatchMode: 'dine_in' | 'delivery' | 'pickup' | 'room_service';
		total: string;
		lineCount: number;
		pendingToSend: number;
	}
	interface MapTable {
		id: number;
		name: string;
		seats: number;
		status: 'available' | 'occupied' | 'reserved';
		order: MapOrder | null;
	}
	interface MapArea {
		id: number;
		name: string;
		tables: MapTable[];
	}
	interface CustomerType {
		id: number;
		name: string;
		allowsRoomService: boolean;
	}
	interface Customer {
		id: number;
		name: string;
		customerTypeName: string;
	}
	type DispatchMode = MapOrder['dispatchMode'];

	const DISPATCH_MODES: { value: DispatchMode; label: string }[] = [
		{ value: 'dine_in', label: 'En mesa' },
		{ value: 'delivery', label: 'Delivery' },
		{ value: 'pickup', label: 'Pickup' },
		{ value: 'room_service', label: 'Room service' },
	];

	let areas = $state<MapArea[]>([]);
	let loading = $state(true);
	let noBranchSelected = $state(false);
	let now = $state(Date.now());

	let openingTable = $state<MapTable | null>(null);
	let openingDispatchMode = $state<DispatchMode>('dine_in');
	let customerTypes = $state<CustomerType[]>([]);
	let customerSearch = $state('');
	let customerResults = $state<Customer[]>([]);
	let selectedCustomerId = $state<number | null>(null);
	let newCustomerName = $state('');
	let newCustomerTypeId = $state<number | null>(null);
	let openOrderError = $state('');
	let openingOrder = $state(false);

	const allTables = $derived(areas.flatMap((area) => area.tables));
	const occupiedCount = $derived(allTables.filter((table) => table.order !== null).length);
	const openTotal = $derived(
		allTables.reduce((sum, table) => sum + Number(table.order?.total ?? 0), 0),
	);

	function money(value: number | string): string {
		return `RD$ ${Number(value).toFixed(2)}`;
	}

	function elapsed(openedAt: string): string {
		const minutes = Math.max(0, Math.floor((now - new Date(openedAt).getTime()) / 60_000));
		if (minutes < 60) return `${minutes} min`;
		const hours = Math.floor(minutes / 60);
		return `${hours} h ${minutes % 60} min`;
	}

	/** Una mesa lleva demasiado abierta a partir de hora y media. */
	function isStale(openedAt: string): boolean {
		return now - new Date(openedAt).getTime() > 90 * 60_000;
	}

	function dispatchLabel(mode: DispatchMode): string {
		return DISPATCH_MODES.find((m) => m.value === mode)?.label ?? mode;
	}

	async function loadMap() {
		const response = await apiFetch('/orders/table-map');
		if (response.status === 409) {
			noBranchSelected = true;
			return;
		}
		noBranchSelected = false;
		if (response.ok) {
			areas = ((await response.json()) as { areas: MapArea[] }).areas;
		}
	}

	async function loadCustomerTypes() {
		const response = await apiFetch('/customer-types');
		if (response.ok) {
			customerTypes = ((await response.json()) as { customerTypes: CustomerType[] }).customerTypes;
			if (newCustomerTypeId === null && customerTypes.length > 0) {
				newCustomerTypeId =
					customerTypes.find((t) => t.allowsRoomService)?.id ?? customerTypes[0]!.id;
			}
		}
	}

	function tapTable(table: MapTable) {
		if (table.order) {
			goto(`/pos/${table.order.id}`);
			return;
		}
		openingTable = table;
		openingDispatchMode = 'dine_in';
		customerSearch = '';
		customerResults = [];
		selectedCustomerId = null;
		newCustomerName = '';
		openOrderError = '';
	}

	async function searchCustomers() {
		if (!customerSearch.trim()) {
			customerResults = [];
			return;
		}
		const response = await apiFetch(
			`/customers?search=${encodeURIComponent(customerSearch.trim())}`,
		);
		if (response.ok) {
			customerResults = ((await response.json()) as { customers: Customer[] }).customers;
		}
	}

	async function quickAddCustomer() {
		const name = newCustomerName.trim();
		if (!name || newCustomerTypeId === null) return;
		const response = await apiFetch('/customers', {
			method: 'POST',
			body: JSON.stringify({ customerTypeId: newCustomerTypeId, name }),
		});
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo crear el huésped.'));
			return;
		}
		const { customer } = (await response.json()) as { customer: Customer };
		selectedCustomerId = customer.id;
		customerResults = [customer];
		newCustomerName = '';
		toasts.success(`Huésped «${customer.name}» creado y seleccionado.`);
	}

	async function confirmOpenOrder() {
		if (!openingTable) return;
		openOrderError = '';
		openingOrder = true;
		try {
			const response = await apiFetch('/orders', {
				method: 'POST',
				body: JSON.stringify({
					dineTableId: openingTable.id,
					dispatchMode: openingDispatchMode,
					customerId:
						openingDispatchMode === 'room_service' ? (selectedCustomerId ?? undefined) : undefined,
				}),
			});
			if (!response.ok) {
				openOrderError = await apiErrorMessage(response, 'No se pudo abrir la orden.');
				return;
			}
			const { order } = (await response.json()) as { order: { id: number } };
			goto(`/pos/${order.id}`);
		} finally {
			openingOrder = false;
		}
	}

	onMount(() => {
		loadCustomerTypes();
		loadMap().finally(() => {
			loading = false;
		});

		const refresh = setInterval(loadMap, REFRESH_MS);
		const clock = setInterval(() => (now = Date.now()), 30_000);
		return () => {
			clearInterval(refresh);
			clearInterval(clock);
		};
	});
</script>

<PageHeader
	title="Salón"
	description={session.currentBranch
		? `${session.currentBranch.name} · toca una mesa para abrir o retomar su orden.`
		: 'Toca una mesa para abrir o retomar su orden.'}
>
	{#snippet actions()}
		{#if !loading && !noBranchSelected && allTables.length > 0}
			<div class="summary">
				<span><strong>{occupiedCount}</strong> de {allTables.length} ocupadas</span>
				<span class="summary-total">{money(openTotal)} en mesa</span>
			</div>
		{/if}
	{/snippet}
</PageHeader>

{#if loading}
	<Skeleton lines={3} height="5rem" />
{:else if noBranchSelected}
	<EmptyState
		icon="home"
		title="No hay sucursal seleccionada"
		description="El salón pertenece a una sucursal. Elige una para ver sus mesas."
	>
		{#snippet action()}
			<Button variant="primary" onclick={() => goto('/')}>Ir a Inicio</Button>
		{/snippet}
	</EmptyState>
{:else if allTables.length === 0}
	<EmptyState
		icon="tables"
		title="El salón está vacío"
		description="Todavía no hay mesas registradas en esta sucursal."
	>
		{#snippet action()}
			<Button variant="primary" onclick={() => goto('/settings/floor')}>
				Configurar áreas y mesas
			</Button>
		{/snippet}
	</EmptyState>
{:else}
	{#each areas as area (area.id)}
		<section class="area">
			<header>
				<h2>{area.name}</h2>
				<span class="area-count">
					{area.tables.filter((t) => t.order !== null).length} de {area.tables.length} ocupadas
				</span>
			</header>

			{#if area.tables.length === 0}
				<p class="muted">Esta área todavía no tiene mesas.</p>
			{:else}
				<div class="tables">
					{#each area.tables as table (table.id)}
						<button
							type="button"
							class="table"
							class:is-open={table.order !== null}
							class:is-stale={table.order !== null && isStale(table.order.openedAt)}
							onclick={() => tapTable(table)}
						>
							<span class="table-top">
								<span class="table-name">{table.name}</span>
								<span class="seats">
									<Icon name="user" size={14} />
									{table.seats}
								</span>
							</span>

							{#if table.order}
								<span class="table-total">{money(table.order.total)}</span>
								<span class="table-meta">
									{elapsed(table.order.openedAt)} · {table.order.lineCount}
									{table.order.lineCount === 1 ? 'línea' : 'líneas'}
								</span>
								<span class="table-badges">
									{#if table.order.pendingToSend > 0}
										<Badge tone="warning">{table.order.pendingToSend} sin enviar</Badge>
									{/if}
									{#if table.order.dispatchMode !== 'dine_in'}
										<Badge tone="primary">{dispatchLabel(table.order.dispatchMode)}</Badge>
									{/if}
								</span>
							{:else}
								<span class="table-free">Libre</span>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</section>
	{/each}
{/if}

<Modal
	open={openingTable !== null}
	title="Abrir orden"
	description={openingTable ? `${openingTable.name} · ${openingTable.seats} puestos` : ''}
	onclose={() => (openingTable = null)}
>
	<Field label="Modo de despacho">
		{#snippet control({ id })}
			<select {id} bind:value={openingDispatchMode}>
				{#each DISPATCH_MODES as mode (mode.value)}
					<option value={mode.value}>{mode.label}</option>
				{/each}
			</select>
		{/snippet}
	</Field>

	{#if openingDispatchMode === 'room_service'}
		<Field
			label="Buscar huésped"
			type="search"
			bind:value={customerSearch}
			oninput={searchCustomers}
			placeholder="Nombre del huésped"
			hint="Room service exige un huésped cuyo tipo lo permita."
		/>

		{#if customerResults.length > 0}
			<DataList>
				{#each customerResults as customer (customer.id)}
					<DataListRow
						title={customer.name}
						meta={customer.customerTypeName}
						selected={customer.id === selectedCustomerId}
						onclick={() => (selectedCustomerId = customer.id)}
					>
						{#if customer.id === selectedCustomerId}
							<Badge tone="primary">Seleccionado</Badge>
						{/if}
					</DataListRow>
				{/each}
			</DataList>
		{/if}

		<fieldset class="quick-add">
			<legend>¿No existe? Créalo</legend>
			<Field label="Tipo de cliente">
				{#snippet control({ id })}
					<select {id} bind:value={newCustomerTypeId}>
						{#each customerTypes as type (type.id)}
							<option value={type.id}>{type.name}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			<Field label="Nombre del huésped" bind:value={newCustomerName} />
			<Button variant="secondary" icon="plus" onclick={quickAddCustomer}>Crear y usar</Button>
		</fieldset>
	{/if}

	{#if openOrderError}
		<p role="alert">{openOrderError}</p>
	{/if}

	{#snippet footer()}
		<Button variant="ghost" disabled={openingOrder} onclick={() => (openingTable = null)}>
			Cancelar
		</Button>
		<Button
			variant="primary"
			loading={openingOrder}
			disabled={openingDispatchMode === 'room_service' && selectedCustomerId === null}
			onclick={confirmOpenOrder}
		>
			Abrir orden
		</Button>
	{/snippet}
</Modal>

<style>
	.summary {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.summary-total {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--color-text);
		font-variant-numeric: tabular-nums;
	}

	.area {
		background: none;
		border: none;
		box-shadow: none;
		padding: 0;
		margin-bottom: var(--space-6);
	}

	.area header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-3);
		margin-bottom: var(--space-3);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
	}

	.area-count {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.muted {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.tables {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: var(--space-3);
	}

	/* La mesa entera es el control: en una tableta se toca con el pulgar, no
	   se apunta a un botón pequeño dentro de una fila. */
	.table {
		display: flex;
		flex-direction: column;
		align-items: stretch;
		gap: var(--space-1);
		min-height: 116px;
		padding: var(--space-3);
		text-align: left;
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-left: 4px solid var(--color-success);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		cursor: pointer;
		font: inherit;
	}

	.table:hover {
		border-color: var(--color-primary);
		border-left-color: var(--color-primary);
	}

	.table:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: 2px;
	}

	.table.is-open {
		background: var(--color-primary-tint);
		border-left-color: var(--color-primary);
	}

	/* Abierta hace demasiado: probablemente se olvidaron de cobrarla. */
	.table.is-stale {
		border-left-color: var(--color-danger);
	}

	.table-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-2);
	}

	.table-name {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 600;
	}

	.seats {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.table-total {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 700;
		color: var(--color-primary-hover);
		font-variant-numeric: tabular-nums;
	}

	.table-meta {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.table-badges {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-1);
		margin-top: auto;
	}

	.table-free {
		margin-top: auto;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--color-success);
	}

	.quick-add {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		align-items: flex-start;
	}

	legend {
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
</style>
