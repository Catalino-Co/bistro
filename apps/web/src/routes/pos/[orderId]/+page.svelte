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
		modifiers: { modifierId: number; name: string; priceDelta: string }[];
	}

	let items = $state<Item[]>([]);
	let lines = $state<OrderLine[]>([]);
	let closed = $state(false);

	let selectedItemId = $state<number | null>(null);
	let itemModifierGroups = $state<ModifierGroup[]>([]);
	let modifiersByGroup = $state<Record<number, Modifier[]>>({});
	let selectedModifierIds = $state<Set<number>>(new Set());
	let quantity = $state('1');
	let note = $state('');
	let errorMessage = $state('');

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

	async function loadLines() {
		const response = await apiFetch(`/orders/${orderId}/lines`);
		if (response.ok) {
			lines = ((await response.json()) as { lines: OrderLine[] }).lines;
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

	async function addLine(event: SubmitEvent) {
		event.preventDefault();
		errorMessage = '';
		if (selectedItemId === null) return;
		const response = await apiFetch(`/orders/${orderId}/lines`, {
			method: 'POST',
			body: JSON.stringify({
				itemId: selectedItemId,
				quantity: Number(quantity) || 1,
				note: note.trim() || undefined,
				modifierIds: [...selectedModifierIds],
			}),
		});
		if (response.ok) {
			quantity = '1';
			note = '';
			selectedModifierIds = new Set();
			await loadLines();
		} else {
			const body = (await response.json()) as { error: string };
			errorMessage = body.error;
		}
	}

	async function closeOrder() {
		const response = await apiFetch(`/orders/${orderId}/close`, { method: 'POST' });
		if (response.ok) {
			closed = true;
			goto('/admin/floor');
		}
	}

	$effect(() => {
		loadItems();
		loadLines();
	});
</script>

<main>
	<h1>Orden #{orderId}</h1>

	<section>
		<h2>Líneas</h2>
		{#if lines.length === 0}
			<p>Sin líneas todavía.</p>
		{:else}
			<ul>
				{#each lines as line (line.id)}
					<li>
						{line.quantity}× {itemName(line.itemId)}
						{#if line.modifiers.length > 0}
							(+ {line.modifiers.map((m) => m.name).join(', ')})
						{/if}
						{#if line.note}
							— <em>{line.note}</em>
						{/if}
						— RD$ {lineTotal(line).toFixed(2)}
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<section>
		<h2>Agregar línea</h2>
		<form onsubmit={addLine}>
			<select bind:value={selectedItemId} onchange={() => selectedItemId && selectItem(selectedItemId)}>
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

			<button type="submit" disabled={selectedItemId === null}>Agregar</button>
		</form>
		{#if errorMessage}
			<p role="alert">{errorMessage}</p>
		{/if}
	</section>

	<button onclick={closeOrder} disabled={closed}>Facturar (cerrar orden)</button>
</main>
