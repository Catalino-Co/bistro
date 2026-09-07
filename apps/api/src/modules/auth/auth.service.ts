import argon2 from 'argon2';
import { findUserByUsername, type UserRow } from './auth.repo.js';

export async function verifyCredentials(
  username: string,
  password: string,
): Promise<UserRow | null> {
  const user = await findUserByUsername(username);
  if (!user || user.status !== 'active') {
    return null;
  }

  try {
    const passwordMatches = await argon2.verify(user.passwordHash, password);
    return passwordMatches ? user : null;
  } catch {
    // A hash in an unexpected format (e.g. a non-argon2 legacy hash) must be
    // rejected as invalid credentials, not surfaced as a server error.
    return null;
  }
}
