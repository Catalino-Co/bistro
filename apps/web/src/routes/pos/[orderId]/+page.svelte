<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { apiFetch } from '$lib/api.js';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { apiErrorMessage } from '$lib/errors.js';
	import Icon from '$lib/components/Icon.svelte';

	const orderId = Number(page.params.orderId);

	interface Item {
		id: number;
		name: string;
		price: string;
		categoryId: number;
		categoryName: string;
	}
	interface ModifierGroup {
		id: number;
		name: string;
		selectionType: 'single' | 'multiple';
	}
	interface Modifier {
		id: number;
		groupId: number;
		name: string;
		priceDelta: string;
	}
	interface OrderLine {
		id: number;
		itemId: number;
		quantity: number;
		note: string | null;
		unitPrice: string;
		voidedAt: string | null;
		sentToKitchenAt: string | null;
		preparedAt: string | null;
		modifiers: { modifierId: number; name: string; priceDelta: string }[];
	}
	interface Totals {
		subtotal: string;
		taxTotal: string;
		total: string;
	}
	interface PaymentMethod {
		id: number;
		name: string;
	}
	interface Payment {
		id: number;
		paymentMethodId: number;
		paymentMethodName: string;
		amount: string;
		tipAmount: string;
		tenderedAmount: string | null;
	}
	interface OrderDetail {
		dineTableName: string;
		dispatchMode: 'dine_in' | 'delivery' | 'pickup' | 'room_service';
		customerName: string | null;
	}

	const DISPATCH_MODE_LABELS: Record<OrderDetail['dispatchMode'], string> = {
		dine_in: 'En mesa',
		delivery: 'Delivery',
		pickup: 'Pickup',
		room_service: 'Room service',
	};

	let items = $state<Item[]>([]);
	let selectedCategoryName = $state<string | null>(null);
	let lines = $state<OrderLine[]>([]);
	let orderDetail = $state<OrderDetail | null>(null);
	let totals = $state<Totals | null>(null);
	let paymentMethods = $state<PaymentMethod[]>([]);
	let payments = $state<Payment[]>([]);
	let closed = $state(false);

	let selectedPaymentMethodId = $state<number | null>(null);
	let paymentAmount = $state('');
	let paymentTip = $state('0');
	let paymentTendered = $state('');
	let paymentError = $state('');

	let selectedItemId = $state<number | null>(null);
	let itemModifierGroups = $state<ModifierGroup[]>([]);
	let modifiersByGroup = $state<Record<number, Modifier[]>>({});
	let selectedModifierIds = $state<Set<number>>(new Set());
	let quantity = $state('1');
	let note = $state('');
	let errorMessage = $state('');
	let lineToVoid = $state<OrderLine | null>(null);
	let printing = $state(false);
	let printError = $state('');

	/**
	 * La pre-cuenta: el papel que se lleva a la mesa para que el cliente
	 * revise antes de pagar. Es el mismo documento que la reimpresión de
	 * después, y cada impresión queda numerada en la bitácora.
	 */
	async function printBill() {
		printError = '';
		printing = true;
		try {
			const response = await apiFetch(`/orders/${orderId}/print-bill`, { method: 'POST' });
			if (!response.ok) {
				printError = await apiErrorMessage(response, 'No se pudo imprimir la cuenta.');
			}
		} finally {
			printing = false;
		}
	}
	let editingLineId = $state<number | null>(null);
	let kitchenError = $state('');

	function itemName(itemId: number): string {
		return items.find((i) => i.id === itemId)?.name ?? `Ítem #${itemId}`;
	}

	function lineTotal(line: OrderLine): number {
		const perUnit =
			Number(line.unitPrice) + line.modifiers.reduce((sum, m) => sum + Number(m.priceDelta), 0);
		return Math.round(perUnit * line.quantity * 10000) / 10000;
	}

	function categoryNames(): string[] {
		return [...new Set(items.map((i) => i.categoryName))];
	}

	function itemsInCategory(categoryName: string | null): Item[] {
		return items.filter((i) => i.categoryName === categoryName);
	}

	async function loadItems() {
		const response = await apiFetch('/catalog/items/full');
		if (response.ok) {
			items = ((await response.json()) as { items: Item[] }).items;
			if (selectedCategoryName === null && items.length > 0) {
				selectedCategoryName = items[0]!.categoryName;
			}
		}
	}

	async function loadOrderDetail() {
		const response = await apiFetch(`/orders/${orderId}`);
		if (response.ok) {
			orderDetail = ((await response.json()) as { order: OrderDetail }).order;
		}
	}

	async function loadLines() {
		const response = await apiFetch(`/orders/${orderId}/lines`);
		if (response.ok) {
			lines = ((await response.json()) as { lines: OrderLine[] }).lines;
		}
	}

	async function loadTotals() {
		const response = await apiFetch(`/orders/${orderId}/totals`);
		if (response.ok) {
			totals = (await response.json()) as Totals;
		}
	}

	async function loadPaymentMethods() {
		const response = await apiFetch('/payment-methods');
		if (response.ok) {
			paymentMethods = ((await response.json()) as { paymentMethods: PaymentMethod[] })
				.paymentMethods;
		}
	}

	async function loadPayments() {
		const response = await apiFetch(`/orders/${orderId}/payments`);
		if (response.ok) {
			payments = ((await response.json()) as { payments: Payment[] }).payments;
		}
	}

	async function refresh() {
		await Promise.all([loadLines(), loadTotals(), loadPayments()]);
	}

	function balanceDue(): number {
		if (!totals) return 0;
		const paid = payments.reduce((sum, p) => sum + Number(p.amount), 0);
		const cents = Math.round(Number(totals.total) * 10000) - Math.round(paid * 10000);
		return Math.max(0, cents) / 10000;
	}

	function hasPendingKitchenLines(): boolean {
		return lines.some((l) => l.voidedAt === null && l.sentToKitchenAt === null);
	}

	async function sendToKitchen() {
		kitchenError = '';
		const response = await apiFetch(`/orders/${orderId}/send-to-kitchen`, { method: 'POST' });
		if (response.ok) {
			const body = (await response.json()) as {
				printResults: { stationName: string; outcome: string; error?: string }[];
			};
			const failed = body.printResults.filter((p) => p.outcome === 'print_failed');
			if (failed.length > 0) {
				kitchenError = `No se pudo imprimir en: ${failed.map((f) => f.stationName).join(', ')} (revisa la impresora; las líneas ya quedaron marcadas y visibles en el tablero de cocina)`;
			}
			await refresh();
		} else {
			const body = (await response.json()) as { error: string };
			kitchenError = body.error;
		}
	}

	async function loadModifiersForItem(itemId: number) {
		modifiersByGroup = {};
		const response = await apiFetch(`/catalog/items/${itemId}/modifier-groups`);
		if (!response.ok) {
			itemModifierGroups = [];
			return;
		}
		itemModifierGroups = ((await response.json()) as { groups: ModifierGroup[] }).groups;
		for (const group of itemModifierGroups) {
			const modResponse = await apiFetch(`/modifiers?groupId=${group.id}`);
			if (modResponse.ok) {
				modifiersByGroup[group.id] = ((await modResponse.json()) as { modifiers: Modifier[] })
					.modifiers;
			}
		}
	}

	async function selectItem(itemId: number) {
		if (editingLineId !== null) return;
		selectedItemId = itemId;
		selectedModifierIds = new Set();
		await loadModifiersForItem(itemId);
	}

	function toggleModifier(modifierId: number) {
		const next = new Set(selectedModifierIds);
		if (next.has(modifierId)) {
			next.delete(modifierId);
		} else {
			next.add(modifierId);
		}
		selectedModifierIds = next;
	}

	function resetForm() {
		editingLineId = null;
		selectedItemId = null;
		itemModifierGroups = [];
		modifiersByGroup = {};
		selectedModifierIds = new Set();
		quantity = '1';
		note = '';
	}

	async function startEdit(line: OrderLine) {
		errorMessage = '';
		editingLineId = null;
		selectedItemId = line.itemId;
		quantity = String(line.quantity);
		note = line.note ?? '';
		await loadModifiersForItem(line.itemId);
		selectedModifierIds = new Set(line.modifiers.map((m) => m.modifierId));
		editingLineId = line.id;
	}

	async function submitLine(event: SubmitEvent) {
		event.preventDefault();
		errorMessage = '';
		if (selectedItemId === null) return;
		const payload = {
			quantity: Number(quantity) || 1,
			note: note.trim() || undefined,
			modifierIds: [...selectedModifierIds],
		};
		const response =
			editingLineId === null
				? await apiFetch(`/orders/${orderId}/lines`, {
						method: 'POST',
						body: JSON.stringify({ itemId: selectedItemId, ...payload }),
					})
				: await apiFetch(`/orders/${orderId}/lines/${editingLineId}`, {
						method: 'PATCH',
						body: JSON.stringify(payload),
					});
		if (response.ok) {
			resetForm();
			await refresh();
		} else {
			const body = (await response.json()) as { error: string };
			errorMessage = body.error;
		}
	}

	// Anular una línea es irreversible y queda en la cuenta tachada: pasa por
	// el diálogo del sistema, no por el confirm() del navegador, que no se
	// puede leer con el dedo en una tableta ni dice qué se va a anular.
	async function voidLine() {
		const line = lineToVoid;
		if (!line) return;
		errorMessage = '';
		const response = await apiFetch(`/orders/${orderId}/lines/${line.id}/void`, {
			method: 'POST',
		});
		if (response.ok) {
			if (editingLineId === line.id) resetForm();
			await refresh();
		} else {
			errorMessage = await apiErrorMessage(response, 'No se pudo anular la línea.');
		}
	}

	async function submitPayment(event: SubmitEvent) {
		event.preventDefault();
		paymentError = '';
		if (selectedPaymentMethodId === null || paymentAmount.trim() === '') return;
		const response = await apiFetch(`/orders/${orderId}/payments`, {
			method: 'POST',
			body: JSON.stringify({
				paymentMethodId: selectedPaymentMethodId,
				amount: paymentAmount,
				tipAmount: paymentTip.trim() || '0',
				tenderedAmount: paymentTendered.trim() || undefined,
			}),
		});
		if (response.ok) {
			selectedPaymentMethodId = null;
			paymentAmount = '';
			paymentTip = '0';
			paymentTendered = '';
			await refresh();
		} else {
			const body = (await response.json()) as { error: string; balanceDue?: string };
			paymentError =
				body.balanceDue !== undefined
					? `${body.error} (saldo: RD$ ${Number(body.balanceDue).toFixed(2)})`
					: body.error;
		}
	}

	async function closeOrder() {
		errorMessage = '';
		const response = await apiFetch(`/orders/${orderId}/close`, { method: 'POST' });
		if (response.ok) {
			closed = true;
			goto('/pos');
		} else {
			const body = (await response.json()) as { error: string; balanceDue?: string };
			errorMessage =
				body.error === 'insufficient_payment'
					? `Falta cobrar RD$ ${Number(body.balanceDue).toFixed(2)}`
					: body.error;
		}
	}

	$effect(() => {
		loadItems();
		loadPaymentMethods();
		loadOrderDetail();
		refresh();
	});
</script>

<div class="pos">
	<section class="menu">
		<header class="menu-header">
			<h1>Orden #{orderId}</h1>
			{#if orderDetail}
				<p class="order-meta">
					{orderDetail.dineTableName} · {DISPATCH_MODE_LABELS[orderDetail.dispatchMode]}
					{#if orderDetail.customerName}
						· {orderDetail.customerName}
					{/if}
				</p>
			{/if}
		</header>

		<div class="category-pills">
			{#each categoryNames() as category (category)}
				<button
					type="button"
					class="pill"
					class:active={selectedCategoryName === category}
					onclick={() => (selectedCategoryName = category)}
				>
					{category}
				</button>
			{/each}
		</div>

		<div class="item-grid">
			{#each itemsInCategory(selectedCategoryName) as item (item.id)}
				<button
					type="button"
					class="item-card"
					class:active={selectedItemId === item.id}
					disabled={editingLineId !== null}
					onclick={() => selectItem(item.id)}
				>
					<span class="item-card-name">{item.name}</span>
					<span class="item-card-price">RD$ {Number(item.price).toFixed(2)}</span>
				</button>
			{/each}
		</div>

		{#if selectedItemId !== null}
			<section class="add-line">
				<h2>{editingLineId === null ? `Agregar ${itemName(selectedItemId)}` : 'Editar línea'}</h2>
				<form onsubmit={submitLine}>
					<div class="field-row">
						<label>
							Cantidad
							<input type="number" bind:value={quantity} min="1" />
						</label>
						<label class="grow">
							Nota (opcional)
							<input type="text" bind:value={note} placeholder="Ej. sin cebolla" />
						</label>
					</div>

					{#if itemModifierGroups.length > 0}
						<fieldset>
							<legend>Modificadores</legend>
							{#each itemModifierGroups as group (group.id)}
								<p class="group-name">{group.name}</p>
								{#each modifiersByGroup[group.id] ?? [] as modifier (modifier.id)}
									<label class="checkbox">
										<input
											type="checkbox"
											checked={selectedModifierIds.has(modifier.id)}
											onchange={() => toggleModifier(modifier.id)}
										/>
										{modifier.name} (+{modifier.priceDelta})
									</label>
								{/each}
							{/each}
						</fieldset>
					{/if}

					<div class="field-row">
						<button type="submit" class="btn-primary">
							{editingLineId === null ? 'Agregar' : 'Guardar cambios'}
						</button>
						<button type="button" onclick={resetForm}>Cancelar</button>
					</div>
				</form>
				{#if errorMessage}
					<p role="alert">{errorMessage}</p>
				{/if}
			</section>
		{/if}
	</section>

	<aside class="order-panel">
		<h2>Cuenta</h2>

		<div class="lines-list">
			{#if lines.length === 0}
				<p class="muted">Sin líneas todavía.</p>
			{:else}
				<ul>
					{#each lines as line (line.id)}
						<li class:voided={line.voidedAt !== null}>
							<div class="line-main">
								<span>{line.quantity}× {itemName(line.itemId)}</span>
								<span>RD$ {lineTotal(line).toFixed(2)}</span>
							</div>
							{#if line.modifiers.length > 0 || line.note}
								<div class="line-detail">
									{#if line.modifiers.length > 0}
										+ {line.modifiers.map((m) => m.name).join(', ')}
									{/if}
									{#if line.note}
										<em>{line.note}</em>
									{/if}
								</div>
							{/if}
							{#if line.voidedAt}
								<span class="voided-tag">Anulada</span>
							{:else}
								<div class="line-actions">
									{#if line.preparedAt}
										<span class="kitchen-tag">Preparado</span>
									{:else if line.sentToKitchenAt}
										<span class="kitchen-tag">Enviado a cocina</span>
									{/if}
									<button type="button" disabled={closed} onclick={() => startEdit(line)}
										>Editar</button
									>
									<button type="button" disabled={closed} onclick={() => (lineToVoid = line)}
										>Anular</button
									>
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
		</div>

		{#if totals}
			<dl class="totals">
				<dt>Subtotal</dt>
				<dd>RD$ {Number(totals.subtotal).toFixed(2)}</dd>
				<dt>ITBIS</dt>
				<dd>RD$ {Number(totals.taxTotal).toFixed(2)}</dd>
				<dt>Total</dt>
				<dd>RD$ {Number(totals.total).toFixed(2)}</dd>
			</dl>
		{/if}

		<div class="payments">
			<h3>Pagos</h3>
			{#if payments.length === 0}
				<p class="muted">Sin pagos todavía.</p>
			{:else}
				<ul>
					{#each payments as payment (payment.id)}
						<li>
							{payment.paymentMethodName} — RD$ {Number(payment.amount).toFixed(2)}
							{#if Number(payment.tipAmount) > 0}
								(propina RD$ {Number(payment.tipAmount).toFixed(2)})
							{/if}
							{#if payment.tenderedAmount}
								<br />recibido RD$ {Number(payment.tenderedAmount).toFixed(2)}, cambio RD$ {(
									Number(payment.tenderedAmount) - Number(payment.amount)
								).toFixed(2)}
							{/if}
						</li>
					{/each}
				</ul>
			{/if}
			<p class="balance">Saldo pendiente: RD$ {balanceDue().toFixed(2)}</p>

			{#if !closed && balanceDue() > 0}
				<form onsubmit={submitPayment}>
					<select bind:value={selectedPaymentMethodId}>
						<option value={null} disabled selected>Método de pago</option>
						{#each paymentMethods as method (method.id)}
							<option value={method.id}>{method.name}</option>
						{/each}
					</select>
					<input type="text" inputmode="decimal" bind:value={paymentAmount} placeholder="Monto" />
					<input type="text" inputmode="decimal" bind:value={paymentTip} placeholder="Propina" />
					<input
						type="text"
						inputmode="decimal"
						bind:value={paymentTendered}
						placeholder="Recibido (efectivo, opcional)"
					/>
					<button type="submit" disabled={selectedPaymentMethodId === null}>Registrar pago</button>
				</form>
				{#if paymentError}
					<p role="alert">{paymentError}</p>
				{/if}
			{/if}
		</div>

		{#if kitchenError}
			<p role="alert">{kitchenError}</p>
		{/if}
		{#if printError}
			<p role="alert">{printError}</p>
		{/if}

		<div class="panel-actions">
			<button
				type="button"
				class="btn-secondary"
				disabled={closed || !hasPendingKitchenLines()}
				onclick={sendToKitchen}
			>
				<Icon name="send" size={18} />
				Enviar a cocina
			</button>
			<button type="button" class="btn-secondary" disabled={printing} onclick={printBill}>
				<Icon name="printer" size={18} />
				{printing ? 'Imprimiendo…' : 'Imprimir cuenta'}
			</button>
			<button
				type="button"
				class="btn-primary"
				disabled={closed || balanceDue() > 0}
				onclick={closeOrder}
			>
				<Icon name="payment" size={18} />
				Facturar
			</button>
		</div>
	</aside>
</div>

<ConfirmDialog
	open={lineToVoid !== null}
	title="¿Anular esta línea?"
	message="Se anulará {lineToVoid?.quantity ?? ''}× del ítem. La línea se queda visible y tachada en la cuenta, pero deja de sumar al total."
	confirmLabel="Anular línea"
	onconfirm={voidLine}
	onclose={() => (lineToVoid = null)}
/>

<style>
	.pos {
		display: flex;
		gap: 1.5rem;
		align-items: flex-start;
	}

	.menu {
		flex: 1;
		min-width: 0;
	}

	.menu-header {
		margin-bottom: 1rem;
	}

	.menu-header h1 {
		margin-bottom: 0.15rem;
	}

	.order-meta {
		color: var(--color-text-muted);
		margin: 0;
	}

	.category-pills {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.pill {
		background: var(--color-surface);
		color: var(--color-text-muted);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		min-height: var(--touch-min);
		padding: 0 var(--space-4);
		font-weight: 500;
	}

	.pill.active {
		background: var(--color-primary);
		color: var(--color-surface);
		border-color: var(--color-primary);
	}

	.item-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1.25rem;
	}

	.item-card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.35rem;
		background: var(--color-surface);
		color: var(--color-text);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		padding: 0.85rem;
		text-align: left;
	}

	.item-card:hover:not(:disabled) {
		border-color: var(--color-primary);
	}

	.item-card.active {
		border-color: var(--color-primary);
		background: var(--color-primary-tint);
	}

	.item-card-name {
		font-weight: 600;
	}

	.item-card-price {
		color: var(--color-primary);
		font-weight: 600;
		font-size: 0.9rem;
	}

	.add-line .field-row {
		display: flex;
		gap: 0.75rem;
		align-items: flex-end;
		margin-bottom: 0.75rem;
	}

	.add-line .grow {
		flex: 1;
	}

	.group-name {
		font-weight: 600;
		margin: 0.5rem 0 0.25rem;
	}

	.checkbox {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.9rem;
		color: var(--color-text);
	}

	.order-panel {
		width: 340px;
		flex-shrink: 0;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-sm);
		padding: 1.25rem;
		position: sticky;
		top: 1.5rem;
	}

	.order-panel h2 {
		margin-bottom: 0.75rem;
	}

	.muted {
		color: var(--color-text-muted);
	}

	.lines-list li {
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--color-border);
	}

	.line-main {
		display: flex;
		justify-content: space-between;
		font-weight: 500;
	}

	.line-detail {
		font-size: 0.85rem;
		color: var(--color-text-muted);
	}

	.line-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.35rem;
	}

	.line-actions button {
		font-size: 0.8rem;
		padding: 0.25rem 0.5rem;
	}

	.voided {
		opacity: 0.55;
	}

	.voided .line-main {
		text-decoration: line-through;
	}

	.voided-tag {
		font-size: 0.8rem;
		color: var(--color-danger);
	}

	.kitchen-tag {
		font-size: 0.8rem;
		color: var(--color-success);
	}

	.totals {
		display: grid;
		grid-template-columns: 1fr max-content;
		gap: 0.25rem 1rem;
		margin: 1rem 0;
		padding-top: 0.75rem;
		border-top: 1px solid var(--color-border);
	}

	.totals dt {
		font-weight: normal;
		color: var(--color-text-muted);
	}

	.totals dd {
		margin: 0;
		text-align: right;
	}

	.totals dt:last-of-type,
	.totals dd:last-of-type {
		font-weight: 700;
		color: var(--color-text);
	}

	.payments {
		border-top: 1px solid var(--color-border);
		padding-top: 0.75rem;
	}

	.payments h3 {
		margin-bottom: 0.5rem;
	}

	.payments form {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.balance {
		font-weight: 600;
	}

	.panel-actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
		padding-top: 1rem;
		border-top: 1px solid var(--color-border);
	}

	.panel-actions button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.btn-secondary {
		background: var(--color-surface);
		color: var(--color-primary);
		border: 1px solid var(--color-primary);
	}

	.btn-secondary:hover:not(:disabled) {
		background: var(--color-primary-tint);
	}
</style>
