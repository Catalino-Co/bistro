<script lang="ts">
	import { apiFetch } from '$lib/api.js';

	interface Group {
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

	let groups = $state<Group[]>([]);
	let modifiers = $state<Modifier[]>([]);
	let selectedGroupId = $state<number | null>(null);

	let newGroupName = $state('');
	let newGroupSelectionType = $state<'single' | 'multiple'>('single');
	let newModifierName = $state('');
	let newModifierPriceDelta = $state('0.00');

	async function loadGroups() {
		const response = await apiFetch('/modifiers/groups');
		if (response.ok) {
			groups = ((await response.json()) as { groups: Group[] }).groups;
		}
	}

	async function loadModifiers(groupId: number) {
		const response = await apiFetch(`/modifiers?groupId=${groupId}`);
		if (response.ok) {
			modifiers = ((await response.json()) as { modifiers: Modifier[] }).modifiers;
		}
	}

	function selectGroup(id: number) {
		selectedGroupId = id;
		loadModifiers(id);
	}

	async function createGroup(event: SubmitEvent) {
		event.preventDefault();
		if (!newGroupName.trim()) return;
		const response = await apiFetch('/modifiers/groups', {
			method: 'POST',
			body: JSON.stringify({ name: newGroupName.trim(), selectionType: newGroupSelectionType }),
		});
		if (response.ok) {
			newGroupName = '';
			await loadGroups();
		}
	}

	async function createModifier(event: SubmitEvent) {
		event.preventDefault();
		if (!newModifierName.trim() || selectedGroupId === null) return;
		const response = await apiFetch('/modifiers', {
			method: 'POST',
			body: JSON.stringify({
				groupId: selectedGroupId,
				name: newModifierName.trim(),
				priceDelta: newModifierPriceDelta.trim() || '0',
			}),
		});
		if (response.ok) {
			newModifierName = '';
			newModifierPriceDelta = '0.00';
			await loadModifiers(selectedGroupId);
		}
	}

	$effect(() => {
		loadGroups();
	});
</script>

<div class="page">
	<h1>Modificadores</h1>

	<section>
		<h2>Grupos</h2>
		<ul>
			{#each groups as group (group.id)}
				<li>
					<button onclick={() => selectGroup(group.id)}>{group.name} ({group.selectionType})</button>
				</li>
			{/each}
		</ul>
		<form onsubmit={createGroup}>
			<input type="text" bind:value={newGroupName} placeholder="Nuevo grupo" required />
			<select bind:value={newGroupSelectionType}>
				<option value="single">Único</option>
				<option value="multiple">Múltiple</option>
			</select>
			<button type="submit">Crear</button>
		</form>
	</section>

	{#if selectedGroupId !== null}
		<section>
			<h2>Modificadores</h2>
			<ul>
				{#each modifiers as modifier (modifier.id)}
					<li>{modifier.name} — +RD$ {modifier.priceDelta}</li>
				{/each}
			</ul>
			<form onsubmit={createModifier}>
				<input type="text" bind:value={newModifierName} placeholder="Nuevo modificador" required />
				<input type="text" bind:value={newModifierPriceDelta} placeholder="Precio adicional" />
				<button type="submit">Crear</button>
			</form>
		</section>
	{/if}
</div>
