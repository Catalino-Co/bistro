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
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { apiErrorMessage } from '$lib/errors.js';
	import { DISPATCH_MODE, ORDER_STATUS, orderLineState, statusLabel } from '$lib/status.js';
	import { toasts } from '$lib/toasts.svelte.js';

	// Una orden cerrada salía del alcance de la interfaz para siempre: se
	// cobraba y dejaba de existir para quien usa el sistema. Esta pantalla
	// es donde vuelve a aparecer.
	type Tab = 'open' | 'today' | 'search';

	interface OrderRow {
		id: number;
		status: 'open' | 'closed';
		dispatchMode: string;
		dineTableId: number;
		dineTableName: string;
		areaName: string;
		customerName: string | null;
		openedAt: string;
		closedAt: string | null;
		total: string;
		lineCount: number;
	}
	interface OrderDetail {
		id: number;
		status: 'open' | 'closed';
		dispatchMode: string;
		dineTableName: string;
		customerName: string | null;
		openedAt: string;
		closedAt: string | null;
		subtotal: string | null;
		taxTotal: string | null;
		total: string | null;
	}
	interface Line {
		id: number;
		itemId: number;
		itemName: string;
		quantity: number;
		note: string | null;
		unitPrice: string;
		voidedAt: string | null;
		sentToKitchenAt: string | null;
		preparedAt: string | null;
		modifiers: { modifierId: number; name: string; priceDelta: string }[];
	}
	interface Payment {
		id: number;
		paymentMethodName: string;
		amount: string;
		tipAmount: string;
		createdAt: string;
	}
	interface Totals {
		subtotal: string;
		taxTotal: string;
		total: string;
	}

	let tab = $state<Tab>('open');
	let search = $state('');
	let orders = $state<OrderRow[]>([]);
	let loading = $state(true);
	let noBranchSelected = $state(false);

	let selectedId = $state<number | null>(null);
	let detail = $state<OrderDetail | null>(null);
	let lines = $state<Line[]>([]);
	let payments = $state<Payment[]>([]);
	let liveTotals = $state<Totals | null>(null);
	let loadingDetail = $state(false);
	let printing = $state(false);

	/**
	 * Reimprime la cuenta. Cada impresión queda en la bitácora y el papel
	 * dice cuántas van, así que no hace falta ningún permiso especial para
	 * pulsar esto: lo que hace falta es que quede rastro, y queda.
	 */
	async function printBill() {
		if (!detail) return;
		printing = true;
		try {
			const response = await apiFetch(`/orders/${detail.id}/print-bill`, { method: 'POST' });
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo imprimir la cuenta.'));
				return;
			}
			const { reprintNumber } = (await response.json()) as { reprintNumber: number };
			toasts.success(
				reprintNumber === 0
					? 'Cuenta enviada a la impresora de caja.'
					: `Reimpresión #${reprintNumber} enviada a la impresora de caja.`,
			);
		} finally {
			printing = false;
		}
	}

	const TABS: { value: Tab; label: string }[] = [
		{ value: 'open', label: 'Abiertas' },
		{ value: 'today', label: 'Cerradas hoy' },
		{ value: 'search', label: 'Buscar' },
	];

	function money(value: string | number | null): string {
		return `RD$ ${Number(value ?? 0).toFixed(2)}`;
	}

	function clock(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
	}

	function day(iso: string): string {
		return new Date(iso).toLocaleDateString('es-DO', { day: '2-digit', month: 'short' });
	}

	/** Medianoche local: "hoy" es el día de quien mira la pantalla. */
	function startOfToday(): string {
		const now = new Date();
		return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
	}

	function query(): string {
		if (tab === 'open') return '?status=open';
		if (tab === 'today') return `?status=closed&from=${encodeURIComponent(startOfToday())}`;
		return search.trim() ? `?search=${encodeURIComponent(search.trim())}` : '';
	}

	async function loadOrders() {
		const response = await apiFetch(`/orders${query()}`);
		if (response.status === 409) {
			noBranchSelected = true;
			return;
		}
		noBranchSelected = false;
		if (response.ok) {
			orders = ((await response.json()) as { orders: OrderRow[] }).orders;
			if (selectedId !== null && !orders.some((order) => order.id === selectedId)) {
				selectedId = null;
				detail = null;
			}
		}
	}

	function selectTab(next: Tab) {
		tab = next;
		selectedId = null;
		detail = null;
		loadOrders();
	}

	async function selectOrder(id: number) {
		selectedId = id;
		loadingDetail = true;
		liveTotals = null;
		try {
			const [detailResponse, linesResponse, paymentsResponse] = await Promise.all([
				apiFetch(`/orders/${id}`),
				apiFetch(`/orders/${id}/lines`),
				apiFetch(`/orders/${id}/payments`),
			]);
			detail = detailResponse.ok
				? ((await detailResponse.json()) as { order: OrderDetail }).order
				: null;
			lines = linesResponse.ok ? ((await linesResponse.json()) as { lines: Line[] }).lines : [];
			payments = paymentsResponse.ok
				? ((await paymentsResponse.json()) as { payments: Payment[] }).payments
				: [];

			// Una orden abierta no tiene totales congelados todavía.
			if (detail?.status === 'open') {
				const totals = await apiFetch(`/orders/${id}/totals`);
				liveTotals = totals.ok ? ((await totals.json()) as Totals) : null;
			}
		} finally {
			loadingDetail = false;
		}
	}

	const shownTotals = $derived.by(() => {
		if (!detail) return null;
		if (detail.status === 'closed') {
			return { subtotal: detail.subtotal, taxTotal: detail.taxTotal, total: detail.total };
		}
		return liveTotals;
	});

	const paidTotal = $derived(
		payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
	);
	const tipTotal = $derived(
		payments.reduce((sum, payment) => sum + Number(payment.tipAmount), 0),
	);

	onMount(() => {
		loadOrders().finally(() => {
			loading = false;
		});
	});
</script>

<PageHeader
	title="Órdenes"
	description="Las que están en servicio y las que ya se cobraron. Toca una para ver su cuenta completa."
/>

{#if noBranchSelected}
	<EmptyState
		icon="home"
		title="No hay sucursal seleccionada"
		description="Las órdenes pertenecen a una sucursal. Elige una para verlas."
	>
		{#snippet action()}
			<Button variant="primary" onclick={() => goto('/')}>Ir a Inicio</Button>
		{/snippet}
	</EmptyState>
{:else}
	<nav class="tabs" aria-label="Filtro de órdenes">
		{#each TABS as entry (entry.value)}
			<button
				type="button"
				data-unstyled
				class="tab"
				class:active={tab === entry.value}
				aria-current={tab === entry.value ? 'true' : undefined}
				onclick={() => selectTab(entry.value)}
			>
				{entry.label}
			</button>
		{/each}
	</nav>

	{#if tab === 'search'}
		<div class="search">
			<Field
				label="Buscar"
				type="search"
				bind:value={search}
				oninput={loadOrders}
				placeholder="Mesa, cliente o número de orden"
				hint="Busca en todo el historial de la sucursal."
			/>
		</div>
	{/if}

	<div class="columns">
		<div class="col">
			{#if loading}
				<Skeleton lines={4} />
			{:else if orders.length === 0}
				<EmptyState
					icon="orders"
					title={tab === 'open'
						? 'No hay órdenes abiertas'
						: tab === 'today'
							? 'Todavía no se ha cobrado nada hoy'
							: 'Sin resultados'}
					description={tab === 'search'
						? 'Prueba con el nombre de la mesa, el del cliente o el número de la orden.'
						: 'Cuando se abra o se cobre una orden, aparecerá aquí.'}
				/>
			{:else}
				<DataList>
					{#each orders as order (order.id)}
						{@const status = statusLabel(ORDER_STATUS, order.status)}
						{@const dispatch = statusLabel(DISPATCH_MODE, order.dispatchMode)}
						<DataListRow
							title="#{order.id} · {order.dineTableName}"
							meta="{order.areaName} · {day(order.openedAt)} {clock(order.openedAt)}"
							selected={order.id === selectedId}
							onclick={() => selectOrder(order.id)}
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
		</div>

		<div class="col">
			{#if selectedId === null}
				<EmptyState
					icon="orders"
					title="Ninguna orden seleccionada"
					description="Elige una de la izquierda para ver sus líneas, sus totales y cómo se pagó."
				/>
			{:else if loadingDetail}
				<Skeleton lines={6} />
			{:else if detail === null}
				<p role="alert">No se pudo cargar la orden.</p>
			{:else}
				<article class="bill">
					<header>
						<div>
							<h2>Orden #{detail.id}</h2>
							<p class="muted">
								{detail.dineTableName}
								{#if detail.customerName}· {detail.customerName}{/if}
								· abierta {clock(detail.openedAt)}
								{#if detail.closedAt}· cerrada {clock(detail.closedAt)}{/if}
							</p>
						</div>
						<div class="bill-actions">
							<Button
								variant="secondary"
								icon="printer"
								loading={printing}
								onclick={printBill}
							>
								Imprimir cuenta
							</Button>
							{#if detail.status === 'open'}
								<Button variant="primary" onclick={() => goto(`/pos/${detail!.id}`)}>
									Seguir en el POS
								</Button>
							{/if}
						</div>
					</header>

					<ul class="lines">
						{#each lines as line (line.id)}
							{@const state = orderLineState(line)}
							<li class:voided={line.voidedAt !== null}>
								<span class="qty">{line.quantity}×</span>
								<span class="line-body">
									<span class="line-name">
										{line.itemName}
										<Badge tone={state.tone}>{state.label}</Badge>
									</span>
									{#if line.modifiers.length > 0}
										<span class="line-mods">
											{line.modifiers.map((m) => m.name).join(' · ')}
										</span>
									{/if}
									{#if line.note}
										<span class="line-note">{line.note}</span>
									{/if}
								</span>
								<span class="line-price">
									{money(Number(line.unitPrice) * line.quantity)}
								</span>
							</li>
						{/each}
					</ul>

					{#if shownTotals}
						<dl class="totals">
							<dt>Subtotal</dt>
							<dd>{money(shownTotals.subtotal)}</dd>
							<dt>ITBIS</dt>
							<dd>{money(shownTotals.taxTotal)}</dd>
							<dt class="grand">Total</dt>
							<dd class="grand">{money(shownTotals.total)}</dd>
						</dl>
					{/if}

					<section class="payments">
						<h3>Pagos</h3>
						{#if payments.length === 0}
							<p class="muted">Sin pagos registrados.</p>
						{:else}
							<ul class="payment-list">
								{#each payments as payment (payment.id)}
									<li>
										<span>{payment.paymentMethodName}</span>
										<span>
											{money(payment.amount)}
											{#if Number(payment.tipAmount) > 0}
												<span class="tip">+ {money(payment.tipAmount)} propina</span>
											{/if}
										</span>
									</li>
								{/each}
							</ul>
							<p class="paid">
								Cobrado {money(paidTotal)}
								{#if tipTotal > 0}· propinas {money(tipTotal)}{/if}
							</p>
						{/if}
					</section>
				</article>
			{/if}
		</div>
	</div>
{/if}

<style>
	.tabs {
		display: flex;
		gap: var(--space-1);
		border-bottom: 1px solid var(--color-border);
		margin-bottom: var(--space-4);
		overflow-x: auto;
	}

	.tab {
		min-height: var(--touch-min);
		padding: 0 var(--space-4);
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		margin-bottom: -1px;
		border-radius: 0;
		color: var(--color-text-muted);
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		white-space: nowrap;
	}

	.tab.active {
		color: var(--color-primary);
		border-bottom-color: var(--color-primary);
	}

	.tab:focus-visible {
		outline: 2px solid var(--color-primary);
		outline-offset: -2px;
	}

	.search {
		max-width: 420px;
		margin-bottom: var(--space-4);
	}

	.columns {
		display: grid;
		grid-template-columns: minmax(300px, 420px) 1fr;
		gap: var(--space-5);
		align-items: start;
	}

	.col {
		min-width: 0;
	}

	.row-total {
		margin-left: auto;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
	}

	.bill {
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		padding: var(--space-5);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.bill-actions {
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
	}

	.bill header {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
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

	.lines {
		display: flex;
		flex-direction: column;
		gap: var(--space-2);
	}

	.lines li {
		display: flex;
		align-items: flex-start;
		gap: var(--space-3);
		padding-bottom: var(--space-2);
		border-bottom: 1px solid var(--color-border);
	}

	.lines li.voided {
		opacity: 0.55;
		text-decoration: line-through;
	}

	.qty {
		font-weight: 700;
		color: var(--color-primary);
		min-width: 2.5ch;
	}

	.line-body {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.line-name {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 600;
	}

	.line-mods,
	.line-note {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.line-note {
		font-style: italic;
	}

	.line-price {
		font-variant-numeric: tabular-nums;
		font-weight: 600;
	}

	.totals {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-1) var(--space-4);
		margin: 0;
		padding-top: var(--space-2);
	}

	.totals dt {
		color: var(--color-text-muted);
	}

	.totals dd {
		margin: 0;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.totals .grand {
		font-family: var(--font-display);
		font-size: var(--text-lg);
		font-weight: 700;
		color: var(--color-text);
		padding-top: var(--space-2);
		border-top: 1px solid var(--color-border);
	}

	.payment-list {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.payment-list li {
		display: flex;
		justify-content: space-between;
		gap: var(--space-3);
		font-variant-numeric: tabular-nums;
	}

	.tip {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.paid {
		margin: var(--space-2) 0 0;
		font-weight: 600;
	}

	@media (max-width: 900px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
</style>
