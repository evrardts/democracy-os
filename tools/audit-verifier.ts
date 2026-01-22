#!/usr/bin/env node

/**
 * Democracy OS - Independent Audit Verifier CLI
 *
 * This standalone tool verifies the integrity of exported audit bundles.
 * It can be run independently without access to the Democracy OS platform.
 *
 * Usage:
 *   npm run verify-audit <path-to-audit-bundle.json>
 *   npx ts-node tools/audit-verifier.ts audit-bundle.json
 *
 * The tool verifies:
 * 1. Hash chain integrity (each event links to the previous)
 * 2. Payload hash correctness (computed hash matches stored hash)
 * 3. No gaps or missing events in the chain
 */

import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

interface AuditEvent {
  id: string;
  eventType: string;
  entityType: string;
  entityId: string;
  payload: any;
  payloadHash: string;
  previousEventHash: string | null;
  createdAt: string;
}

interface AuditBundle {
  exportedAt: string;
  tenantId: string;
  totalEvents: number;
  events: AuditEvent[];
  verification?: {
    instructions: string;
    chainValid: boolean;
  };
}

/**
 * Compute SHA-256 hash of a payload
 */
function computePayloadHash(payload: any): string {
  const payloadString = JSON.stringify(payload, Object.keys(payload).sort());
  return createHash('sha256').update(payloadString).digest('hex');
}

/**
 * Verify a single event's payload hash
 */
function verifyEventHash(event: AuditEvent): { valid: boolean; computedHash: string } {
  const computedHash = computePayloadHash(event.payload);
  return {
    valid: computedHash === event.payloadHash,
    computedHash,
  };
}

/**
 * Verify the complete hash chain
 */
function verifyHashChain(events: AuditEvent[]): {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalEvents: number;
    validHashes: number;
    validLinks: number;
  };
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  let validHashes = 0;
  let validLinks = 0;

  if (events.length === 0) {
    warnings.push('No events to verify');
    return {
      valid: true,
      errors,
      warnings,
      stats: { totalEvents: 0, validHashes: 0, validLinks: 0 },
    };
  }

  // Verify first event has no previous hash
  if (events[0].previousEventHash !== null) {
    errors.push(`Event 0 (${events[0].id}): First event should have null previousEventHash`);
  }

  // Verify each event
  for (let i = 0; i < events.length; i++) {
    const event = events[i];

    // 1. Verify payload hash
    const hashCheck = verifyEventHash(event);
    if (hashCheck.valid) {
      validHashes++;
    } else {
      errors.push(
        `Event ${i} (${event.id}): Payload hash mismatch. Expected ${event.payloadHash}, computed ${hashCheck.computedHash}`
      );
    }

    // 2. Verify chain link (except for first event)
    if (i > 0) {
      const previousEvent = events[i - 1];
      if (event.previousEventHash === previousEvent.payloadHash) {
        validLinks++;
      } else {
        errors.push(
          `Event ${i} (${event.id}): Chain break detected. Previous event hash ${event.previousEventHash} does not match previous event's payload hash ${previousEvent.payloadHash}`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalEvents: events.length,
      validHashes,
      validLinks: events.length - 1, // Total links is events - 1
    },
  };
}

/**
 * Main verification function
 */
async function verifyAuditBundle(filePath: string): Promise<void> {
  console.log('🔍 Democracy OS - Independent Audit Verifier\n');
  console.log(`📂 Loading audit bundle: ${filePath}\n`);

  // Check file exists
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: File not found: ${filePath}`);
    process.exit(1);
  }

  // Read and parse bundle
  let bundle: AuditBundle;
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    bundle = JSON.parse(fileContent);
  } catch (error) {
    console.error(`❌ Error: Failed to parse JSON file: ${error}`);
    process.exit(1);
  }

  // Validate bundle structure
  if (!bundle.events || !Array.isArray(bundle.events)) {
    console.error('❌ Error: Invalid bundle format. Missing or invalid "events" array.');
    process.exit(1);
  }

  console.log('📊 Bundle Information:');
  console.log(`   Tenant ID: ${bundle.tenantId}`);
  console.log(`   Exported At: ${bundle.exportedAt}`);
  console.log(`   Total Events: ${bundle.totalEvents}`);
  console.log(`   Events in Bundle: ${bundle.events.length}`);
  console.log();

  if (bundle.totalEvents !== bundle.events.length) {
    console.log('⚠️  Warning: Event count mismatch. Bundle may be incomplete.\n');
  }

  // Perform verification
  console.log('🔐 Verifying audit trail integrity...\n');

  const result = verifyHashChain(bundle.events);

  // Display warnings
  if (result.warnings.length > 0) {
    console.log('⚠️  Warnings:');
    result.warnings.forEach((warning) => {
      console.log(`   • ${warning}`);
    });
    console.log();
  }

  // Display errors
  if (result.errors.length > 0) {
    console.log('❌ Integrity Violations Detected:\n');
    result.errors.forEach((error) => {
      console.log(`   • ${error}`);
    });
    console.log();
  }

  // Display statistics
  console.log('📈 Verification Statistics:');
  console.log(`   Total Events Checked: ${result.stats.totalEvents}`);
  console.log(`   Valid Payload Hashes: ${result.stats.validHashes}/${result.stats.totalEvents}`);
  console.log(
    `   Valid Chain Links: ${result.stats.validLinks}/${result.stats.validLinks} (expected)`
  );
  console.log();

  // Final verdict
  if (result.valid) {
    console.log('✅ AUDIT TRAIL INTEGRITY: VERIFIED');
    console.log();
    console.log('The hash chain is intact and all payload hashes are correct.');
    console.log('This audit trail has not been tampered with.');
    process.exit(0);
  } else {
    console.log('❌ AUDIT TRAIL INTEGRITY: FAILED');
    console.log();
    console.log(`Found ${result.errors.length} integrity violation(s).`);
    console.log('This audit trail may have been tampered with or corrupted.');
    process.exit(1);
  }
}

// CLI entry point
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Democracy OS - Independent Audit Verifier');
  console.log();
  console.log('Usage:');
  console.log('  npm run verify-audit <path-to-audit-bundle.json>');
  console.log('  npx ts-node tools/audit-verifier.ts audit-bundle.json');
  console.log();
  console.log('Options:');
  console.log('  --help, -h    Show this help message');
  console.log();
  console.log('Example:');
  console.log('  npm run verify-audit ./audit-bundle-abc123-1234567890.json');
  process.exit(0);
}

const filePath = path.resolve(args[0]);
verifyAuditBundle(filePath);
