import type {
  ReasoningResult,
  ClassificationResult,
  RemedyResult,
} from '../../src/types';
// @ts-expect-error — Step A: firewall.ts has no exports yet
import { protect, verify } from '../../src/firewall/firewall';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function makeReasoningResult(
  overrides: Partial<ReasoningResult> = {}
): ReasoningResult {
  return {
    case_id: 'TEST-001',
    reasoned_at: new Date().toISOString(),
    classifications: [],
    remedies: [],
    all_node_evaluations: [],
    multi_path_results: null,
    ...overrides,
  };
}

function makeStandardResult(): ReasoningResult {
  return makeReasoningResult({
    case_id: 'TEST-001',
    classifications: [{
      representation_id: 'R1',
      classification: 'FRAUDULENT',
      confidence: 'CERTAIN',
      node_evaluations: [],
      path_type: 'PRIMARY',
    }],
    remedies: [{
      representation_id: 'R1',
      available_remedies: ['RESCISSION', 'DAMAGES_TORTIOUS'],
      barred_remedies: [],
      node_evaluations: [],
    }],
  });
}

function makeCorruptedResult(result: ReasoningResult): ReasoningResult {
  const original = result.classifications.find(
    (c) => c.representation_id === 'R1'
  );
  return {
    ...result,
    classifications: [{
      ...original!,
      classification: 'INNOCENT' as const,
    }],
  };
}

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('firewall', () => {
  // TEST 1 — protect() returns a FirewallSummary with records
  it('protect() returns a FirewallSummary with records', () => {
    const result = makeStandardResult();
    const { summary } = protect(result);

    expect(summary.case_id).toBe('TEST-001');
    expect(summary.records.length).toBeGreaterThanOrEqual(2);
    expect(summary.all_verified).toBe(false);
    expect(summary.revert_count).toBe(0);
    expect(summary.summary_hash).toBeTruthy();
  });

  // TEST 2 — protect() records have correct field_ids
  it('protect() records have correct field_ids', () => {
    const result = makeStandardResult();
    const { summary } = protect(result);

    expect(summary.records.some((r: { field_id: string }) => r.field_id === 'classification.R1')).toBe(true);
    expect(summary.records.some((r: { field_id: string }) => r.field_id === 'remedies.R1.available')).toBe(true);
  });

  // TEST 3 — protect() hash_before is a 64-char hex SHA-256 string
  it('protect() hash_before is a 64-char hex SHA-256 string', () => {
    const result = makeStandardResult();
    const { summary } = protect(result);

    const classRecord = summary.records.find(
      (r: { field_id: string }) => r.field_id === 'classification.R1'
    );
    expect(classRecord).toBeDefined();
    expect(classRecord!.hash_before).toMatch(/^[a-f0-9]{64}$/);
    expect(classRecord!.hash_after).toBeNull();
    expect(classRecord!.verified).toBeNull();
    expect(classRecord!.reverted).toBe(false);
  });

  // TEST 4 — verify() sets all_verified=true when result unchanged
  it('verify() sets all_verified=true when result unchanged', () => {
    const result = makeStandardResult();
    const { summary } = protect(result);
    const verified = verify(result, summary);

    expect(verified.all_verified).toBe(true);
    expect(verified.revert_count).toBe(0);
    expect(verified.records.every((r: { verified: boolean | null }) => r.verified === true)).toBe(true);
  });

  // TEST 5 — verify() detects corruption and sets reverted=true
  it('verify() detects corruption and sets reverted=true', () => {
    const result = makeStandardResult();
    const { summary } = protect(result);
    const corruptedResult = makeCorruptedResult(result);

    const verified = verify(corruptedResult, summary);
    expect(verified.all_verified).toBe(false);
    expect(verified.revert_count).toBeGreaterThanOrEqual(1);
    const record = verified.records.find(
      (r: { field_id: string }) => r.field_id === 'classification.R1'
    );
    expect(record!.reverted).toBe(true);
  });

  // TEST 6 — verify() sets verified=false on corrupted field
  it('verify() sets verified=false on corrupted field', () => {
    const result = makeStandardResult();
    const { summary } = protect(result);
    const corruptedResult = makeCorruptedResult(result);

    const verified = verify(corruptedResult, summary);
    const record = verified.records.find(
      (r: { field_id: string }) => r.field_id === 'classification.R1'
    );
    expect(record!.verified).toBe(false);
    expect(record!.hash_after).toBeTruthy();
  });

  // TEST 7 — verify() leaves unmodified fields as verified=true
  it('verify() leaves unmodified fields as verified=true', () => {
    const result = makeStandardResult();
    const { summary } = protect(result);
    const corruptedResult = makeCorruptedResult(result);

    const verified = verify(corruptedResult, summary);
    const remedyRecord = verified.records.find(
      (r: { field_id: string }) => r.field_id === 'remedies.R1.available'
    );
    expect(remedyRecord!.verified).toBe(true);
  });

  // TEST 8 — summary_hash is deterministic
  it('summary_hash is deterministic', () => {
    const result = makeStandardResult();
    const { summary: summary1 } = protect(result);
    const { summary: summary2 } = protect(result);

    expect(summary1.summary_hash).toBe(summary2.summary_hash);
  });

  // TEST 9 — summary_hash changes when classification changes
  it('summary_hash changes when classification changes', () => {
    const result1 = makeReasoningResult({
      classifications: [{
        representation_id: 'R1',
        classification: 'FRAUDULENT',
        confidence: 'CERTAIN',
        node_evaluations: [],
        path_type: 'PRIMARY',
      }],
      remedies: [{
        representation_id: 'R1',
        available_remedies: ['RESCISSION', 'DAMAGES_TORTIOUS'],
        barred_remedies: [],
        node_evaluations: [],
      }],
    });
    const result2 = makeReasoningResult({
      classifications: [{
        representation_id: 'R1',
        classification: 'INNOCENT',
        confidence: 'CERTAIN',
        node_evaluations: [],
        path_type: 'PRIMARY',
      }],
      remedies: [{
        representation_id: 'R1',
        available_remedies: ['RESCISSION', 'DAMAGES_IN_LIEU'],
        barred_remedies: [],
        node_evaluations: [],
      }],
    });

    expect(protect(result1).summary.summary_hash).not.toBe(
      protect(result2).summary.summary_hash
    );
  });

  // TEST 10 — empty classifications and remedies produces empty records
  it('empty classifications and remedies produces empty records', () => {
    const result = makeReasoningResult();
    const { summary } = protect(result);

    expect(summary.records.length).toBe(0);
    expect(summary.all_verified).toBe(false);
    expect(typeof summary.summary_hash).toBe('string');
  });
});
