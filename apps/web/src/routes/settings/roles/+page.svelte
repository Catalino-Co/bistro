<script lang="ts">
	import { apiFetch } from '$lib/api.js';
	import Badge from '$lib/components/Badge.svelte';
	import Button from '$lib/components/Button.svelte';
	import DataList from '$lib/components/DataList.svelte';
	import DataListRow from '$lib/components/DataListRow.svelte';
	import EmptyState from '$lib/components/EmptyState.svelte';
	import Field from '$lib/components/Field.svelte';
	import Modal from '$lib/components/Modal.svelte';
	import PageHeader from '$lib/components/PageHeader.svelte';
	import Skeleton from '$lib/components/Skeleton.svelte';
	import { PERMISSION_GROUP_ORDER, permissionCopy, type PermissionCopy } from '$lib/permissions.js';
	import { toasts } from '$lib/toasts.svelte.js';

	interface Role {
		id: number;
		name: string;
	}
	interface Permission {
		id: number;
		key: string;
		description: string | null;
	}

	let roles = $state<Role[]>([]);
	let permissions = $state<Permission[]>([]);
	let selectedRoleId = $state<number | null>(null);
	let grantedPermissionIds = $state<Set<number>>(new Set());
	let error = $state<string | null>(null);
	let loading = $state(true);

	let creating = $state(false);
	let newRoleName = $state('');
	let saving = $state(false);

	const selectedRole = $derived(roles.find((role) => role.id === selectedRoleId) ?? null);

	// Los permisos llegan planos desde la API; se agrupan por área para que la
	// lista se lea como una decisión ("¿qué puede hacer este rol?") y no como
	// un volcado de la tabla `permissions`.
	const groups = $derived.by(() => {
		const byGroup = new Map<string, { permission: Permission; copy: PermissionCopy }[]>();
		for (const permission of permissions) {
			const copy = permissionCopy(permission.key, permission.description);
			const bucket = byGroup.get(copy.group) ?? [];
			bucket.push({ permission, copy });
			byGroup.set(copy.group, bucket);
		}
		return [...byGroup.entries()].sort((a, b) => {
			const ia = PERMISSION_GROUP_ORDER.indexOf(a[0]);
			const ib = PERMISSION_GROUP_ORDER.indexOf(b[0]);
			return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
		});
	});

	async function loadRoles() {
		const response = await apiFetch('/rbac/roles');
		if (!response.ok) {
			error =
				response.status === 403
					? 'No tienes permiso para administrar roles.'
					: 'No se pudieron cargar los roles.';
			return;
		}
		roles = ((await response.json()) as { roles: Role[] }).roles;
	}

	async function loadPermissions() {
		const response = await apiFetch('/rbac/permissions');
		if (response.ok) {
			permissions = ((await response.json()) as { permissions: Permission[] }).permissions;
		}
	}

	async function selectRole(roleId: number) {
		selectedRoleId = roleId;
		const response = await apiFetch(`/rbac/roles/${roleId}/permissions`);
		if (response.ok) {
			grantedPermissionIds = new Set(
				((await response.json()) as { permissionIds: number[] }).permissionIds,
			);
		} else {
			toasts.error('No se pudieron cargar los permisos del rol.');
		}
	}

	async function togglePermission(permission: Permission) {
		if (selectedRoleId === null) return;
		const isGranted = grantedPermissionIds.has(permission.id);
		const copy = permissionCopy(permission.key, permission.description);
		const roleName = selectedRole?.name ?? '';

		const response = await apiFetch(
			isGranted
				? `/rbac/roles/${selectedRoleId}/permissions/${permission.id}`
				: `/rbac/roles/${selectedRoleId}/permissions`,
			{
				method: isGranted ? 'DELETE' : 'POST',
				...(isGranted ? {} : { body: JSON.stringify({ permissionId: permission.id }) }),
			},
		);

		if (!response.ok) {
			toasts.error(`No se pudo cambiar «${copy.label}».`);
			return;
		}

		const next = new Set(grantedPermissionIds);
		if (isGranted) {
			next.delete(permission.id);
		} else {
			next.add(permission.id);
		}
		grantedPermissionIds = next;
		toasts.success(
			isGranted
				? `«${copy.label}» retirado de ${roleName}.`
				: `«${copy.label}» concedido a ${roleName}.`,
		);
	}

	async function createRole() {
		const name = newRoleName.trim();
		if (!name) return;
		saving = true;
		try {
			const response = await apiFetch('/rbac/roles', {
				method: 'POST',
				body: JSON.stringify({ name }),
			});
			if (!response.ok) {
				toasts.error('No se pudo crear el rol.');
				return;
			}
			newRoleName = '';
			creating = false;
			await loadRoles();
			toasts.success(`Rol «${name}» creado. Ya puedes asignarle permisos.`);
		} finally {
			saving = false;
		}
	}

	$effect(() => {
		Promise.all([loadRoles(), loadPermissions()]).finally(() => {
			loading = false;
		});
	});
</script>

<PageHeader
	title="Roles y permisos"
	description="Un rol es un conjunto de permisos. A cada empleado se le asigna un rol por sucursal."
>
	{#snippet actions()}
		<Button variant="primary" icon="plus" onclick={() => (creating = true)}>Nuevo rol</Button>
	{/snippet}
</PageHeader>

{#if error}
	<p role="alert">{error}</p>
{:else if loading}
	<Skeleton lines={5} />
{:else}
	<div class="columns">
		<div class="col">
			<h2>Roles</h2>
			{#if roles.length === 0}
				<EmptyState
					icon="roles"
					title="Todavía no hay roles"
					description="Crea el primero para poder darle permisos y asignárselo a alguien."
				>
					{#snippet action()}
						<Button variant="primary" icon="plus" onclick={() => (creating = true)}>
							Nuevo rol
						</Button>
					{/snippet}
				</EmptyState>
			{:else}
				<DataList>
					{#each roles as role (role.id)}
						<DataListRow
							title={role.name}
							selected={role.id === selectedRoleId}
							onclick={() => selectRole(role.id)}
						>
							{#if role.id === selectedRoleId}
								<Badge tone="primary">
									{grantedPermissionIds.size} de {permissions.length} permisos
								</Badge>
							{/if}
						</DataListRow>
					{/each}
				</DataList>
			{/if}
		</div>

		<div class="col">
			<h2>Permisos</h2>
			{#if selectedRole === null}
				<EmptyState
					icon="lock"
					title="Selecciona un rol"
					description="Elige un rol de la izquierda para ver y cambiar lo que puede hacer."
				/>
			{:else}
				<p class="hint">
					Cada cambio se guarda al instante sobre <strong>{selectedRole.name}</strong>.
				</p>
				{#each groups as [groupName, entries] (groupName)}
					<fieldset class="group">
						<legend>{groupName}</legend>
						{#each entries as entry (entry.permission.id)}
							<label class="permission">
								<input
									type="checkbox"
									checked={grantedPermissionIds.has(entry.permission.id)}
									onchange={() => togglePermission(entry.permission)}
								/>
								<span class="permission-body">
									<span class="permission-label">
										{entry.copy.label}
										{#if entry.copy.pending}
											<Badge tone="neutral">Sin pantalla · {entry.copy.pending}</Badge>
										{/if}
									</span>
									<span class="permission-description">{entry.copy.description}</span>
								</span>
							</label>
						{/each}
					</fieldset>
				{/each}
			{/if}
		</div>
	</div>
{/if}

<Modal bind:open={creating} title="Nuevo rol" description="Los permisos se asignan después.">
	<Field
		label="Nombre del rol"
		bind:value={newRoleName}
		required
		placeholder="Mesero, Cajero, Supervisor…"
		hint="Como lo reconoce el personal del restaurante."
	/>
	{#snippet footer()}
		<Button variant="ghost" disabled={saving} onclick={() => (creating = false)}>Cancelar</Button>
		<Button variant="primary" loading={saving} onclick={createRole}>Crear rol</Button>
	{/snippet}
</Modal>

<style>
	.columns {
		display: grid;
		grid-template-columns: minmax(240px, 320px) 1fr;
		gap: var(--space-5);
		align-items: start;
	}

	.col {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
	}

	.hint {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.group {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		background: var(--color-surface);
	}

	legend {
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}

	.permission {
		display: flex;
		flex-direction: row;
		align-items: flex-start;
		gap: var(--space-3);
		min-height: var(--touch-min);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		cursor: pointer;
		color: var(--color-text);
	}

	.permission:hover {
		background: var(--color-surface-sunk);
	}

	.permission input {
		margin-top: 2px;
		width: 18px;
		height: 18px;
		flex-shrink: 0;
		accent-color: var(--color-primary);
	}

	.permission-body {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}

	.permission-label {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		font-weight: 600;
	}

	.permission-description {
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	@media (max-width: 900px) {
		.columns {
			grid-template-columns: 1fr;
		}
	}
</style>
