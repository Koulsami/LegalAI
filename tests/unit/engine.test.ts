import type { TreeNode, FactBundle, RepresentationFact } from '../../src/types';
import type { CRGGraph } from '../../src/knowledge/graph-builder';
import { reason } from '../../src/reasoning/engine';

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

function makeMinimalGraph(nodes: TreeNode[]): CRGGraph {
  const nodeMap = new Map<string, TreeNode>();
  const adjacency = new Map<string, readonly string[]>();
  for (const node of nodes) {
    nodeMap.set(node.id, node);
    adjacency.set(node.id, []);
  }
  return {
    nodes: nodeMap,
    adjacency,
    topologicalOrder: nodes.map((n) => n.id),
  };
}

// ─── NODE STUBS ─────────────────────────────────────────────────────────────

const e1Node = makeNode({
  id: 'E1',
  layer: 'ELEMENTS',
  abstention_policy: 'STRICT',
  required_facts: [
    'representations[*].statement',
    'representations[*].maker',
    'representations[*].recipient',
  ],
  citations: ['Misrepresentation Act s.2'],
});

const cl1Node = makeNode({
  id: 'CL1',
  layer: 'CLASSIFICATION',
  abstention_policy: 'STRICT',
  required_facts: ['representations[*].maker_knowledge'],
  burden: 'CLAIMANT',
  citations: ['Derry v Peek [1889] UKHL 1'],
});

const cl2Node = makeNode({
  id: 'CL2',
  layer: 'CLASSIFICATION',
  abstention_policy: 'STRICT',
  required_facts: ['representations[*].maker_knowledge'],
  burden: 'DEFENDANT',
  citations: ['Misrepresentation Act s.2(1)'],
});

const cl4Node = makeNode({
  id: 'CL4',
  layer: 'CLASSIFICATION',
  abstention_policy: 'STRICT',
  required_facts: ['representations[*].maker_knowledge'],
  burden: 'DEFENDANT',
  citations: ['Misrepresentation Act s.2(2)'],
});

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('reason', () => {
  // TEST 1 — FRAUDULENT classification end-to-end
  it('classifies KNEW_FALSE as FRAUDULENT', () => {
    const graph = makeMinimalGraph([e1Node, cl1Node, cl2Node, cl4Node]);
    const bundle = makeBundleWithRep({ maker_knowledge: 'KNEW_FALSE' });
    const result = reason(bundle, graph);

    expect(result.case_id).toBe(bundle.case_id);
    expect(result.classifications.length).toBe(1);
    expect(result.classifications[0]?.classification).toBe('FRAUDULENT');
    expect(result.classifications[0]?.representation_id).toBe('R1');
    expect(result.all_node_evaluations.length).toBeGreaterThan(0);
    expect(new Date(result.reasoned_at).toISOString()).toBe(result.reasoned_at);
  });

  // TEST 2 — NEGLIGENT_STATUTORY classification end-to-end
  it('classifies NO_REASONABLE_BELIEF as NEGLIGENT_STATUTORY', () => {
    const graph = makeMinimalGraph([e1Node, cl1Node, cl2Node, cl4Node]);
    const bundle = makeBundleWithRep({ maker_knowledge: 'NO_REASONABLE_BELIEF' });
    const result = reason(bundle, graph);

    expect(result.classifications[0]?.classification).toBe('NEGLIGENT_STATUTORY');
  });

  // TEST 3 — INNOCENT classification end-to-end
  it('classifies REASONABLE_BELIEF as INNOCENT', () => {
    const graph = makeMinimalGraph([e1Node, cl1Node, cl2Node, cl4Node]);
    const bundle = makeBundleWithRep({ maker_knowledge: 'REASONABLE_BELIEF' });
    const result = reason(bundle, graph);

    expect(result.classifications[0]?.classification).toBe('INNOCENT');
  });

  // TEST 4 — NOT_ESTABLISHED when maker_knowledge UNKNOWN and STRICT
  it('classifies UNKNOWN maker_knowledge as NOT_ESTABLISHED', () => {
    const graph = makeMinimalGraph([e1Node, cl1Node, cl2Node, cl4Node]);
    const bundle = makeBundleWithRep({ maker_knowledge: 'UNKNOWN' });
    const result = reason(bundle, graph);

    expect(result.classifications[0]?.classification).toBe('NOT_ESTABLISHED');
  });

  // TEST 5 — multiple representations classified independently
  it('classifies multiple representations independently', () => {
    const graph = makeMinimalGraph([e1Node, cl1Node, cl2Node, cl4Node]);
    const bundle = makeBundle({
      representations: [
        makeRepresentation({ id: 'R1', maker_knowledge: 'KNEW_FALSE' }),
        makeRepresentation({ id: 'R2', maker_knowledge: 'NO_REASONABLE_BELIEF' }),
      ],
    });
    const result = reason(bundle, graph);

    expect(result.classifications.length).toBe(2);
    const r1 = result.classifications.find((c) => c.representation_id === 'R1');
    const r2 = result.classifications.find((c) => c.representation_id === 'R2');
    expect(r1?.classification).toBe('FRAUDULENT');
    expect(r2?.classification).toBe('NEGLIGENT_STATUTORY');
  });

  // TEST 6 — all_node_evaluations contains entries for all nodes
  it('populates all_node_evaluations with E1 and CL1 entries', () => {
    const graph = makeMinimalGraph([e1Node, cl1Node, cl2Node, cl4Node]);
    const bundle = makeBundleWithRep({ maker_knowledge: 'KNEW_FALSE' });
    const result = reason(bundle, graph);

    expect(result.all_node_evaluations.some((e) => e.node_id === 'E1')).toBe(true);
    expect(result.all_node_evaluations.some((e) => e.node_id === 'CL1')).toBe(true);
  });

  // TEST 7 — ELEMENTS node ABSTAINED halts classification for that rep
  it('returns NOT_ESTABLISHED when E1 abstains due to empty statement', () => {
    const graph = makeMinimalGraph([e1Node, cl1Node, cl2Node, cl4Node]);
    const bundle = makeBundle({
      representations: [
        makeRepresentation({ id: 'R1', statement: '' }),
      ],
    });
    const result = reason(bundle, graph);

    expect(result.classifications[0]?.classification).toBe('NOT_ESTABLISHED');
  });

  // TEST 8 — multi_path_results is null when no ambiguity
  it('returns null multi_path_results when no ambiguity', () => {
    const graph = makeMinimalGraph([e1Node, cl1Node, cl2Node, cl4Node]);
    const bundle = makeBundleWithRep({ maker_knowledge: 'KNEW_FALSE' });
    const result = reason(bundle, graph);

    expect(result.multi_path_results).toBeNull();
  });

  // TEST 9 — multi_path_results is non-null when UNKNOWN maker_knowledge
  it('returns non-null multi_path_results when maker_knowledge is UNKNOWN', () => {
    const graph = makeMinimalGraph([e1Node, cl1Node, cl2Node, cl4Node]);
    const bundle = makeBundleWithRep({ maker_knowledge: 'UNKNOWN' });
    const result = reason(bundle, graph);

    expect(result.multi_path_results).not.toBeNull();
    expect(result.multi_path_results!.length).toBeGreaterThanOrEqual(1);
  });

  // TEST 10 — Riviera Bay R1: FRAUDULENT (partial north star check)
  it('classifies Riviera Bay R1 as FRAUDULENT', () => {
    const graph = makeMinimalGraph([e1Node, cl1Node, cl2Node, cl4Node]);
    const bundle = makeBundle({
      case_id: 'RIVIERA-BAY',
      representations: [makeRepresentation({
        id: 'R1',
        statement: 'The property generates $4,800/month in rental income',
        maker: 'Chen Wei',
        recipient: 'Priya Nair',
        truth_value: 'FALSE',
        maker_knowledge: 'KNEW_FALSE',
      })],
    });
    const result = reason(bundle, graph);

    expect(result.classifications[0]?.classification).toBe('FRAUDULENT');
    expect(result.classifications[0]?.representation_id).toBe('R1');
  });
});
