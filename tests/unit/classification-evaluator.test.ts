import type { TreeNode, FactBundle, RepresentationFact } from '../../src/types';
import {
  evaluateCL1Fraudulent,
  evaluateCL2NegligentStatutory,
  evaluateCL4Innocent,
} from '../../src/reasoning/classification-evaluator';

// ─── HELPERS ────────────────────────────────────────────────────────────────

function makeNode(overrides: Partial<TreeNode> & { id: string }): TreeNode {
  return {
    name: 'Test Node',
    layer: 'ELEMENTS',
    prerequisites: [],
    required_facts: ['some.fact'],
    predicate: 'test predicate',
    conclusion: 'test conclusion',
    burden: 'CLAIMANT',
    modality: 'MUST',
    protected: false,
    abstention_policy: 'STRICT',
    citations: [],
    ...overrides,
  };
}

function makeBundle(overrides: Partial<FactBundle> = {}): FactBundle {
  return {
    case_id: 'TEST-001',
    extracted_at: new Date().toISOString(),
    representations: [],
    contract_formed: null,
    governing_law: 'Singapore',
    extraction_model: 'test',
    raw_documents: ['test.txt'],
    ...overrides,
  };
}

function makeRepresentation(
  overrides: Partial<RepresentationFact> = {}
): RepresentationFact {
  return {
    id: 'R1',
    statement: 'Property has no defects',
    maker: 'Seller',
    recipient: 'Buyer',
    context: 'Pre-contract negotiation',
    truth_value: 'FALSE',
    maker_knowledge: 'KNEW_FALSE',
    induced_contract: true,
    source_document: 'contract.pdf',
    source_location: 'Page 1, Clause 3',
    extraction_confidence: 'HIGH',
    extraction_notes: '',
    ...overrides,
  };
}

function makeBundleWithRep(
  repOverrides: Partial<RepresentationFact> = {}
): FactBundle {
  return makeBundle({
    representations: [makeRepresentation({ id: 'R1', ...repOverrides })],
  });
}

// ─── NODE STUBS ─────────────────────────────────────────────────────────────

const cl1Node = makeNode({
  id: 'CL1',
  name: 'Fraudulent Misrepresentation',
  layer: 'CLASSIFICATION',
  abstention_policy: 'STRICT',
  required_facts: ['representations[*].maker_knowledge'],
  burden: 'CLAIMANT',
  citations: ['Derry v Peek [1889] UKHL 1'],
});

const cl2Node = makeNode({
  id: 'CL2',
  name: 'Negligent Misrepresentation (Statutory s.2(1))',
  layer: 'CLASSIFICATION',
  abstention_policy: 'STRICT',
  required_facts: ['representations[*].maker_knowledge'],
  burden: 'DEFENDANT',
  citations: ['Misrepresentation Act s.2(1)'],
});

const cl4Node = makeNode({
  id: 'CL4',
  name: 'Innocent Misrepresentation',
  layer: 'CLASSIFICATION',
  abstention_policy: 'STRICT',
  required_facts: ['representations[*].maker_knowledge'],
  burden: 'DEFENDANT',
  citations: ['Misrepresentation Act s.2(2)'],
});

// ─── CL1 FRAUDULENT TESTS ──────────────────────────────────────────────────

describe('evaluateCL1Fraudulent', () => {
  // TEST 1 — CL1 SATISFIED: maker knew it was false
  it('returns SATISFIED when maker_knowledge is KNEW_FALSE', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'KNEW_FALSE' });
    const result = evaluateCL1Fraudulent(cl1Node, bundle, 'R1');

    expect(result.outcome).toBe('SATISFIED');
    expect(result.reasoning_trace.toLowerCase()).toContain('fraudulent');
  });

  // TEST 2 — CL1 SATISFIED: maker was reckless
  it('returns SATISFIED when maker_knowledge is RECKLESS', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'RECKLESS' });
    const result = evaluateCL1Fraudulent(cl1Node, bundle, 'R1');

    expect(result.outcome).toBe('SATISFIED');
  });

  // TEST 3 — CL1 NOT_SATISFIED: maker had no reasonable belief
  it('returns NOT_SATISFIED when maker_knowledge is NO_REASONABLE_BELIEF', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'NO_REASONABLE_BELIEF' });
    const result = evaluateCL1Fraudulent(cl1Node, bundle, 'R1');

    expect(result.outcome).toBe('NOT_SATISFIED');
  });

  // TEST 4 — CL1 NOT_SATISFIED: maker had reasonable belief
  it('returns NOT_SATISFIED when maker_knowledge is REASONABLE_BELIEF', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'REASONABLE_BELIEF' });
    const result = evaluateCL1Fraudulent(cl1Node, bundle, 'R1');

    expect(result.outcome).toBe('NOT_SATISFIED');
  });

  // TEST 5 — CL1 ABSTAINED: maker knowledge unknown, STRICT node
  it('returns ABSTAINED when maker_knowledge is UNKNOWN and STRICT', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'UNKNOWN' });
    const result = evaluateCL1Fraudulent(cl1Node, bundle, 'R1');

    expect(result.outcome).toBe('ABSTAINED');
    expect(result.reasoning_trace.toLowerCase()).toContain('unknown');
  });

  // TEST 5B — representation not found in bundle
  it('returns ABSTAINED when representationId is not found', () => {
    const bundle = makeBundle({ representations: [] });
    const result = evaluateCL1Fraudulent(cl1Node, bundle, 'NONEXISTENT');
    expect(result.outcome).toBe('ABSTAINED');
    expect(result.reasoning_trace).toContain('not found');
  });
});

// ─── CL2 NEGLIGENT STATUTORY TESTS ─────────────────────────────────────────

describe('evaluateCL2NegligentStatutory', () => {
  // TEST 6 — CL2 SATISFIED: maker had no reasonable belief
  it('returns SATISFIED when maker_knowledge is NO_REASONABLE_BELIEF', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'NO_REASONABLE_BELIEF' });
    const result = evaluateCL2NegligentStatutory(cl2Node, bundle, 'R1');

    expect(result.outcome).toBe('SATISFIED');
    expect(result.reasoning_trace.toLowerCase()).toContain('burden');
  });

  // TEST 7 — CL2 SATISFIED: maker knew it was false
  it('returns SATISFIED when maker_knowledge is KNEW_FALSE', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'KNEW_FALSE' });
    const result = evaluateCL2NegligentStatutory(cl2Node, bundle, 'R1');

    expect(result.outcome).toBe('SATISFIED');
  });

  // TEST 8 — CL2 SATISFIED: maker was reckless
  it('returns SATISFIED when maker_knowledge is RECKLESS', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'RECKLESS' });
    const result = evaluateCL2NegligentStatutory(cl2Node, bundle, 'R1');

    expect(result.outcome).toBe('SATISFIED');
  });

  // TEST 9 — CL2 NOT_SATISFIED: maker proved reasonable belief
  it('returns NOT_SATISFIED when maker_knowledge is REASONABLE_BELIEF', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'REASONABLE_BELIEF' });
    const result = evaluateCL2NegligentStatutory(cl2Node, bundle, 'R1');

    expect(result.outcome).toBe('NOT_SATISFIED');
    expect(result.reasoning_trace.toLowerCase()).toContain('reasonable belief');
  });

  // TEST 10 — CL2 ABSTAINED: maker knowledge unknown, STRICT node
  it('returns ABSTAINED when maker_knowledge is UNKNOWN and STRICT', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'UNKNOWN' });
    const result = evaluateCL2NegligentStatutory(cl2Node, bundle, 'R1');

    expect(result.outcome).toBe('ABSTAINED');
  });

  // TEST 10B — representation not found in bundle
  it('returns ABSTAINED when representationId is not found', () => {
    const bundle = makeBundle({ representations: [] });
    const result = evaluateCL2NegligentStatutory(cl2Node, bundle, 'NONEXISTENT');
    expect(result.outcome).toBe('ABSTAINED');
    expect(result.reasoning_trace).toContain('not found');
  });
});

// ─── CL4 INNOCENT TESTS ────────────────────────────────────────────────────

describe('evaluateCL4Innocent', () => {
  // TEST 11 — CL4 SATISFIED: maker proved reasonable belief
  it('returns SATISFIED when maker_knowledge is REASONABLE_BELIEF', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'REASONABLE_BELIEF' });
    const result = evaluateCL4Innocent(cl4Node, bundle, 'R1');

    expect(result.outcome).toBe('SATISFIED');
    expect(result.reasoning_trace.toLowerCase()).toContain('innocent');
  });

  // TEST 12 — CL4 NOT_SATISFIED: maker knew it was false
  it('returns NOT_SATISFIED when maker_knowledge is KNEW_FALSE', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'KNEW_FALSE' });
    const result = evaluateCL4Innocent(cl4Node, bundle, 'R1');

    expect(result.outcome).toBe('NOT_SATISFIED');
  });

  // TEST 13 — CL4 NOT_SATISFIED: maker had no reasonable belief
  it('returns NOT_SATISFIED when maker_knowledge is NO_REASONABLE_BELIEF', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'NO_REASONABLE_BELIEF' });
    const result = evaluateCL4Innocent(cl4Node, bundle, 'R1');

    expect(result.outcome).toBe('NOT_SATISFIED');
  });

  // TEST 14 — CL4 ABSTAINED: maker knowledge unknown, STRICT node
  it('returns ABSTAINED when maker_knowledge is UNKNOWN and STRICT', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'UNKNOWN' });
    const result = evaluateCL4Innocent(cl4Node, bundle, 'R1');

    expect(result.outcome).toBe('ABSTAINED');
  });

  // TEST 14B — representation not found in bundle
  it('returns ABSTAINED when representationId is not found', () => {
    const bundle = makeBundle({ representations: [] });
    const result = evaluateCL4Innocent(cl4Node, bundle, 'NONEXISTENT');
    expect(result.outcome).toBe('ABSTAINED');
    expect(result.reasoning_trace).toContain('not found');
  });
});
