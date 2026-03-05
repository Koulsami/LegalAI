import type { TreeNode, FactBundle, RepresentationFact } from '../../src/types';
import { evaluateElementsNode } from '../../src/reasoning/predicate-evaluator';

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

// ─── E1 NODE STUB ───────────────────────────────────────────────────────────

const e1Node = makeNode({
  id: 'E1',
  name: 'Representation Was Made',
  layer: 'ELEMENTS',
  abstention_policy: 'STRICT',
  required_facts: [
    'representations[*].statement',
    'representations[*].maker',
    'representations[*].recipient',
  ],
  predicate: 'At least one RepresentationFact exists with a non-empty statement and maker.',
  conclusion: 'A representation was made.',
  citations: ['Misrepresentation Act s.2'],
});

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('evaluateElementsNode', () => {
  // TEST 1 — E1 SATISFIED: representations present with all required fields
  it('returns SATISFIED when all required facts are present', () => {
    const bundle = makeBundle({
      representations: [makeRepresentation()],
    });

    const result = evaluateElementsNode(e1Node, bundle);

    expect(result.outcome).toBe('SATISFIED');
    expect(result.node_id).toBe('E1');
    expect(result.node_name).toBe('Representation Was Made');
    expect(result.layer).toBe('ELEMENTS');
    expect(result.facts_used).toHaveProperty('representations[*].statement');
    expect(result.facts_used).toHaveProperty('representations[*].maker');
    expect(result.facts_used).toHaveProperty('representations[*].recipient');
    expect(result.citations_applied).toContain('Misrepresentation Act s.2');
    expect(new Date(result.evaluated_at).toISOString()).toBe(result.evaluated_at);
  });

  // TEST 2 — E1 ABSTAINED (STRICT): representation array empty
  it('returns ABSTAINED when STRICT node has empty representations array', () => {
    const bundle = makeBundle({ representations: [] });

    const result = evaluateElementsNode(e1Node, bundle);

    expect(result.outcome).toBe('ABSTAINED');
    expect(result.reasoning_trace).toEqual(
      expect.stringContaining('missing')
    );
  });

  // TEST 3 — E1 ABSTAINED (STRICT): maker field empty string
  it('returns ABSTAINED when STRICT node has representation with empty maker', () => {
    const bundle = makeBundle({
      representations: [makeRepresentation({ maker: '' })],
    });

    const result = evaluateElementsNode(e1Node, bundle);

    expect(result.outcome).toBe('ABSTAINED');
  });

  // TEST 4 — NOT_SATISFIED (PERMISSIVE node, facts missing)
  it('returns NOT_SATISFIED when PERMISSIVE node has missing facts', () => {
    const permissiveNode = makeNode({
      ...e1Node,
      id: 'E1-P',
      abstention_policy: 'PERMISSIVE',
    });
    const bundle = makeBundle({ representations: [] });

    const result = evaluateElementsNode(permissiveNode, bundle);

    expect(result.outcome).toBe('NOT_SATISFIED');
  });

  // TEST 5 — ABSTAINED: scalar required_fact that is absent
  it('returns ABSTAINED when STRICT node has absent scalar fact', () => {
    const scalarNode = makeNode({
      id: 'E-SCALAR',
      required_facts: ['governing_law'],
      abstention_policy: 'STRICT',
    });
    const bundle = makeBundle({ governing_law: '' });

    const result = evaluateElementsNode(scalarNode, bundle);

    expect(result.outcome).toBe('ABSTAINED');
  });

  // TEST 6 — SATISFIED: scalar fact present
  it('returns SATISFIED when scalar fact is present', () => {
    const scalarNode = makeNode({
      id: 'E-SCALAR',
      required_facts: ['governing_law'],
      abstention_policy: 'STRICT',
    });
    const bundle = makeBundle({ governing_law: 'Singapore' });

    const result = evaluateElementsNode(scalarNode, bundle);

    expect(result.outcome).toBe('SATISFIED');
  });

  // TEST 7 — facts_used is populated correctly
  it('populates facts_used with all required fact paths', () => {
    const bundle = makeBundle({
      representations: [makeRepresentation()],
    });

    const result = evaluateElementsNode(e1Node, bundle);

    expect(result.facts_used['representations[*].statement']).toBeDefined();
    expect(result.facts_used['representations[*].maker']).toBeDefined();
    expect(result.facts_used['representations[*].recipient']).toBeDefined();
  });

  // TEST 8 — reasoning_trace is a non-empty string
  it('produces a non-empty reasoning_trace string', () => {
    const bundle = makeBundle({
      representations: [makeRepresentation()],
    });

    const result = evaluateElementsNode(e1Node, bundle);

    expect(typeof result.reasoning_trace).toBe('string');
    expect(result.reasoning_trace.length).toBeGreaterThan(0);
  });
});
