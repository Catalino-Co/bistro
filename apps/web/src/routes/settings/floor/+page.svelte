<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api.js';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import DataList from '$lib/components/DataList.svelte';
	import DataListRow from '$lib/components/DataListRow.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import { apiErrorMessage } from '$lib/errors.js';
	import { session } from '$lib/session.svelte.js';
	import { DINE_TABLE_STATUS, statusLabel } from '$lib/status.js';
	import { toasts } from '$lib/toasts.svelte.js';

	interface DineArea {
		id: number;
		name: string;
	}
	interface DineTable {
		id: number;
		name: string;
		seats: number;
		status: string;
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
		allowsRoomService: boolean;
	}
	type DispatchMode = 'dine_in' | 'delivery' | 'pickup' | 'room_service';

	const DISPATCH_MODES: { value: DispatchMode; label: string }[] = [
		{ value: 'dine_in', label: 'En mesa' },
		{ value: 'delivery', label: 'Delivery' },
		{ value: 'pickup', label: 'Pickup' },
		{ value: 'room_service', label: 'Room service' },
	];

	let dineAreas = $state<DineArea[]>([]);
	let tables = $state<DineTable[]>([]);
	let selectedAreaId = $state<number | null>(null);
	let noBranchSelected = $state(false);
	let customerTypes = $state<CustomerType[]>([]);

	// --- alta y edición de áreas ---
	let areaFormOpen = $state(false);
	let editingAreaId = $state<number | null>(null);
	let areaName = $state('');
	let savingArea = $state(false);
	let areaToDelete = $state<DineArea | null>(null);

	// --- alta y edición de mesas ---
	let tableFormOpen = $state(false);
	let editingTableId = $state<number | null>(null);
	let tableName = $state('');
	let tableSeats = $state('4');
	let savingTable = $state(false);
	let tableToDelete = $state<DineTable | null>(null);

	// --- apertura de orden ---
	let openingTable = $state<DineTable | null>(null);
	let openingDispatchMode = $state<DispatchMode>('dine_in');
	let customerSearch = $state('');
	let customerResults = $state<Customer[]>([]);
	let selectedCustomerId = $state<number | null>(null);
	let newCustomerName = $state('');
	let newCustomerTypeId = $state<number | null>(null);
	let openOrderError = $state('');
	let openingOrder = $state(false);

	const selectedArea = $derived(dineAreas.find((area) => area.id === selectedAreaId) ?? null);

	async function loadDineAreas() {
		const response = await apiFetch('/floor/dine-areas');
		if (response.status === 409) {
			noBranchSelected = true;
			return;
		}
		noBranchSelected = false;
		if (response.ok) {
			dineAreas = ((await response.json()) as { dineAreas: DineArea[] }).dineAreas;
		}
	}

	async function loadTables(areaId: number) {
		const response = await apiFetch(`/floor/tables?dineAreaId=${areaId}`);
		if (response.ok) {
			tables = ((await response.json()) as { tables: DineTable[] }).tables;
		}
	}

	function selectArea(id: number) {
		selectedAreaId = id;
		loadTables(id);
	}

	function startCreateArea() {
		editingAreaId = null;
		areaName = '';
		areaFormOpen = true;
	}

	function startEditArea(area: DineArea) {
		editingAreaId = area.id;
		areaName = area.name;
		areaFormOpen = true;
	}

	async function saveArea() {
		const name = areaName.trim();
		if (!name) return;
		savingArea = true;
		try {
			const editing = editingAreaId !== null;
			const response = await apiFetch(
				editing ? `/floor/dine-areas/${editingAreaId}` : '/floor/dine-areas',
				{ method: editing ? 'PATCH' : 'POST', body: JSON.stringify({ name }) },
			);
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo guardar el área.'));
				return;
			}
			areaFormOpen = false;
			await loadDineAreas();
			toasts.success(editing ? `Área renombrada a «${name}».` : `Área «${name}» creada.`);
		} finally {
			savingArea = false;
		}
	}

	async function deleteArea() {
		const area = areaToDelete;
		if (!area) return;
		const response = await apiFetch(`/floor/dine-areas/${area.id}`, { method: 'DELETE' });
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo eliminar el área.'));
			return;
		}
		if (selectedAreaId === area.id) {
			selectedAreaId = null;
			tables = [];
		}
		await loadDineAreas();
		toasts.success(`Área «${area.name}» eliminada.`);
	}

	function startCreateTable() {
		editingTableId = null;
		tableName = '';
		tableSeats = '4';
		tableFormOpen = true;
	}

	function startEditTable(table: DineTable) {
		editingTableId = table.id;
		tableName = table.name;
		tableSeats = String(table.seats);
		tableFormOpen = true;
	}

	async function saveTable() {
		const name = tableName.trim();
		if (!name || selectedAreaId === null) return;
		savingTable = true;
		try {
			const editing = editingTableId !== null;
			const seats = Number(tableSeats) || 2;
			const response = await apiFetch(
				editing ? `/floor/tables/${editingTableId}` : '/floor/tables',
				{
					method: editing ? 'PATCH' : 'POST',
					body: JSON.stringify(
						editing ? { name, seats } : { dineAreaId: selectedAreaId, name, seats },
					),
				},
			);
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo guardar la mesa.'));
				return;
			}
			tableFormOpen = false;
			await loadTables(selectedAreaId);
			toasts.success(editing ? `Mesa «${name}» actualizada.` : `Mesa «${name}» creada.`);
		} finally {
			savingTable = false;
		}
	}

	async function deleteTable() {
		const table = tableToDelete;
		if (!table || selectedAreaId === null) return;
		const response = await apiFetch(`/floor/tables/${table.id}`, { method: 'DELETE' });
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo eliminar la mesa.'));
			return;
		}
		await loadTables(selectedAreaId);
		toasts.success(`Mesa «${table.name}» eliminada.`);
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

	function startOpenOrder(table: DineTable) {
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

	async function viewOrder(dineTableId: number) {
		const response = await apiFetch(`/orders/for-table/${dineTableId}`);
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo abrir la orden de la mesa.'));
			return;
		}
		const { order } = (await response.json()) as { order: { id: number } | null };
		if (order) {
			goto(`/pos/${order.id}`);
		} else {
			toasts.info('Esa mesa ya no tiene una orden abierta.');
		}
	}

	$effect(() => {
		loadDineAreas();
		loadCustomerTypes();
	});
</script>

<PageHeader
	title="Áreas y mesas"
	description="El salón de {session.currentBranch?.name ?? 'la sucursal'}: primero las áreas, y dentro de cada una sus mesas."
>
	{#snippet actions()}
		{#if !noBranchSelected}
			<Button variant="primary" icon="plus" onclick={startCreateArea}>Nueva área</Button>
		{/if}
	{/snippet}
</PageHeader>

{#if noBranchSelected}
	<EmptyState
		icon="home"
		title="No hay sucursal seleccionada"
		description="Las áreas y mesas pertenecen a una sucursal. Elige una para continuar."
	>
		{#snippet action()}
			<Button variant="primary" onclick={() => goto('/')}>Ir a Inicio</Button>
		{/snippet}
	</EmptyState>
{:else}
	<div class="columns">
		<div class="col">
			<h2>Áreas</h2>
			{#if dineAreas.length === 0}
				<EmptyState
					icon="tables"
					title="Todavía no hay áreas"
					description="Un área agrupa mesas: salón principal, terraza, barra…"
				>
					{#snippet action()}
						<Button variant="primary" icon="plus" onclick={startCreateArea}>Crear área</Button>
					{/snippet}
				</EmptyState>
			{:else}
				<DataList>
					{#each dineAreas as area (area.id)}
						<DataListRow
							title={area.name}
							selected={area.id === selectedAreaId}
							onclick={() => selectArea(area.id)}
						>
							{#snippet actions()}
								<Button
									size="sm"
									variant="ghost"
									icon="edit"
									aria-label="Editar {area.name}"
									onclick={() => startEditArea(area)}
								/>
								<Button
									size="sm"
									variant="danger"
									icon="trash"
									aria-label="Eliminar {area.name}"
									onclick={() => (areaToDelete = area)}
								/>
							{/snippet}
						</DataListRow>
					{/each}
				</DataList>
			{/if}
		</div>

		<div class="col">
			{#if selectedArea === null}
				<h2>Mesas</h2>
				<EmptyState
					icon="tables"
					title="Selecciona un área"
					description="Elige un área de la izquierda para ver y administrar sus mesas."
				/>
			{:else}
				<div class="col-header">
					<h2>Mesas de {selectedArea.name}</h2>
					<Button variant="secondary" icon="plus" onclick={startCreateTable}>Nueva mesa</Button>
				</div>

				{#if tables.length === 0}
					<EmptyState
						icon="tables"
						title="Esta área no tiene mesas"
						description="Añade la primera para poder abrirle una orden."
					>
						{#snippet action()}
							<Button variant="primary" icon="plus" onclick={startCreateTable}>Crear mesa</Button>
						{/snippet}
					</EmptyState>
				{:else}
					<DataList>
						{#each tables as table (table.id)}
							{@const status = statusLabel(DINE_TABLE_STATUS, table.status)}
							<DataListRow title={table.name} meta="{table.seats} puestos">
								<Badge tone={status.tone}>{status.label}</Badge>
								{#snippet actions()}
									{#if table.status === 'available'}
										<Button size="sm" variant="primary" onclick={() => startOpenOrder(table)}>
											Abrir orden
										</Button>
									{:else if table.status === 'occupied'}
										<Button size="sm" variant="secondary" onclick={() => viewOrder(table.id)}>
											Ver orden
										</Button>
									{/if}
									<Button
										size="sm"
										variant="ghost"
										icon="edit"
										aria-label="Editar {table.name}"
										onclick={() => startEditTable(table)}
									/>
									<Button
										size="sm"
										variant="danger"
										icon="trash"
										aria-label="Eliminar {table.name}"
										onclick={() => (tableToDelete = table)}
									/>
								{/snippet}
							</DataListRow>
						{/each}
					</DataList>
				{/if}
			{/if}
		</div>
	</div>
{/if}

<Modal
	bind:open={areaFormOpen}
	title={editingAreaId === null ? 'Nueva área' : 'Editar área'}
	size="sm"
>
	<Field
		label="Nombre del área"
		bind:value={areaName}
		required
		placeholder="Salón principal, Terraza…"
	/>
	{#snippet footer()}
		<Button variant="ghost" disabled={savingArea} onclick={() => (areaFormOpen = false)}>
			Cancelar
		</Button>
		<Button variant="primary" loading={savingArea} onclick={saveArea}>
			{editingAreaId === null ? 'Crear área' : 'Guardar cambios'}
		</Button>
	{/snippet}
</Modal>

<Modal
	bind:open={tableFormOpen}
	title={editingTableId === null ? 'Nueva mesa' : 'Editar mesa'}
	description={selectedArea?.name}
	size="sm"
>
	<Field label="Nombre de la mesa" bind:value={tableName} required placeholder="Mesa 1" />
	<Field
		label="Puestos"
		type="number"
		bind:value={tableSeats}
		min="1"
		hint="Cuántos comensales caben."
	/>
	{#snippet footer()}
		<Button variant="ghost" disabled={savingTable} onclick={() => (tableFormOpen = false)}>
			Cancelar
		</Button>
		<Button variant="primary" loading={savingTable} onclick={saveTable}>
			{editingTableId === null ? 'Crear mesa' : 'Guardar cambios'}
		</Button>
	{/snippet}
</Modal>

<Modal
	open={openingTable !== null}
	title="Abrir orden"
	description={openingTable?.name}
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

<ConfirmDialog
	open={areaToDelete !== null}
	title="¿Eliminar el área?"
	message="Se eliminará «{areaToDelete?.name ?? ''}». Si todavía tiene mesas, no se podrá."
	confirmLabel="Eliminar área"
	onconfirm={deleteArea}
	onclose={() => (areaToDelete = null)}
/>

<ConfirmDialog
	open={tableToDelete !== null}
	title="¿Eliminar la mesa?"
	message="Se eliminará «{tableToDelete?.name ?? ''}» de {selectedArea?.name ?? ''}. Si tiene órdenes registradas, no se podrá."
	confirmLabel="Eliminar mesa"
	onconfirm={deleteTable}
	onclose={() => (tableToDelete = null)}
/>

<style>
	.columns {
		display: grid;
		grid-template-columns: minmax(240px, 340px) 1fr;
		gap: var(--space-5);
		align-items: start;
	}

	.col {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	.col-header {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
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

	@media (max-width: 900px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
</style>
