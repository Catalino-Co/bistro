<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { apiFetch } from '$lib/api.js';

	const orderId = Number(page.params.orderId);

	interface Item {
		id: number;
		name: string;
		price: string;
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

	async function loadItems() {
		const response = await apiFetch('/catalog/items');
		if (response.ok) {
			items = ((await response.json()) as { items: Item[] }).items;
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

	async function selectItem(itemId: number) {
		selectedItemId = itemId;
		selectedModifierIds = new Set();
		modifiersByGroup = {};
		const response = await apiFetch(`/catalog/items/${itemId}/modifier-groups`);
		if (!response.ok) return;
		itemModifierGroups = ((await response.json()) as { groups: ModifierGroup[] }).groups;
		for (const group of itemModifierGroups) {
			const modResponse = await apiFetch(`/modifiers?groupId=${group.id}`);
			if (modResponse.ok) {
				modifiersByGroup[group.id] = ((await modResponse.json()) as { modifiers: Modifier[] })
					.modifiers;
			}
		}
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
		editingLineId = line.id;
		quantity = String(line.quantity);
		note = line.note ?? '';
		await selectItem(line.itemId);
		selectedModifierIds = new Set(line.modifiers.map((m) => m.modifierId));
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

	async function voidLine(lineId: number) {
		if (!confirm('¿Anular esta línea?')) return;
		errorMessage = '';
		const response = await apiFetch(`/orders/${orderId}/lines/${lineId}/void`, {
			method: 'POST',
		});
		if (response.ok) {
			if (editingLineId === lineId) resetForm();
			await refresh();
		} else {
			const body = (await response.json()) as { error: string };
			errorMessage = body.error;
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
			goto('/admin/floor');
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

<main>
	<h1>Orden #{orderId}</h1>
	{#if orderDetail}
		<p>
			{orderDetail.dineTableName} — {DISPATCH_MODE_LABELS[orderDetail.dispatchMode]}
			{#if orderDetail.customerName}
				— {orderDetail.customerName}
			{/if}
		</p>
	{/if}

	<section>
		<h2>Líneas</h2>
		{#if lines.length === 0}
			<p>Sin líneas todavía.</p>
		{:else}
			<ul>
				{#each lines as line (line.id)}
					<li class:voided={line.voidedAt !== null}>
						{line.quantity}× {itemName(line.itemId)}
						{#if line.modifiers.length > 0}
							(+ {line.modifiers.map((m) => m.name).join(', ')})
						{/if}
						{#if line.note}
							— <em>{line.note}</em>
						{/if}
						— RD$ {lineTotal(line).toFixed(2)}
						{#if line.voidedAt}
							<span class="voided-tag">(anulada)</span>
						{:else}
							{#if line.preparedAt}
								<span class="kitchen-tag">(preparado)</span>
							{:else if line.sentToKitchenAt}
								<span class="kitchen-tag">(enviado a cocina)</span>
							{/if}
							<button type="button" disabled={closed} onclick={() => startEdit(line)}
								>Editar</button
							>
							<button type="button" disabled={closed} onclick={() => voidLine(line.id)}
								>Anular</button
							>
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
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
		<button type="button" disabled={closed || !hasPendingKitchenLines()} onclick={sendToKitchen}>
			Enviar a cocina
		</button>
		{#if kitchenError}
			<p role="alert">{kitchenError}</p>
		{/if}
	</section>

	<section>
		<h2>{editingLineId === null ? 'Agregar línea' : `Editar línea #${editingLineId}`}</h2>
		<form onsubmit={submitLine}>
			<select
				bind:value={selectedItemId}
				disabled={editingLineId !== null}
				onchange={() => selectedItemId && selectItem(selectedItemId)}
			>
				<option value={null} disabled selected>Selecciona un ítem</option>
				{#each items as item (item.id)}
					<option value={item.id}>{item.name} — RD$ {item.price}</option>
				{/each}
			</select>
			<input type="number" bind:value={quantity} min="1" placeholder="Cantidad" />
			<input type="text" bind:value={note} placeholder="Nota (opcional)" />

			{#if selectedItemId !== null && itemModifierGroups.length > 0}
				<fieldset>
					<legend>Modificadores</legend>
					{#each itemModifierGroups as group (group.id)}
						<p>{group.name}</p>
						{#each modifiersByGroup[group.id] ?? [] as modifier (modifier.id)}
							<label>
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

			<button type="submit" disabled={selectedItemId === null}>
				{editingLineId === null ? 'Agregar' : 'Guardar cambios'}
			</button>
			{#if editingLineId !== null}
				<button type="button" onclick={resetForm}>Cancelar</button>
			{/if}
		</form>
		{#if errorMessage}
			<p role="alert">{errorMessage}</p>
		{/if}
	</section>

	<section>
		<h2>Pagos</h2>
		{#if payments.length === 0}
			<p>Sin pagos todavía.</p>
		{:else}
			<ul>
				{#each payments as payment (payment.id)}
					<li>
						{payment.paymentMethodName} — RD$ {Number(payment.amount).toFixed(2)}
						{#if Number(payment.tipAmount) > 0}
							(propina RD$ {Number(payment.tipAmount).toFixed(2)})
						{/if}
						{#if payment.tenderedAmount}
							— recibido RD$ {Number(payment.tenderedAmount).toFixed(2)}, cambio RD$ {(
								Number(payment.tenderedAmount) - Number(payment.amount)
							).toFixed(2)}
						{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<p>Saldo pendiente: RD$ {balanceDue().toFixed(2)}</p>

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
	</section>

	<button onclick={closeOrder} disabled={closed || balanceDue() > 0}>Facturar (cerrar orden)</button>
</main>

<style>
	.voided {
		text-decoration: line-through;
		opacity: 0.6;
	}
	.voided-tag {
		font-style: italic;
	}
	.kitchen-tag {
		font-size: 0.85em;
		color: gray;
	}
	.totals {
		display: grid;
		grid-template-columns: max-content max-content;
		gap: 0.25rem 1rem;
		max-width: 16rem;
	}
	.totals dt {
		font-weight: normal;
	}
	.totals dd {
		margin: 0;
		text-align: right;
	}
	.totals dt:last-of-type,
	.totals dd:last-of-type {
		font-weight: bold;
	}
</style>
