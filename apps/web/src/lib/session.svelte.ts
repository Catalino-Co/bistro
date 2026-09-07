import { apiFetch, ensureCsrfCookie } from './api.js';

export interface SessionUser {
  id: number;
  username: string;
  fullName: string;
  branchId: number | null;
}

export interface BranchOption {
  id: number;
  name: string;
  businessUnitName: string;
  companyName: string;
}

let user = $state<SessionUser | null>(null);
let branches = $state<BranchOption[]>([]);
let loaded = $state(false);

async function refreshUser(): Promise<void> {
  const response = await apiFetch('/auth/me');
  user = response.ok ? ((await response.json()) as SessionUser) : null;
  loaded = true;
}

async function refreshBranches(): Promise<void> {
  if (!user) {
    branches = [];
    return;
  }
  const response = await apiFetch('/branches/mine');
  const body = response.ok ? ((await response.json()) as { branches: BranchOption[] }) : null;
  branches = body?.branches ?? [];
}

export const session = {
  get user() {
    return user;
  },
  get branches() {
    return branches;
  },
  get loaded() {
    return loaded;
  },
  get currentBranch(): BranchOption | null {
    return branches.find((b) => b.id === user?.branchId) ?? null;
  },
  async load(): Promise<void> {
    await ensureCsrfCookie();
    await refreshUser();
    await refreshBranches();
  },
  async login(
    username: string,
    password: string,
  ): Promise<{ ok: true } | { ok: false; error: string }> {
    await ensureCsrfCookie();
    const response = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      return { ok: false, error: body?.error ?? 'unknown_error' };
    }
    await refreshUser();
    await refreshBranches();
    return { ok: true };
  },
  async logout(): Promise<void> {
    await apiFetch('/auth/logout', { method: 'POST' });
    user = null;
    branches = [];
  },
  async selectBranch(branchId: number): Promise<boolean> {
    const response = await apiFetch('/branches/select', {
      method: 'POST',
      body: JSON.stringify({ branchId }),
    });
    if (!response.ok) {
      return false;
    }
    await refreshUser();
    return true;
  },
};
