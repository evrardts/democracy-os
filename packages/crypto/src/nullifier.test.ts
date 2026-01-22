import {
  generateNullifier,
  generateSecretSalt,
  verifyNullifier,
  generateHash,
  generateChainHash,
  verifyHashChain,
} from './nullifier';

describe('Nullifier System', () => {
  describe('generateSecretSalt', () => {
    it('should generate a 64-character hex string', () => {
      const salt = generateSecretSalt();
      expect(salt).toHaveLength(64);
      expect(salt).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate unique salts', () => {
      const salt1 = generateSecretSalt();
      const salt2 = generateSecretSalt();
      expect(salt1).not.toEqual(salt2);
    });
  });

  describe('generateNullifier', () => {
    const pollId = 'poll-123';
    const userSalt = 'abc123';

    it('should generate a 64-character hex string', () => {
      const nullifier = generateNullifier(pollId, userSalt);
      expect(nullifier).toHaveLength(64);
      expect(nullifier).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate the same nullifier for same inputs', () => {
      const nullifier1 = generateNullifier(pollId, userSalt);
      const nullifier2 = generateNullifier(pollId, userSalt);
      expect(nullifier1).toEqual(nullifier2);
    });

    it('should generate different nullifiers for different polls', () => {
      const nullifier1 = generateNullifier('poll-1', userSalt);
      const nullifier2 = generateNullifier('poll-2', userSalt);
      expect(nullifier1).not.toEqual(nullifier2);
    });

    it('should generate different nullifiers for different users', () => {
      const nullifier1 = generateNullifier(pollId, 'salt-1');
      const nullifier2 = generateNullifier(pollId, 'salt-2');
      expect(nullifier1).not.toEqual(nullifier2);
    });

    it('should be deterministic', () => {
      const nullifiers = Array.from({ length: 10 }, () =>
        generateNullifier(pollId, userSalt)
      );
      const uniqueNullifiers = new Set(nullifiers);
      expect(uniqueNullifiers.size).toBe(1);
    });
  });

  describe('verifyNullifier', () => {
    const pollId = 'poll-123';
    const userSalt = 'abc123';

    it('should verify a valid nullifier', () => {
      const nullifier = generateNullifier(pollId, userSalt);
      const isValid = verifyNullifier(pollId, userSalt, nullifier);
      expect(isValid).toBe(true);
    });

    it('should reject an invalid nullifier', () => {
      const nullifier = generateNullifier(pollId, userSalt);
      const isValid = verifyNullifier(pollId, 'wrong-salt', nullifier);
      expect(isValid).toBe(false);
    });

    it('should reject nullifier from different poll', () => {
      const nullifier = generateNullifier('poll-1', userSalt);
      const isValid = verifyNullifier('poll-2', userSalt, nullifier);
      expect(isValid).toBe(false);
    });
  });

  describe('generateHash', () => {
    it('should generate consistent hash for same data', () => {
      const data = { id: 1, value: 'test' };
      const hash1 = generateHash(data);
      const hash2 = generateHash(data);
      expect(hash1).toEqual(hash2);
    });

    it('should generate different hashes for different data', () => {
      const hash1 = generateHash({ value: 'test1' });
      const hash2 = generateHash({ value: 'test2' });
      expect(hash1).not.toEqual(hash2);
    });

    it('should handle string input', () => {
      const hash = generateHash('test string');
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should handle object input', () => {
      const hash = generateHash({ key: 'value', nested: { data: true } });
      expect(hash).toHaveLength(64);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('generateChainHash', () => {
    it('should generate hash for first event (no previous)', () => {
      const payloadHash = 'abc123';
      const chainHash = generateChainHash(payloadHash, null);
      expect(chainHash).toHaveLength(64);
      expect(chainHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate hash linking to previous event', () => {
      const payloadHash = 'abc123';
      const previousHash = 'def456';
      const chainHash = generateChainHash(payloadHash, previousHash);
      expect(chainHash).toHaveLength(64);
      expect(chainHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate different hashes with/without previous', () => {
      const payloadHash = 'abc123';
      const hash1 = generateChainHash(payloadHash, null);
      const hash2 = generateChainHash(payloadHash, 'previous');
      expect(hash1).not.toEqual(hash2);
    });

    it('should be deterministic', () => {
      const payloadHash = 'abc123';
      const previousHash = 'def456';
      const hash1 = generateChainHash(payloadHash, previousHash);
      const hash2 = generateChainHash(payloadHash, previousHash);
      expect(hash1).toEqual(hash2);
    });
  });

  describe('verifyHashChain', () => {
    it('should verify a valid single-event chain', () => {
      const events = [
        {
          payload_hash: generateHash({ id: 1, data: 'test' }),
          previous_event_hash: null,
        },
      ];
      const isValid = verifyHashChain(events);
      expect(isValid).toBe(true);
    });

    it('should verify a valid multi-event chain', () => {
      const event1 = {
        payload_hash: generateHash({ id: 1 }),
        previous_event_hash: null,
      };

      const event2 = {
        payload_hash: generateHash({ id: 2 }),
        previous_event_hash: generateChainHash(event1.payload_hash, event1.previous_event_hash),
      };

      const event3 = {
        payload_hash: generateHash({ id: 3 }),
        previous_event_hash: generateChainHash(event2.payload_hash, event2.previous_event_hash),
      };

      const isValid = verifyHashChain([event1, event2, event3]);
      expect(isValid).toBe(true);
    });

    it('should reject chain with first event having previous hash', () => {
      const events = [
        {
          payload_hash: generateHash({ id: 1 }),
          previous_event_hash: 'should-be-null',
        },
      ];
      const isValid = verifyHashChain(events);
      expect(isValid).toBe(false);
    });

    it('should reject chain with broken link', () => {
      const event1 = {
        payload_hash: generateHash({ id: 1 }),
        previous_event_hash: null,
      };

      const event2 = {
        payload_hash: generateHash({ id: 2 }),
        previous_event_hash: 'wrong-hash', // Should link to event1
      };

      const isValid = verifyHashChain([event1, event2]);
      expect(isValid).toBe(false);
    });

    it('should reject chain with tampered event', () => {
      const event1 = {
        payload_hash: generateHash({ id: 1 }),
        previous_event_hash: null,
      };

      const event2 = {
        payload_hash: generateHash({ id: 2 }),
        previous_event_hash: generateChainHash(event1.payload_hash, event1.previous_event_hash),
      };

      // Tamper with event1 payload
      event1.payload_hash = generateHash({ id: 1, tampered: true });

      const isValid = verifyHashChain([event1, event2]);
      expect(isValid).toBe(false);
    });

    it('should handle empty chain', () => {
      const isValid = verifyHashChain([]);
      expect(isValid).toBe(true);
    });
  });

  describe('Security Properties', () => {
    it('should ensure vote privacy - nullifiers are unlinkable', () => {
      const user1Salt = generateSecretSalt();
      const user2Salt = generateSecretSalt();
      const pollId = 'poll-123';

      const nullifier1 = generateNullifier(pollId, user1Salt);
      const nullifier2 = generateNullifier(pollId, user2Salt);

      // Nullifiers should not reveal any relationship
      expect(nullifier1).not.toEqual(nullifier2);
      // Without the salt, you cannot determine which user created which nullifier
    });

    it('should prevent double voting - same user/poll = same nullifier', () => {
      const userSalt = generateSecretSalt();
      const pollId = 'poll-123';

      const nullifier1 = generateNullifier(pollId, userSalt);
      const nullifier2 = generateNullifier(pollId, userSalt);

      // Same nullifier = database constraint prevents duplicate votes
      expect(nullifier1).toEqual(nullifier2);
    });

    it('should allow cross-poll participation - different nullifiers per poll', () => {
      const userSalt = generateSecretSalt();
      const poll1 = 'poll-1';
      const poll2 = 'poll-2';

      const nullifier1 = generateNullifier(poll1, userSalt);
      const nullifier2 = generateNullifier(poll2, userSalt);

      // User can vote in multiple polls with different nullifiers
      expect(nullifier1).not.toEqual(nullifier2);
    });

    it('should maintain audit trail integrity through hash chain', () => {
      // Simulate audit events
      const events: Array<{ payload_hash: string; previous_event_hash: string | null }> = [];

      for (let i = 1; i <= 5; i++) {
        const payload = { eventId: i, action: 'vote', timestamp: Date.now() };
        const payloadHash = generateHash(payload);
        const previousHash =
          events.length > 0
            ? generateChainHash(
                events[events.length - 1].payload_hash,
                events[events.length - 1].previous_event_hash
              )
            : null;

        events.push({
          payload_hash: payloadHash,
          previous_event_hash: previousHash,
        });
      }

      // Chain should be valid
      expect(verifyHashChain(events)).toBe(true);

      // Any tampering should be detected
      const originalHash = events[2].payload_hash;
      events[2].payload_hash = generateHash({ tampered: true });
      expect(verifyHashChain(events)).toBe(false);

      // Restore and verify again
      events[2].payload_hash = originalHash;
      expect(verifyHashChain(events)).toBe(true);
    });
  });
});
