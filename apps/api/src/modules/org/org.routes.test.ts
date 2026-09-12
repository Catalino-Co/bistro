import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../app.js';
import { cookieValue, findCookiePair, mergeCookies } from '../../test-support/http.js';
import { closeTestDbPool, createTestUser, deleteTestUser } from '../auth/test-helpers.repo.js';
import {
  assignRole,
  createBranchFixture,
  deleteBranchFixture,
  type BranchFixture,
} from '../branches/branches.test-helpers.repo.js';
import { deleteOrgFixtures } from './org.test-helpers.repo.js';

const USERNAME = '__org_test_user__';
const PASSWORD = 'CorrectHorseBatteryStaple1!';

describe('org administration', () => {
  const app = buildApp();
  let branch: BranchFixture;
  let cookie: string;
  let csrfToken: string;
  let companyId: number;
  let businessUnitId: number;
  let createdBranchId: number | null = null;

  beforeAll(async () => {
    const userId = await createTestUser(USERNAME, PASSWORD);
    branch = await createBranchFixture('org');
    await assignRole(userId, 'admin', branch.branchId);

    const primed = await app.inject({ method: 'GET', url: '/health' });
    const sessionCookie = findCookiePair(primed.headers['set-cookie'], 'sessionId');
    const csrfCookie = findCookiePair(primed.headers['set-cookie'], 'csrf');
    csrfToken = cookieValue(csrfCookie);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { cookie: mergeCookies(sessionCookie, csrfCookie), 'x-csrf-token': csrfToken },
      payload: { username: USERNAME, password: PASSWORD },
    });
    cookie = mergeCookies(findCookiePair(login.headers['set-cookie'], 'sessionId'), csrfCookie);
  });

  afterAll(async () => {
    await deleteOrgFixtures({
      branchIds: createdBranchId === null ? [] : [createdBranchId],
      businessUnitIds: businessUnitId ? [businessUnitId] : [],
      companyIds: companyId ? [companyId] : [],
    });
    await deleteBranchFixture(branch);
    await deleteTestUser(USERNAME);
    await app.close();
    await closeTestDbPool();
  });

  it('creates the company -> business unit -> branch chain', async () => {
    const company = await app.inject({
      method: 'POST',
      url: '/org/companies',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__org_test_company__', taxId: '131-00000-1' },
    });
    expect(company.statusCode).toBe(201);
    companyId = (company.json() as { company: { id: number } }).company.id;

    const unit = await app.inject({
      method: 'POST',
      url: '/org/business-units',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { companyId, name: '__org_test_unit__' },
    });
    expect(unit.statusCode).toBe(201);
    businessUnitId = (unit.json() as { businessUnit: { id: number } }).businessUnit.id;

    const created = await app.inject({
      method: 'POST',
      url: '/org/branches',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { businessUnitId, name: '__org_test_branch__' },
    });
    expect(created.statusCode).toBe(201);
    const branchBody = (
      created.json() as {
        branch: { id: number; timezone: string; status: string };
      }
    ).branch;
    createdBranchId = branchBody.id;
    // Zona horaria por defecto: el sistema es para República Dominicana.
    expect(branchBody.timezone).toBe('America/Santo_Domingo');
    expect(branchBody.status).toBe('active');

    const listed = await app.inject({
      method: 'GET',
      url: `/org/branches?businessUnitId=${businessUnitId}`,
      headers: { cookie },
    });
    const names = (listed.json() as { branches: { name: string }[] }).branches.map((b) => b.name);
    expect(names).toEqual(['__org_test_branch__']);
  });

  it('refuses a business unit under a company that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/org/business-units',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { companyId: 99_999_999, name: '__org_test_orphan__' },
    });
    expect(response.statusCode).toBe(404);
    expect((response.json() as { error: string }).error).toBe('company_not_found');
  });

  it('renames a branch and takes it out of service', async () => {
    const renamed = await app.inject({
      method: 'PATCH',
      url: `/org/branches/${createdBranchId}`,
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: '__org_test_branch_renamed__', status: 'inactive' },
    });
    expect(renamed.statusCode).toBe(204);

    const listed = await app.inject({
      method: 'GET',
      url: `/org/branches?businessUnitId=${businessUnitId}`,
      headers: { cookie },
    });
    expect(
      (listed.json() as { branches: { name: string; status: string }[] }).branches[0],
    ).toMatchObject({ name: '__org_test_branch_renamed__', status: 'inactive' });

    const missing = await app.inject({
      method: 'PATCH',
      url: '/org/branches/99999999',
      headers: { cookie, 'x-csrf-token': csrfToken },
      payload: { name: 'da igual' },
    });
    expect(missing.statusCode).toBe(404);
  });
});
