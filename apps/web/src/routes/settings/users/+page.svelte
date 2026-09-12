<script lang="ts">
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
	import { ACTIVE_STATUS, statusLabel } from '$lib/status.js';
	import { toasts } from '$lib/toasts.svelte.js';

	interface RoleAssignment {
		roleId: number;
		roleName: string;
		branchId: number;
		branchName: string;
	}
	interface User {
		id: number;
		username: string;
		fullName: string;
		status: string;
		createdAt: string;
		roles: RoleAssignment[];
	}
	interface Role {
		id: number;
		name: string;
	}
	interface Branch {
		id: number;
		name: string;
		status: string;
	}

	let users = $state<User[]>([]);
	let roles = $state<Role[]>([]);
	let branches = $state<Branch[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	let creating = $state(false);
	let newUsername = $state('');
	let newFullName = $state('');
	let newPassword = $state('');
	let saving = $state(false);

	let editingUser = $state<User | null>(null);
	let editFullName = $state('');
	let savingEdit = $state(false);

	let rolesForUser = $state<User | null>(null);
	let roleToAssign = $state<number | null>(null);
	let branchToAssign = $state<number | null>(null);
	let assigning = $state(false);

	let passwordForUser = $state<User | null>(null);
	let resetPassword = $state('');
	let resettingPassword = $state(false);

	let userToToggle = $state<User | null>(null);

	async function loadUsers() {
		const response = await apiFetch('/users');
		if (!response.ok) {
			error =
				response.status === 403
					? 'No tienes permiso para administrar usuarios.'
					: 'No se pudieron cargar los usuarios.';
			return;
		}
		users = ((await response.json()) as { users: User[] }).users;
	}

	async function loadRoles() {
		const response = await apiFetch('/rbac/roles');
		if (response.ok) {
			roles = ((await response.json()) as { roles: Role[] }).roles;
			if (roleToAssign === null && roles.length > 0) roleToAssign = roles[0]!.id;
		}
	}

	async function loadBranches() {
		const response = await apiFetch('/org/branches');
		if (response.ok) {
			branches = ((await response.json()) as { branches: Branch[] }).branches;
			if (branchToAssign === null && branches.length > 0) branchToAssign = branches[0]!.id;
		}
	}

	function startCreate() {
		newUsername = '';
		newFullName = '';
		newPassword = '';
		creating = true;
	}

	async function createUser() {
		const username = newUsername.trim().toLowerCase();
		const fullName = newFullName.trim();
		if (!username || !fullName || newPassword.length < 10) return;

		saving = true;
		try {
			const response = await apiFetch('/users', {
				method: 'POST',
				body: JSON.stringify({ username, fullName, password: newPassword }),
			});
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo crear el empleado.'));
				return;
			}
			creating = false;
			newPassword = '';
			await loadUsers();
			toasts.success(`${fullName} creado. Asígnale un rol para que pueda entrar a trabajar.`);
		} finally {
			saving = false;
		}
	}

	function startEdit(user: User) {
		editingUser = user;
		editFullName = user.fullName;
	}

	async function saveEdit() {
		const user = editingUser;
		const fullName = editFullName.trim();
		if (!user || !fullName) return;
		savingEdit = true;
		try {
			const response = await apiFetch(`/users/${user.id}`, {
				method: 'PATCH',
				body: JSON.stringify({ fullName }),
			});
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo guardar el empleado.'));
				return;
			}
			editingUser = null;
			await loadUsers();
			toasts.success('Empleado actualizado.');
		} finally {
			savingEdit = false;
		}
	}

	async function toggleStatus() {
		const user = userToToggle;
		if (!user) return;
		const next = user.status === 'active' ? 'inactive' : 'active';
		const response = await apiFetch(`/users/${user.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ status: next }),
		});
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo cambiar el estado.'));
			return;
		}
		await loadUsers();
		toasts.success(
			next === 'inactive'
				? `${user.fullName} queda inactivo y no podrá entrar.`
				: `${user.fullName} vuelve a estar activo.`,
		);
	}

	async function assignRole() {
		const user = rolesForUser;
		if (!user || roleToAssign === null || branchToAssign === null) return;
		assigning = true;
		try {
			const response = await apiFetch(`/users/${user.id}/roles`, {
				method: 'POST',
				body: JSON.stringify({ roleId: roleToAssign, branchId: branchToAssign }),
			});
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo asignar el rol.'));
				return;
			}
			await loadUsers();
			rolesForUser = users.find((u) => u.id === user.id) ?? null;
			toasts.success('Rol asignado.');
		} finally {
			assigning = false;
		}
	}

	async function revokeRole(user: User, assignment: RoleAssignment) {
		const response = await apiFetch(
			`/users/${user.id}/roles/${assignment.roleId}/branches/${assignment.branchId}`,
			{ method: 'DELETE' },
		);
		if (!response.ok) {
			toasts.error(await apiErrorMessage(response, 'No se pudo retirar el rol.'));
			return;
		}
		await loadUsers();
		rolesForUser = users.find((u) => u.id === user.id) ?? null;
		toasts.success(`«${assignment.roleName}» retirado en ${assignment.branchName}.`);
	}

	function startPasswordReset(user: User) {
		passwordForUser = user;
		resetPassword = '';
	}

	async function submitPasswordReset() {
		const user = passwordForUser;
		if (!user || resetPassword.length < 10) return;
		resettingPassword = true;
		try {
			const response = await apiFetch(`/users/${user.id}/password`, {
				method: 'POST',
				body: JSON.stringify({ password: resetPassword }),
			});
			if (!response.ok) {
				toasts.error(await apiErrorMessage(response, 'No se pudo cambiar la contraseña.'));
				return;
			}
			passwordForUser = null;
			resetPassword = '';
			toasts.success(`Contraseña de ${user.fullName} cambiada.`);
		} finally {
			resettingPassword = false;
		}
	}

	$effect(() => {
		Promise.all([loadUsers(), loadRoles(), loadBranches()]).finally(() => {
			loading = false;
		});
	});
</script>

<PageHeader
	title="Usuarios"
	description="Cada empleado entra con su propio usuario. Los permisos no se dan al empleado: se dan a un rol, y el rol se asigna por sucursal."
>
	{#snippet actions()}
		<Button variant="primary" icon="plus" onclick={startCreate}>Nuevo empleado</Button>
	{/snippet}
</PageHeader>

{#if error}
	<p role="alert">{error}</p>
{:else if loading}
	<Skeleton lines={4} />
{:else if users.length === 0}
	<EmptyState
		icon="user"
		title="No hay empleados"
		description="Crea el primero para que pueda entrar al sistema."
	>
		{#snippet action()}
			<Button variant="primary" icon="plus" onclick={startCreate}>Nuevo empleado</Button>
		{/snippet}
	</EmptyState>
{:else}
	<DataList>
		{#each users as user (user.id)}
			{@const status = statusLabel(ACTIVE_STATUS, user.status)}
			<DataListRow title={user.fullName} meta={'@' + user.username}>
				<Badge tone={status.tone}>{status.label}</Badge>
				{#if user.roles.length === 0}
					<Badge tone="warning">Sin rol asignado</Badge>
				{:else}
					{#each user.roles as assignment (assignment.roleId + '-' + assignment.branchId)}
						<Badge tone="neutral">{assignment.roleName} · {assignment.branchName}</Badge>
					{/each}
				{/if}

				{#snippet actions()}
					<Button size="sm" variant="secondary" onclick={() => (rolesForUser = user)}>
						Roles
					</Button>
					<Button size="sm" variant="ghost" onclick={() => startPasswordReset(user)}>
						Contraseña
					</Button>
					<Button
						size="sm"
						variant="ghost"
						icon="edit"
						aria-label="Editar {user.fullName}"
						onclick={() => startEdit(user)}
					/>
					<Button
						size="sm"
						variant={user.status === 'active' ? 'danger' : 'secondary'}
						onclick={() => (userToToggle = user)}
					>
						{user.status === 'active' ? 'Desactivar' : 'Activar'}
					</Button>
				{/snippet}
			</DataListRow>
		{/each}
	</DataList>
{/if}

<Modal bind:open={creating} title="Nuevo empleado">
	<Field
		label="Usuario"
		bind:value={newUsername}
		required
		placeholder="jperez"
		hint="Con lo que inicia sesión. Minúsculas, números, punto, guion y guion bajo."
	/>
	<Field label="Nombre completo" bind:value={newFullName} required placeholder="Juan Pérez" />
	<Field
		label="Contraseña inicial"
		type="password"
		bind:value={newPassword}
		required
		hint="Diez caracteres o más. El empleado debería cambiarla al entrar."
		error={newPassword.length > 0 && newPassword.length < 10 ? 'Muy corta.' : undefined}
	/>
	{#snippet footer()}
		<Button variant="ghost" disabled={saving} onclick={() => (creating = false)}>Cancelar</Button>
		<Button variant="primary" loading={saving} onclick={createUser}>Crear empleado</Button>
	{/snippet}
</Modal>

<Modal
	open={editingUser !== null}
	title="Editar empleado"
	description={editingUser ? '@' + editingUser.username : ''}
	size="sm"
	onclose={() => (editingUser = null)}
>
	<Field label="Nombre completo" bind:value={editFullName} required />
	{#snippet footer()}
		<Button variant="ghost" disabled={savingEdit} onclick={() => (editingUser = null)}>
			Cancelar
		</Button>
		<Button variant="primary" loading={savingEdit} onclick={saveEdit}>Guardar</Button>
	{/snippet}
</Modal>

<Modal
	open={rolesForUser !== null}
	title="Roles por sucursal"
	description={rolesForUser?.fullName}
	onclose={() => (rolesForUser = null)}
>
	{#if rolesForUser}
		{#if rolesForUser.roles.length === 0}
			<p class="muted">
				Este empleado todavía no tiene ningún rol, así que no puede hacer nada en el sistema.
			</p>
		{:else}
			<DataList>
				{#each rolesForUser.roles as assignment (assignment.roleId + '-' + assignment.branchId)}
					<DataListRow title={assignment.roleName} meta={assignment.branchName}>
						{#snippet actions()}
							<Button
								size="sm"
								variant="danger"
								icon="close"
								aria-label="Retirar {assignment.roleName} en {assignment.branchName}"
								onclick={() => revokeRole(rolesForUser!, assignment)}
							/>
						{/snippet}
					</DataListRow>
				{/each}
			</DataList>
		{/if}

		<fieldset class="assign">
			<legend>Asignar un rol</legend>
			<Field label="Rol">
				{#snippet control({ id })}
					<select {id} bind:value={roleToAssign}>
						{#each roles as role (role.id)}
							<option value={role.id}>{role.name}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			<Field label="Sucursal">
				{#snippet control({ id })}
					<select {id} bind:value={branchToAssign}>
						{#each branches as branch (branch.id)}
							<option value={branch.id}>{branch.name}</option>
						{/each}
					</select>
				{/snippet}
			</Field>
			<Button variant="secondary" icon="plus" loading={assigning} onclick={assignRole}>
				Asignar
			</Button>
		</fieldset>
	{/if}

	{#snippet footer()}
		<Button variant="primary" onclick={() => (rolesForUser = null)}>Listo</Button>
	{/snippet}
</Modal>

<Modal
	open={passwordForUser !== null}
	title="Cambiar contraseña"
	description={passwordForUser?.fullName}
	size="sm"
	onclose={() => (passwordForUser = null)}
>
	<Field
		label="Nueva contraseña"
		type="password"
		bind:value={resetPassword}
		required
		hint="Diez caracteres o más. Comunícasela al empleado por un canal aparte."
		error={resetPassword.length > 0 && resetPassword.length < 10 ? 'Muy corta.' : undefined}
	/>
	{#snippet footer()}
		<Button
			variant="ghost"
			disabled={resettingPassword}
			onclick={() => (passwordForUser = null)}
		>
			Cancelar
		</Button>
		<Button variant="primary" loading={resettingPassword} onclick={submitPasswordReset}>
			Cambiar contraseña
		</Button>
	{/snippet}
</Modal>

<ConfirmDialog
	open={userToToggle !== null}
	title={userToToggle?.status === 'active' ? '¿Desactivar al empleado?' : '¿Activar al empleado?'}
	message={userToToggle?.status === 'active'
		? `${userToToggle?.fullName ?? ''} dejará de poder iniciar sesión. Su historial de órdenes se conserva.`
		: `${userToToggle?.fullName ?? ''} volverá a poder iniciar sesión con sus roles actuales.`}
	confirmLabel={userToToggle?.status === 'active' ? 'Desactivar' : 'Activar'}
	tone={userToToggle?.status === 'active' ? 'danger' : 'primary'}
	onconfirm={toggleStatus}
	onclose={() => (userToToggle = null)}
/>

<style>
	.muted {
		margin: 0;
		font-size: var(--text-sm);
		color: var(--color-text-muted);
	}

	.assign {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		gap: var(--space-3);
	}

	.assign :global(.field) {
		flex: 1;
		min-width: 160px;
	}

	legend {
		padding: 0 var(--space-2);
		font-size: var(--text-xs);
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--color-text-muted);
	}
</style>
