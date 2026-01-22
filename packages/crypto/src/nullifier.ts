import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { randomBytes } from 'crypto';

/**
 * Generates a cryptographic nullifier for anonymous voting.
 * The nullifier is a hash of the poll ID and user's secret salt.
 * This ensures:
 * 1. One vote per user per poll (nullifier is unique)
 * 2. Vote cannot be linked to user identity
 * 3. User can prove they haven't voted twice
 *
 * @param pollId - The unique identifier of the poll
 * @param userSecretSalt - The user's secret salt (must be kept secure)
 * @returns A hex-encoded SHA-256 hash
 */
export function generateNullifier(pollId: string, userSecretSalt: string): string {
  const data = `${pollId}:${userSecretSalt}`;
  const hash = sha256(new TextEncoder().encode(data));
  return bytesToHex(hash);
}

/**
 * Generates a random secret salt for a new user.
 * This salt should be stored encrypted in the database and never exposed.
 *
 * @returns A hex-encoded random 32-byte salt
 */
export function generateSecretSalt(): string {
  const salt = randomBytes(32);
  return salt.toString('hex');
}

/**
 * Verifies that a nullifier matches the expected value.
 * Used to confirm a user's vote without revealing their identity.
 *
 * @param pollId - The poll identifier
 * @param userSecretSalt - The user's secret salt
 * @param nullifier - The nullifier to verify
 * @returns True if the nullifier is valid
 */
export function verifyNullifier(
  pollId: string,
  userSecretSalt: string,
  nullifier: string
): boolean {
  const expectedNullifier = generateNullifier(pollId, userSecretSalt);
  return expectedNullifier === nullifier;
}

/**
 * Generates a hash of data for integrity verification.
 * Used in the audit trail hash chain.
 *
 * @param data - The data to hash (will be JSON stringified)
 * @returns A hex-encoded SHA-256 hash
 */
export function generateHash(data: any): string {
  const jsonString = typeof data === 'string' ? data : JSON.stringify(data);
  const hash = sha256(new TextEncoder().encode(jsonString));
  return bytesToHex(hash);
}

/**
 * Generates a hash chain link by combining the current payload hash
 * with the previous event hash.
 *
 * @param payloadHash - Hash of the current event payload
 * @param previousEventHash - Hash of the previous event (or null for first event)
 * @returns The combined hash for the chain
 */
export function generateChainHash(payloadHash: string, previousEventHash: string | null): string {
  const data = previousEventHash ? `${previousEventHash}:${payloadHash}` : payloadHash;
  const hash = sha256(new TextEncoder().encode(data));
  return bytesToHex(hash);
}

/**
 * Verifies the integrity of a hash chain.
 *
 * @param events - Array of events with payload_hash and previous_event_hash
 * @returns True if the chain is valid
 */
export function verifyHashChain(
  events: Array<{ payload_hash: string; previous_event_hash: string | null }>
): boolean {
  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const previousEvent = i > 0 ? events[i - 1] : null;

    if (i === 0) {
      // First event should have no previous hash
      if (event.previous_event_hash !== null) {
        return false;
      }
    } else {
      // Subsequent events should reference the previous event
      const expectedPrevious = generateChainHash(
        previousEvent!.payload_hash,
        previousEvent!.previous_event_hash
      );

      if (event.previous_event_hash !== expectedPrevious) {
        return false;
      }
    }
  }

  return true;
}
