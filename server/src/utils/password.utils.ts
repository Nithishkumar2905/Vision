/**
 * ACCESSPREP-X — Password Hashing & Verification Utilities
 */

import crypto from 'crypto';

const PASSWORD_SALT = 'accessprep_x_salt_2026';

export function hashPassword(pwd: string): string {
  return crypto
    .createHash('sha256')
    .update(pwd + PASSWORD_SALT)
    .digest('hex');
}

export function isHashedPassword(pwd: string): boolean {
  return /^[a-f0-9]{64}$/.test(pwd);
}

export function verifyUserPassword(storedHash: string, candidatePassword: string): boolean {
  if (isHashedPassword(storedHash)) {
    return storedHash === hashPassword(candidatePassword);
  }
  return storedHash === candidatePassword;
}
