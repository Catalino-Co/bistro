<script lang="ts">
	import { apiFetch } from '$lib/api.js';

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
	let newRoleName = $state('');
	let error = $state<string | null>(null);
	let loading = $state(true);

	async function loadRoles() {
		const response = await apiFetch('/rbac/roles');
		if (!response.ok) {
			error = response.status === 403 ? 'No tienes permiso para administrar roles.' : 'Error al cargar roles.';
			return;
		}
		const body = (await response.json()) as { roles: Role[] };
		roles = body.roles;
	}

	async function loadPermissions() {
		const response = await apiFetch('/rbac/permissions');
		if (response.ok) {
			const body = (await response.json()) as { permissions: Permission[] };
			permissions = body.permissions;
		}
	}

	async function selectRole(roleId: number) {
		selectedRoleId = roleId;
		const response = await apiFetch(`/rbac/roles/${roleId}/permissions`);
		if (response.ok) {
			const body = (await response.json()) as { permissionIds: number[] };
			grantedPermissionIds = new Set(body.permissionIds);
		}
	}

	async function togglePermission(permissionId: number) {
		if (selectedRoleId === null) return;
		const isGranted = grantedPermissionIds.has(permissionId);
		const response = await apiFetch(
			isGranted
				? `/rbac/roles/${selectedRoleId}/permissions/${permissionId}`
				: `/rbac/roles/${selectedRoleId}/permissions`,
			{
				method: isGranted ? 'DELETE' : 'POST',
				...(isGranted ? {} : { body: JSON.stringify({ permissionId }) }),
			},
		);
		if (response.ok || response.status === 204) {
			const next = new Set(grantedPermissionIds);
			if (isGranted) {
				next.delete(permissionId);
			} else {
				next.add(permissionId);
			}
			grantedPermissionIds = next;
		}
	}

	async function createRole(event: SubmitEvent) {
		event.preventDefault();
		if (!newRoleName.trim()) return;
		const response = await apiFetch('/rbac/roles', {
			method: 'POST',
			body: JSON.stringify({ name: newRoleName.trim() }),
		});
		if (response.ok) {
			newRoleName = '';
			await loadRoles();
		}
	}

	$effect(() => {
		Promise.all([loadRoles(), loadPermissions()]).finally(() => {
			loading = false;
		});
	});
</script>

<div class="page">
	<h1>Roles y permisos</h1>

	{#if error}
		<p role="alert">{error}</p>
	{:else if loading}
		<p>Cargando…</p>
	{:else}
		<section>
			<h2>Roles</h2>
			<ul>
				{#each roles as role (role.id)}
					<li>
						<button onclick={() => selectRole(role.id)}>{role.name}</button>
					</li>
				{/each}
			</ul>
			<form onsubmit={createRole}>
				<label>
					Nuevo rol
					<input type="text" bind:value={newRoleName} required />
				</label>
				<button type="submit">Crear</button>
			</form>
		</section>

		{#if selectedRoleId !== null}
			<section>
				<h2>Permisos</h2>
				<ul>
					{#each permissions as permission (permission.id)}
						<li>
							<label>
								<input
									type="checkbox"
									checked={grantedPermissionIds.has(permission.id)}
									onchange={() => togglePermission(permission.id)}
								/>
								{permission.key}
							</label>
						</li>
					{/each}
				</ul>
			</section>
		{/if}
	{/if}
</div>
