<script lang="ts">
	import { onMount } from 'svelte';
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
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { apiErrorMessage } from '$lib/errors.js';
	import { DISPATCH_MODE, ORDER_STATUS, statusLabel } from '$lib/status.js';
	import { toasts } from '$lib/toasts.svelte.js';

	// El POS ya sabía buscar y dar de alta un cliente sobre la marcha. Lo que
	// no existía era el sitio donde administrarlos: editarlos, retirarlos, y
	// ver qué han consumido.
	interface Customer {
		id: number;
		customerTypeId: number;
		customerTypeName: string;
		name: string;
		phone: string | null;
		taxId: string | null;
		allowsRoomService: boolean;
		archivedAt: string | null;
	}
	interface CustomerType {
		id: number;
		name: string;
		allowsRoomService: boolean;
	}
	interface Summary {
		orderCount: number;
		totalSpent: string;
		lastOrderAt: string | null;
	}
	interface OrderRow {
		id: number;
		status: 'open' | 'closed';
		dispatchMode: string;
		dineTableName: string;
		areaName: string;
		openedAt: string;
		total: string;
	}

	let customers = $state<Customer[]>([]);
	let customerTypes = $state<CustomerType[]>([]);
	let loading = $state(true);
	let search = $state('');
	let statusFilter = $state<'active' | 'archived'>('active');

	let selectedId = $state<number | null>(null);
	let detail = $state<Customer | null>(null);
	let summary = $state<Summary | null>(null);
	let orders = $state<OrderRow[]>([]);
	let loadingDetail = $state(false);

	let formOpen = $state(false);
	let formMode = $state<'create' | 'edit'>('create');
	let formName = $state('');
	let formTypeId = $state<number | null>(null);
	let formPhone = $state('');
	let formTaxId = $state('');
	let saving = $state(false);

	let toArchive = $state<Customer | null>(null);

	function money(value: string | number): string {
		return `RD$ ${Number(value).toLocaleString('es-DO', {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})}`;
	}

	function day(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleDateString('es-DO', {
			day: '2-digit',
			month: 'short',
			year: 'numeric',
		});
	}

	async function loadCustomers() {
		const params = new URLSearchParams({ status: statusFilter });
		if (search.trim()) params.set('search', search.trim());
		const response = await apiFetch(`/customers?${params.toString()}`);
		if (response.ok) {
			customers = ((await response.json()) as { customers: Customer[] }).customers;
			if (selectedId !== null && !customers.some((c) => c.id === selectedId)) {
				selectedId = null;
				detail = null;
			}
		}
	}

	async function loadTypes() {
		const response = await apiFetch('/customer-types');
		if (response.ok) {
			customerTypes = ((await response.json()) as { customerTypes: CustomerType[] }).customerTypes;
			if (formTypeId === null && customerTypes.length > 0) formTypeId = customerTypes[0]!.id;
		}
	}

	async function selectCustomer(id: number) {
		selectedId = id;
		loadingDetail = true;
		try {
			const [detailResponse, ordersResponse] = await Promise.all([
				apiFetch(`/customers/${id}`),
				apiFetch(`/orders?customerId=${id}&limit=20`),
			]);
			if (detailResponse.ok) {
				const body = (await detailResponse.json()) as { customer: Customer; summary: Summary };
				detail = body.customer;
				summary = body.summary;
			}
			// Un cliente puede haber pedido en otra sucursal; este listado es el
			// de la sucursal activa, igual que el resto de la pantalla de órdenes.
			orders = ordersResponse.ok
				? ((await ordersResponse.json()) as { orders: OrderRow[] }).orders
				: [];
		} finally {
			loadingDetail = false;
		}
	}

	function startCreate() {
		formMode = 'create';
		formName = '';
		formPhone = '';
		formTaxId = '';
		formTypeId = customerTypes[0]?.id ?? null;
		formOpen = true;
	}

	function startEdit(customer: Customer) {
		formMode = 'edit';
		formName = customer.name;
		formPhone = customer.phone ?? '';
		formTaxId = customer.taxId ?? '';
		formTypeId = customer.customerTypeId;
		formOpen = true;
	}

	async function save() {
		const name = formName.trim();
		if (!name || formTypeId === null) return;
		const editing = formMode === 'edit' && detail !== null;
		const phone = formPhone.trim();
		const taxId = formTaxId.trim();

		saving = true;
		try {
			const response = await apiFetch(editing ? `/customers/${detail!.id}` : '/customers', {
				method: editing ? 'PATCH' : 'POST',
				body: JSON.stringify(
					editing
						? // null borra el dato; una cadena vacía no es un teléfono.
							{ name, customerTypeId: formTypeId, phone: phone || null, taxId: taxId || null }
						: {
								name,
								customerTypeId: formTypeId,
								...(phone && { phone }),
								...(taxId && { taxId }),
							},
				),
			});
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo guardar el cliente.'));
				return;
			}
			const { customer } = (await response.json()) as { customer: Customer };
			formOpen = false;
			await loadCustomers();
			await selectCustomer(customer.id);
			toasts.success(editing ? `«${name}» actualizado.` : `Cliente «${name}» creado.`);
		} finally {
			saving = false;
		}
	}

	async function archive() {
		const customer = toArchive;
		if (!customer) return;
		const response = await apiFetch(`/customers/${customer.id}/archive`, { method: 'POST' });
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo archivar el cliente.'));
			return;
		}
		selectedId = null;
		detail = null;
		await loadCustomers();
		toasts.success(`«${customer.name}» archivado. Sus órdenes siguen en el historial.`);
	}

	async function restore(customer: Customer) {
		const response = await apiFetch(`/customers/${customer.id}/restore`, { method: 'POST' });
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo restaurar el cliente.'));
			return;
		}
		selectedId = null;
		detail = null;
		await loadCustomers();
		toasts.success(`«${customer.name}» restaurado.`);
	}

	onMount(() => {
		loadTypes();
		loadCustomers().finally(() => {
			loading = false;
		});
	});
</script>

<PageHeader
	title="Clientes"
	description="Huéspedes, cuentas corporativas y empleados. El tipo decide quién puede pedir room service."
>
	{#snippet actions()}
		<Button variant="primary" icon="plus" onclick={startCreate}>Nuevo cliente</Button>
	{/snippet}
</PageHeader>

<div class="filters">
	<Field
		label="Buscar"
		type="search"
		bind:value={search}
		oninput={loadCustomers}
		placeholder="Nombre del cliente"
	/>
	<Field label="Estado">
		{#snippet control({ id })}
			<select {id} bind:value={statusFilter} onchange={() => loadCustomers()}>
				<option value="active">Activos</option>
				<option value="archived">Archivados</option>
			</select>
		{/snippet}
	</Field>
</div>

<div class="columns">
	<div class="col">
		{#if loading}
			<Skeleton lines={4} />
		{:else if customers.length === 0}
			<EmptyState
				icon="customer"
				title={statusFilter === 'archived' ? 'Nada archivado' : 'Sin clientes'}
				description={search.trim()
					? 'Ningún cliente coincide con esa búsqueda.'
					: statusFilter === 'archived'
						? 'Aquí aparecen los clientes retirados, para consultarlos o devolverlos al POS.'
						: 'Los clientes también se crean sobre la marcha desde el POS, al abrir una orden de room service.'}
			>
				{#snippet action()}
					{#if statusFilter === 'active' && !search.trim()}
						<Button variant="primary" icon="plus" onclick={startCreate}>Nuevo cliente</Button>
					{/if}
				{/snippet}
			</EmptyState>
		{:else}
			<DataList>
				{#each customers as customer (customer.id)}
					<DataListRow
						title={customer.name}
						meta={customer.phone ?? undefined}
						selected={customer.id === selectedId}
						onclick={() => selectCustomer(customer.id)}
					>
						{#if customer.archivedAt}
							<Badge tone="neutral">Archivado</Badge>
						{:else if customer.allowsRoomService}
							<Badge tone="primary">{customer.customerTypeName}</Badge>
						{:else}
							<Badge tone="neutral">{customer.customerTypeName}</Badge>
						{/if}
					</DataListRow>
				{/each}
			</DataList>
		{/if}
	</div>

	<div class="col">
		{#if selectedId === null}
			<EmptyState
				icon="customer"
				title="Ningún cliente seleccionado"
				description="Elige uno de la izquierda para ver sus datos y lo que ha consumido."
			/>
		{:else if loadingDetail}
			<Skeleton lines={5} />
		{:else if detail === null}
			<p role="alert">No se pudo cargar el cliente.</p>
		{:else}
			<article class="card">
				<header>
					<div>
						<h2>{detail.name}</h2>
						<p class="muted">
							{detail.customerTypeName}
							{#if detail.allowsRoomService}· admite room service{/if}
							{#if detail.archivedAt}· archivado el {day(detail.archivedAt)}{/if}
						</p>
					</div>
					<div class="actions">
						{#if detail.archivedAt}
							<Button variant="secondary" onclick={() => restore(detail!)}>Restaurar</Button>
						{:else}
							<Button variant="secondary" icon="edit" onclick={() => startEdit(detail!)}>
								Editar
							</Button>
							<Button variant="danger" onclick={() => (toArchive = detail)}>Archivar</Button>
						{/if}
					</div>
				</header>

				<dl class="facts">
					<dt>Teléfono</dt>
					<dd>{detail.phone ?? '—'}</dd>
					<dt>RNC</dt>
					<dd>{detail.taxId ?? '—'}</dd>
				</dl>

				{#if summary}
					<div class="tiles">
						<div class="tile">
							<span class="tile-label">Ha consumido</span>
							<span class="tile-value">{money(summary.totalSpent)}</span>
						</div>
						<div class="tile">
							<span class="tile-label">Órdenes cobradas</span>
							<span class="tile-value">{summary.orderCount}</span>
						</div>
						<div class="tile">
							<span class="tile-label">Última visita</span>
							<span class="tile-value small">{day(summary.lastOrderAt)}</span>
						</div>
					</div>
				{/if}

				<section class="history">
					<h3>Sus órdenes en esta sucursal</h3>
					{#if orders.length === 0}
						<p class="muted">Todavía no ha pedido aquí.</p>
					{:else}
						<DataList>
							{#each orders as order (order.id)}
								{@const status = statusLabel(ORDER_STATUS, order.status)}
								{@const dispatch = statusLabel(DISPATCH_MODE, order.dispatchMode)}
								<DataListRow
									title="#{order.id} · {order.dineTableName}"
									meta="{order.areaName} · {day(order.openedAt)}"
									onclick={order.status === 'open' ? () => goto(`/pos/${order.id}`) : undefined}
								>
									<Badge tone={status.tone}>{status.label}</Badge>
									{#if order.dispatchMode !== 'dine_in'}
										<Badge tone={dispatch.tone}>{dispatch.label}</Badge>
									{/if}
									<span class="row-total">{money(order.total)}</span>
								</DataListRow>
							{/each}
						</DataList>
					{/if}
				</section>
			</article>
		{/if}
	</div>
</div>

<Modal
	bind:open={formOpen}
	title={formMode === 'create' ? 'Nuevo cliente' : 'Editar cliente'}
	size="sm"
>
	<Field label="Nombre" bind:value={formName} required placeholder="María Pérez" />
	<Field label="Tipo" hint="Solo los huéspedes pueden pedir room service.">
		{#snippet control({ id })}
			<select {id} bind:value={formTypeId}>
				{#each customerTypes as type (type.id)}
					<option value={type.id}>{type.name}</option>
				{/each}
			</select>
		{/snippet}
	</Field>
	<Field label="Teléfono" type="tel" bind:value={formPhone} placeholder="809-555-0101" />
	<Field
		label="RNC"
		bind:value={formTaxId}
		placeholder="131-00000-1"
		hint="Opcional. Hace falta para facturar a una cuenta corporativa."
	/>
	{#snippet footer()}
		<Button variant="ghost" disabled={saving} onclick={() => (formOpen = false)}>Cancelar</Button>
		<Button variant="primary" loading={saving} onclick={save}>
			{formMode === 'create' ? 'Crear cliente' : 'Guardar cambios'}
		</Button>
	{/snippet}
</Modal>

<ConfirmDialog
	open={toArchive !== null}
	title="¿Archivar el cliente?"
	message="«{toArchive?.name ??
		''}» dejará de aparecer al abrir una orden. No se borra: sus órdenes y lo que ha consumido siguen en el historial, y puedes restaurarlo desde el filtro Archivados."
	confirmLabel="Archivar"
	onconfirm={archive}
	onclose={() => (toArchive = null)}
/>

<style>
	.filters {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-4);
		margin-bottom: var(--space-4);
	}

	.filters :global(.field) {
		min-width: 200px;
	}

	.columns {
		display: grid;
		grid-template-columns: minmax(260px, 380px) 1fr;
		gap: var(--space-5);
		align-items: start;
	}

	.col {
		min-width: 0;
	}

	.card {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.card header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	h2 {
		margin: 0;
		font-size: var(--text-xl);
	}

	h3 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-md);
	}

	.muted {
		margin: var(--space-1) 0 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.facts {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: var(--space-1) var(--space-4);
		margin: 0;
	}

	.facts dt {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.facts dd {
		margin: 0;
		font-weight: 600;
	}

	.tiles {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
		gap: var(--space-3);
	}

	.tile {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: var(--space-3);
		background: var(--color-surface-sunk);
		border-radius: var(--radius-sm);
	}

	.tile-label {
		font-size: var(--text-xs);
		color: var(--color-text-muted);
	}

	.tile-value {
		font-family: var(--font-display);
		font-size: var(--text-xl);
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.tile-value.small {
		font-size: var(--text-md);
	}

	.row-total {
		margin-left: auto;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	@media (max-width: 900px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
</style>
