/**
 * src/firewall/firewall.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Validation Firewall. SHA-256 hash/verify of protected fields in a
 * ReasoningResult to ensure deterministic values are never corrupted.
 *
 * LLM calls: ❌ NONE — SHA-256 crypto only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createHash } from 'crypto';
import type {
  ReasoningResult,
  FirewallRecord,
  FirewallSummary,
} from '../types';
import { logger } from '../utils/logger';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

// ─── PROTECT ────────────────────────────────────────────────────────────────

export function protect(result: ReasoningResult): {
  protected: ReasoningResult;
  summary: FirewallSummary;
} {
  const records: FirewallRecord[] = [];

  // Hash each classification
  for (const c of result.classifications) {
    const value = JSON.stringify(c.classification);
    records.push({
      field_id: `classification.${c.representation_id}`,
      protected_value: c.classification,
      hash_before: sha256(value),
      hash_after: null,
      verified: null,
      verified_at: null,
      reverted: false,
    });
  }

  // Hash each remedy set
  for (const r of result.remedies) {
    const value = JSON.stringify(r.available_remedies);
    records.push({
      field_id: `remedies.${r.representation_id}.available`,
      protected_value: value,
      hash_before: sha256(value),
      hash_after: null,
      verified: null,
      verified_at: null,
      reverted: false,
    });
  }

  // Compute summary_hash: sort by field_id, concatenate hash_before values
  const sorted = [...records].sort((a, b) =>
    a.field_id.localeCompare(b.field_id)
  );
  const concatenated = sorted.map((r) => r.hash_before).join('');
  const summary_hash = sha256(concatenated);

  logger.info('firewall/firewall', {
    case_id: result.case_id,
    record_count: records.length,
  });

  return {
    protected: result,
    summary: {
      case_id: result.case_id,
      records,
      all_verified: false,
      revert_count: 0,
      summary_hash,
    },
  };
}

// ─── VERIFY ─────────────────────────────────────────────────────────────────

export function verify(
  result: ReasoningResult,
  summary: FirewallSummary
): FirewallSummary {
  // Build lookup of current values
  const currentValues = new Map<string, string>();

  for (const c of result.classifications) {
    currentValues.set(
      `classification.${c.representation_id}`,
      JSON.stringify(c.classification)
    );
  }

  for (const r of result.remedies) {
    currentValues.set(
      `remedies.${r.representation_id}.available`,
      JSON.stringify(r.available_remedies)
    );
  }

  // Verify each record
  let revertCount = 0;
  const updatedRecords: FirewallRecord[] = [];

  for (const record of summary.records) {
    const currentRaw = currentValues.get(record.field_id) ?? 'null';
    const hashAfter = sha256(currentRaw);
    const matched = hashAfter === record.hash_before;

    updatedRecords.push({
      ...record,
      hash_after: hashAfter,
      verified: matched,
      verified_at: new Date().toISOString(),
      reverted: !matched,
    });

    if (!matched) {
      revertCount++;
    }
  }

  const allVerified = revertCount === 0 && updatedRecords.length > 0;

  logger.info('firewall/firewall', {
    case_id: summary.case_id,
    all_verified: allVerified,
    revert_count: revertCount,
  });

  return {
    ...summary,
    records: updatedRecords,
    all_verified: allVerified,
    revert_count: revertCount,
  };
}
