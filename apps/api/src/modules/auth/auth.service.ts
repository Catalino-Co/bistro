import argon2 from 'argon2';
import {
  countRecentFailedLoginAttempts,
  findUserByUsername,
  recordLoginAttempt,
  type UserRow,
} from './auth.repo.js';

const MAX_FAILED_ATTEMPTS = 6;
const LOCKOUT_WINDOW_MINUTES = 15;

export type LoginOutcome =
  { status: 'ok'; user: UserRow } | { status: 'invalid_credentials' } | { status: 'locked' };

export async function verifyCredentials(
  username: string,
  password: string,
  ipAddress: string | null,
): Promise<LoginOutcome> {
  const recentFailures = await countRecentFailedLoginAttempts(username, LOCKOUT_WINDOW_MINUTES);
  if (recentFailures >= MAX_FAILED_ATTEMPTS) {
    // Still logged: an attacker hammering a locked account should stay
    // locked out, not have the window quietly expire mid-attack.
    await recordLoginAttempt(username, false, ipAddress);
    return { status: 'locked' };
  }

  const user = await findUserByUsername(username);
  const passwordMatches = user && user.status === 'active' && (await verifyHash(user, password));

  if (!passwordMatches) {
    await recordLoginAttempt(username, false, ipAddress);
    return { status: 'invalid_credentials' };
  }

  await recordLoginAttempt(username, true, ipAddress);
  return { status: 'ok', user };
}

async function verifyHash(user: UserRow, password: string): Promise<boolean> {
  try {
    return await argon2.verify(user.passwordHash, password);
  } catch {
    // A hash in an unexpected format (e.g. a non-argon2 legacy hash) must be
    // rejected as invalid credentials, not surfaced as a server error.
    return false;
  }
}
