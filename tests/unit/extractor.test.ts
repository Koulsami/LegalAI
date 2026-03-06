/**
 * tests/unit/extractor.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the extraction layer.
 * Mocks @google/generative-ai — no live API calls.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TreeNode, DocumentInput } from '../../src/types';
import { buildExtractionPrompt } from '../../src/extraction/prompt-builder';
import { extract, ExtractionError } from '../../src/extraction/extractor';

// ─── MOCK SETUP ─────────────────────────────────────────────────────────────

const mockGenerateContent = jest.fn();

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: jest.fn().mockReturnValue({
      generateContent: mockGenerateContent,
    }),
  })),
}));

// ─── HELPERS ────────────────────────────────────────────────────────────────

function makeStubNode(overrides: Partial<TreeNode> & { id: string }): TreeNode {
  return {
    name: 'Test Node',
    layer: 'ELEMENTS',
    prerequisites: [],
    required_facts: ['representations[*].statement'],
    predicate: 'test',
    conclusion: 'test',
    burden: 'CLAIMANT',
    modality: 'MUST',
    protected: false,
    abstention_policy: 'STRICT',
    citations: [],
    ...overrides,
  };
}

const stubNodes: TreeNode[] = [
  makeStubNode({
    id: 'E1',
    required_facts: [
      'representations[*].statement',
      'representations[*].maker',
      'representations[*].recipient',
    ],
  }),
  makeStubNode({
    id: 'E2',
    required_facts: [
      'representations[*].truth_value',
      'representations[*].evidence_of_falsity',
    ],
  }),
  makeStubNode({
    id: 'CL1',
    required_facts: ['representations[*].maker_knowledge'],
  }),
  makeStubNode({
    id: 'META1',
    required_facts: ['governing_law'],
  }),
  makeStubNode({
    id: 'E6',
    required_facts: ['loss_amount'],
  }),
];

const stubDocs: DocumentInput[] = [
  {
    filename: 'test.pdf',
    content: 'The seller stated the property has no defects.',
    doc_type: 'CONTRACT',
  },
];

const VALID_RESPONSE = JSON.stringify({
  case_id: 'TEST',
  governing_law: 'Singapore',
  contract_formed: true,
  loss_amount: 50000,
  representations: [
    {
      id: 'R1',
      statement: 'The property has no defects',
      maker: 'Seller',
      recipient: 'Buyer',
      context: 'Pre-contract',
      truth_value: 'FALSE',
      maker_knowledge: 'KNEW_FALSE',
      induced_contract: true,
      evidence_of_falsity: 'Survey shows defects',
      source_document: 'test.pdf',
      source_location: 'Clause 1',
      extraction_confidence: 'HIGH',
      extraction_notes: '',
    },
  ],
});

// ─── TESTS ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockGenerateContent.mockReset();
  process.env['GEMINI_API_KEY'] = 'test-key-for-unit-tests';
});

// TEST 1
describe('buildExtractionPrompt', () => {
  it('includes all required_facts slots', () => {
    const prompt = buildExtractionPrompt(stubNodes, []);
    expect(prompt).toContain('representations');
    expect(prompt).toContain('governing_law');
    expect(prompt).toContain('loss_amount');
    expect(prompt).toContain('truth_value');
    expect(prompt).toContain('maker_knowledge');
  });
});

describe('extract', () => {
  // TEST 2
  it('returns valid FactBundle on well-formed Gemini response', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => VALID_RESPONSE },
    });

    const result = await extract(stubNodes, stubDocs, 'TEST-001');
    expect(result.case_id).toBe('TEST-001');
    expect(result.representations.length).toBe(1);
    expect(result.representations[0]!.truth_value).toBe('FALSE');
    expect(result.representations[0]!.maker_knowledge).toBe('KNEW_FALSE');
  });

  // TEST 3
  it('throws ExtractionError with INVALID_JSON on bad response', async () => {
    mockGenerateContent.mockResolvedValue({
      response: { text: () => 'not valid json {' },
    });

    await expect(
      extract(stubNodes, stubDocs, 'TEST-002')
    ).rejects.toThrow(ExtractionError);

    await expect(
      extract(stubNodes, stubDocs, 'TEST-002')
    ).rejects.toMatchObject({ code: 'INVALID_JSON' });
  });

  // TEST 4
  it('throws ExtractionError with SCHEMA_MISMATCH on empty representations', async () => {
    mockGenerateContent.mockResolvedValue({
      response: {
        text: () => JSON.stringify({ representations: [] }),
      },
    });

    await expect(
      extract(stubNodes, stubDocs, 'TEST-003')
    ).rejects.toThrow(ExtractionError);

    await expect(
      extract(stubNodes, stubDocs, 'TEST-003')
    ).rejects.toMatchObject({ code: 'SCHEMA_MISMATCH' });
  });

  // TEST 5
  it('throws ExtractionError with code API_ERROR on Gemini failure', async () => {
    mockGenerateContent.mockRejectedValue(new Error('API quota exceeded'));

    await expect(
      extract(stubNodes, stubDocs, 'TEST-004')
    ).rejects.toThrow(ExtractionError);

    await expect(
      extract(stubNodes, stubDocs, 'TEST-004')
    ).rejects.toMatchObject({ code: 'API_ERROR' });
  });

  // TEST 6
  it('defaults missing fields to safe values', async () => {
    const partialResponse = JSON.stringify({
      representations: [
        {
          id: 'R1',
          statement: 'Some statement',
          maker: 'Seller',
          recipient: 'Buyer',
          source_document: 'test.pdf',
          source_location: 'Clause 1',
        },
      ],
    });
    mockGenerateContent.mockResolvedValue({
      response: { text: () => partialResponse },
    });

    const result = await extract(stubNodes, stubDocs, 'TEST-005');
    expect(result.representations[0]!.truth_value).toBe('UNKNOWN');
    expect(result.representations[0]!.maker_knowledge).toBe('UNKNOWN');
    expect(result.representations[0]!.extraction_confidence).toBe('LOW');
    expect(result.representations[0]!.induced_contract).toBeNull();
    expect(result.representations[0]!.extraction_notes).toBe('');
  });

  // TEST 7
  it('throws if GEMINI_API_KEY is not set', async () => {
    const savedKey = process.env['GEMINI_API_KEY'];
    delete process.env['GEMINI_API_KEY'];

    await expect(
      extract(stubNodes, stubDocs, 'TEST-006')
    ).rejects.toThrow('GEMINI_API_KEY');

    process.env['GEMINI_API_KEY'] = savedKey;
  });
});
