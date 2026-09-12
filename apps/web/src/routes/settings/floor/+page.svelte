<script lang="ts">
	import { goto } from '$app/navigation';
	import { apiFetch } from '$lib/api.js';
	import { session } from '$lib/session.svelte.js';

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

	let dineAreas = $state<DineArea[]>([]);
	let tables = $state<DineTable[]>([]);
	let selectedAreaId = $state<number | null>(null);
	let noBranchSelected = $state(false);
	let customerTypes = $state<CustomerType[]>([]);

	let newAreaName = $state('');
	let newTableName = $state('');
	let newTableSeats = $state('4');
	let editingAreaId = $state<number | null>(null);
	let editingAreaName = $state('');

	let openingTableId = $state<number | null>(null);
	let openingDispatchMode = $state<DispatchMode>('dine_in');
	let customerSearch = $state('');
	let customerResults = $state<Customer[]>([]);
	let selectedCustomerId = $state<number | null>(null);
	let newCustomerName = $state('');
	let newCustomerTypeId = $state<number | null>(null);
	let openOrderError = $state('');

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

	async function createArea(event: SubmitEvent) {
		event.preventDefault();
		if (!newAreaName.trim()) return;
		const response = await apiFetch('/floor/dine-areas', {
			method: 'POST',
			body: JSON.stringify({ name: newAreaName.trim() }),
		});
		if (response.ok) {
			newAreaName = '';
			await loadDineAreas();
		}
	}

	function startEditArea(area: DineArea) {
		editingAreaId = area.id;
		editingAreaName = area.name;
	}

	async function saveAreaEdit() {
		if (editingAreaId === null || !editingAreaName.trim()) return;
		const response = await apiFetch(`/floor/dine-areas/${editingAreaId}`, {
			method: 'PATCH',
			body: JSON.stringify({ name: editingAreaName.trim() }),
		});
		if (response.ok) {
			editingAreaId = null;
			await loadDineAreas();
		}
	}

	async function deleteArea(id: number) {
		const response = await apiFetch(`/floor/dine-areas/${id}`, { method: 'DELETE' });
		if (response.ok) {
			if (selectedAreaId === id) {
				selectedAreaId = null;
				tables = [];
			}
			await loadDineAreas();
		}
	}

	async function createTable(event: SubmitEvent) {
		event.preventDefault();
		if (!newTableName.trim() || selectedAreaId === null) return;
		const response = await apiFetch('/floor/tables', {
			method: 'POST',
			body: JSON.stringify({
				dineAreaId: selectedAreaId,
				name: newTableName.trim(),
				seats: Number(newTableSeats) || 2,
			}),
		});
		if (response.ok) {
			newTableName = '';
			await loadTables(selectedAreaId);
		}
	}

	async function deleteTable(id: number) {
		if (selectedAreaId === null) return;
		const response = await apiFetch(`/floor/tables/${id}`, { method: 'DELETE' });
		if (response.ok) {
			await loadTables(selectedAreaId);
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

	function startOpenOrder(tableId: number) {
		openingTableId = tableId;
		openingDispatchMode = 'dine_in';
		customerSearch = '';
		customerResults = [];
		selectedCustomerId = null;
		newCustomerName = '';
		openOrderError = '';
	}

	function cancelOpenOrder() {
		openingTableId = null;
	}

	async function searchCustomers() {
		if (!customerSearch.trim()) {
			customerResults = [];
			return;
		}
		const response = await apiFetch(`/customers?search=${encodeURIComponent(customerSearch.trim())}`);
		if (response.ok) {
			customerResults = ((await response.json()) as { customers: Customer[] }).customers;
		}
	}

	async function quickAddCustomer() {
		if (!newCustomerName.trim() || newCustomerTypeId === null) return;
		const response = await apiFetch('/customers', {
			method: 'POST',
			body: JSON.stringify({ customerTypeId: newCustomerTypeId, name: newCustomerName.trim() }),
		});
		if (response.ok) {
			const { customer } = (await response.json()) as { customer: Customer };
			selectedCustomerId = customer.id;
			customerResults = [customer];
			newCustomerName = '';
		}
	}

	async function confirmOpenOrder() {
		if (openingTableId === null) return;
		openOrderError = '';
		const response = await apiFetch('/orders', {
			method: 'POST',
			body: JSON.stringify({
				dineTableId: openingTableId,
				dispatchMode: openingDispatchMode,
				customerId:
					openingDispatchMode === 'room_service' ? (selectedCustomerId ?? undefined) : undefined,
			}),
		});
		if (response.ok) {
			const { order } = (await response.json()) as { order: { id: number } };
			goto(`/pos/${order.id}`);
		} else {
			const body = (await response.json()) as { error: string };
			openOrderError = body.error;
		}
	}

	async function viewOrder(dineTableId: number) {
		const response = await apiFetch(`/orders/for-table/${dineTableId}`);
		if (response.ok) {
			const { order } = (await response.json()) as { order: { id: number } | null };
			if (order) goto(`/pos/${order.id}`);
		}
	}

	$effect(() => {
		loadDineAreas();
		loadCustomerTypes();
	});
</script>

<div class="page">
	<h1>Mesas y áreas</h1>

	{#if noBranchSelected}
		<p role="alert">
			Selecciona una sucursal en <a href="/">Inicio</a> antes de gestionar mesas y áreas.
		</p>
	{:else}
		<section>
			<h2>Áreas — {session.currentBranch?.name ?? ''}</h2>
			<ul>
				{#each dineAreas as area (area.id)}
					<li>
						{#if editingAreaId === area.id}
							<input type="text" bind:value={editingAreaName} />
							<button onclick={saveAreaEdit}>Guardar</button>
						{:else}
							<button onclick={() => selectArea(area.id)}>{area.name}</button>
							<button onclick={() => startEditArea(area)}>Editar</button>
							<button onclick={() => deleteArea(area.id)}>Eliminar</button>
						{/if}
					</li>
				{/each}
			</ul>
			<form onsubmit={createArea}>
				<input type="text" bind:value={newAreaName} placeholder="Nueva área" required />
				<button type="submit">Crear</button>
			</form>
		</section>

		{#if selectedAreaId !== null}
			<section>
				<h2>Mesas</h2>
				<ul>
					{#each tables as table (table.id)}
						<li>
							{table.name} ({table.seats} puestos) — {table.status}
							<button onclick={() => deleteTable(table.id)}>Eliminar</button>
							{#if table.status === 'available'}
								{#if openingTableId === table.id}
									<button onclick={cancelOpenOrder}>Cancelar</button>
								{:else}
									<button onclick={() => startOpenOrder(table.id)}>Abrir orden</button>
								{/if}
							{:else if table.status === 'occupied'}
								<button onclick={() => viewOrder(table.id)}>Ver orden</button>
							{/if}

							{#if openingTableId === table.id}
								<fieldset>
									<legend>Abrir orden — {table.name}</legend>
									<label>
										Modo de despacho:
										<select bind:value={openingDispatchMode}>
											<option value="dine_in">En mesa</option>
											<option value="delivery">Delivery</option>
											<option value="pickup">Pickup</option>
											<option value="room_service">Room service</option>
										</select>
									</label>

									{#if openingDispatchMode === 'room_service'}
										<div>
											<input
												type="text"
												bind:value={customerSearch}
												oninput={searchCustomers}
												placeholder="Buscar huésped por nombre"
											/>
											{#if customerResults.length > 0}
												<ul>
													{#each customerResults as customer (customer.id)}
														<li>
															<button
																type="button"
																onclick={() => (selectedCustomerId = customer.id)}
															>
																{customer.name} ({customer.customerTypeName})
															</button>
															{#if selectedCustomerId === customer.id}
																<strong>seleccionado</strong>
															{/if}
														</li>
													{/each}
												</ul>
											{/if}

											<p>¿No existe? Créalo:</p>
											<select bind:value={newCustomerTypeId}>
												{#each customerTypes as type (type.id)}
													<option value={type.id}>{type.name}</option>
												{/each}
											</select>
											<input
												type="text"
												bind:value={newCustomerName}
												placeholder="Nombre del huésped"
											/>
											<button type="button" onclick={quickAddCustomer}>Crear y usar</button>
										</div>
									{/if}

									<button
										type="button"
										disabled={openingDispatchMode === 'room_service' && selectedCustomerId === null}
										onclick={confirmOpenOrder}
									>
										Confirmar apertura
									</button>
									{#if openOrderError}
										<p role="alert">{openOrderError}</p>
									{/if}
								</fieldset>
							{/if}
						</li>
					{/each}
				</ul>
				<form onsubmit={createTable}>
					<input type="text" bind:value={newTableName} placeholder="Nueva mesa" required />
					<input type="number" bind:value={newTableSeats} placeholder="Puestos" min="1" />
					<button type="submit">Crear</button>
				</form>
			</section>
		{/if}
	{/if}
</div>
