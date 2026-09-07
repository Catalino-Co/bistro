<script lang="ts">
	import { apiFetch } from '$lib/api.js';

	interface Category {
		id: number;
		name: string;
	}
	interface Family {
		id: number;
		categoryId: number;
		name: string;
	}
	interface Subfamily {
		id: number;
		familyId: number;
		name: string;
	}
	interface Item {
		id: number;
		subfamilyId: number;
		name: string;
		price: string;
	}
	interface TaxRate {
		id: number;
		name: string;
	}

	let categories = $state<Category[]>([]);
	let families = $state<Family[]>([]);
	let subfamilies = $state<Subfamily[]>([]);
	let items = $state<Item[]>([]);
	let taxRates = $state<TaxRate[]>([]);

	let selectedCategoryId = $state<number | null>(null);
	let selectedFamilyId = $state<number | null>(null);
	let selectedSubfamilyId = $state<number | null>(null);

	let newCategoryName = $state('');
	let newFamilyName = $state('');
	let newSubfamilyName = $state('');
	let newItemName = $state('');
	let newItemPrice = $state('');
	let newItemTaxRateId = $state<number | null>(null);

	async function loadCategories() {
		const response = await apiFetch('/catalog/categories');
		if (response.ok) {
			categories = ((await response.json()) as { categories: Category[] }).categories;
		}
	}

	async function loadTaxRates() {
		const response = await apiFetch('/catalog/tax-rates');
		if (response.ok) {
			taxRates = ((await response.json()) as { taxRates: TaxRate[] }).taxRates;
			if (newItemTaxRateId === null && taxRates.length > 0) {
				newItemTaxRateId = taxRates[0]!.id;
			}
		}
	}

	async function loadFamilies(categoryId: number) {
		const response = await apiFetch(`/catalog/families?categoryId=${categoryId}`);
		if (response.ok) {
			families = ((await response.json()) as { families: Family[] }).families;
		}
	}

	async function loadSubfamilies(familyId: number) {
		const response = await apiFetch(`/catalog/subfamilies?familyId=${familyId}`);
		if (response.ok) {
			subfamilies = ((await response.json()) as { subfamilies: Subfamily[] }).subfamilies;
		}
	}

	async function loadItems(subfamilyId: number) {
		const response = await apiFetch(`/catalog/items?subfamilyId=${subfamilyId}`);
		if (response.ok) {
			items = ((await response.json()) as { items: Item[] }).items;
		}
	}

	function selectCategory(id: number) {
		selectedCategoryId = id;
		selectedFamilyId = null;
		selectedSubfamilyId = null;
		subfamilies = [];
		items = [];
		loadFamilies(id);
	}

	function selectFamily(id: number) {
		selectedFamilyId = id;
		selectedSubfamilyId = null;
		items = [];
		loadSubfamilies(id);
	}

	function selectSubfamily(id: number) {
		selectedSubfamilyId = id;
		loadItems(id);
	}

	async function createCategory(event: SubmitEvent) {
		event.preventDefault();
		if (!newCategoryName.trim()) return;
		const response = await apiFetch('/catalog/categories', {
			method: 'POST',
			body: JSON.stringify({ name: newCategoryName.trim() }),
		});
		if (response.ok) {
			newCategoryName = '';
			await loadCategories();
		}
	}

	async function createFamily(event: SubmitEvent) {
		event.preventDefault();
		if (!newFamilyName.trim() || selectedCategoryId === null) return;
		const response = await apiFetch('/catalog/families', {
			method: 'POST',
			body: JSON.stringify({ categoryId: selectedCategoryId, name: newFamilyName.trim() }),
		});
		if (response.ok) {
			newFamilyName = '';
			await loadFamilies(selectedCategoryId);
		}
	}

	async function createSubfamily(event: SubmitEvent) {
		event.preventDefault();
		if (!newSubfamilyName.trim() || selectedFamilyId === null) return;
		const response = await apiFetch('/catalog/subfamilies', {
			method: 'POST',
			body: JSON.stringify({ familyId: selectedFamilyId, name: newSubfamilyName.trim() }),
		});
		if (response.ok) {
			newSubfamilyName = '';
			await loadSubfamilies(selectedFamilyId);
		}
	}

	async function createItem(event: SubmitEvent) {
		event.preventDefault();
		if (
			!newItemName.trim() ||
			!newItemPrice.trim() ||
			selectedSubfamilyId === null ||
			newItemTaxRateId === null
		)
			return;
		const response = await apiFetch('/catalog/items', {
			method: 'POST',
			body: JSON.stringify({
				subfamilyId: selectedSubfamilyId,
				name: newItemName.trim(),
				price: newItemPrice.trim(),
				taxRateId: newItemTaxRateId,
			}),
		});
		if (response.ok) {
			newItemName = '';
			newItemPrice = '';
			await loadItems(selectedSubfamilyId);
		}
	}

	$effect(() => {
		loadCategories();
		loadTaxRates();
	});
</script>

<main>
	<h1>Catálogo</h1>

	<section>
		<h2>Categorías</h2>
		<ul>
			{#each categories as category (category.id)}
				<li>
					<button onclick={() => selectCategory(category.id)}>{category.name}</button>
				</li>
			{/each}
		</ul>
		<form onsubmit={createCategory}>
			<input type="text" bind:value={newCategoryName} placeholder="Nueva categoría" required />
			<button type="submit">Crear</button>
		</form>
	</section>

	{#if selectedCategoryId !== null}
		<section>
			<h2>Familias</h2>
			<ul>
				{#each families as family (family.id)}
					<li>
						<button onclick={() => selectFamily(family.id)}>{family.name}</button>
					</li>
				{/each}
			</ul>
			<form onsubmit={createFamily}>
				<input type="text" bind:value={newFamilyName} placeholder="Nueva familia" required />
				<button type="submit">Crear</button>
			</form>
		</section>
	{/if}

	{#if selectedFamilyId !== null}
		<section>
			<h2>Subfamilias</h2>
			<ul>
				{#each subfamilies as subfamily (subfamily.id)}
					<li>
						<button onclick={() => selectSubfamily(subfamily.id)}>{subfamily.name}</button>
					</li>
				{/each}
			</ul>
			<form onsubmit={createSubfamily}>
				<input type="text" bind:value={newSubfamilyName} placeholder="Nueva subfamilia" required />
				<button type="submit">Crear</button>
			</form>
		</section>
	{/if}

	{#if selectedSubfamilyId !== null}
		<section>
			<h2>Ítems</h2>
			<ul>
				{#each items as item (item.id)}
					<li>{item.name} — RD$ {item.price}</li>
				{/each}
			</ul>
			<form onsubmit={createItem}>
				<input type="text" bind:value={newItemName} placeholder="Nuevo ítem" required />
				<input type="text" bind:value={newItemPrice} placeholder="Precio" required />
				<select bind:value={newItemTaxRateId}>
					{#each taxRates as taxRate (taxRate.id)}
						<option value={taxRate.id}>{taxRate.name}</option>
					{/each}
				</select>
				<button type="submit">Crear</button>
			</form>
		</section>
	{/if}
</main>
