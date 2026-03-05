import type {
  FactBundle,
  RepresentationFact,
  TruthValue,
  MakerKnowledge,
} from '../../src/types';
import { validate } from '../../src/validation/validator';

// ─── HELPERS ────────────────────────────────────────────────────────────────

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

// ─── TESTS ──────────────────────────────────────────────────────────────────

describe('validate', () => {
  // TEST 1 — valid bundle passes with no errors or warnings
  it('returns valid with no errors or warnings for a correct bundle', () => {
    const bundle = makeBundleWithRep();
    const result = validate(bundle);

    expect(result.valid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.multi_path_required).toBe(false);
    expect(new Date(result.validated_at).toISOString()).toBe(result.validated_at);
  });

  // TEST 2 — V01: no representations → error
  it('returns error when bundle has no representations', () => {
    const bundle = makeBundle({ representations: [] });
    const result = validate(bundle);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'NO_REPRESENTATIONS_FOUND' }),
      ])
    );
  });

  // TEST 3 — V02: empty statement → error
  it('returns error when representation has empty statement', () => {
    const bundle = makeBundleWithRep({ statement: '' });
    const result = validate(bundle);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD' }),
      ])
    );
    expect(result.errors.find((e) => e.code === 'MISSING_REQUIRED_FIELD')?.representation_id).toBe('R1');
  });

  // TEST 4 — V02: empty maker → error
  it('returns error when representation has empty maker', () => {
    const bundle = makeBundleWithRep({ maker: '' });
    const result = validate(bundle);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD' }),
      ])
    );
  });

  // TEST 5 — V02: empty recipient → error
  it('returns error when representation has empty recipient', () => {
    const bundle = makeBundleWithRep({ recipient: '' });
    const result = validate(bundle);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'MISSING_REQUIRED_FIELD' }),
      ])
    );
  });

  // TEST 6 — V03: governing_law not Singapore → error
  it('returns error when governing_law is not Singapore', () => {
    const bundle = makeBundle({
      governing_law: 'England',
      representations: [makeRepresentation()],
    });
    const result = validate(bundle);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'OUT_OF_SCOPE' }),
      ])
    );
  });

  // TEST 7 — V04: invalid truth_value → error
  it('returns error when truth_value is invalid', () => {
    const bundle = makeBundleWithRep({
      truth_value: 'MAYBE' as unknown as TruthValue,
    });
    const result = validate(bundle);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_ENUM_VALUE' }),
      ])
    );
  });

  // TEST 8 — V04: invalid maker_knowledge → error
  it('returns error when maker_knowledge is invalid', () => {
    const bundle = makeBundleWithRep({
      maker_knowledge: 'DEFINITELY_KNEW' as unknown as MakerKnowledge,
    });
    const result = validate(bundle);

    expect(result.valid).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INVALID_ENUM_VALUE' }),
      ])
    );
  });

  // TEST 9 — V06: contradiction warning
  it('warns on contradiction: KNEW_FALSE with reasonable grounds notes', () => {
    const bundle = makeBundleWithRep({
      maker_knowledge: 'KNEW_FALSE',
      extraction_notes: 'seller had reasonable grounds per agent',
    });
    const result = validate(bundle);

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: expect.stringContaining('maker_knowledge'),
        }),
      ])
    );
  });

  // TEST 10 — V07: conflict warning
  it('warns on conflict: truth_value TRUE but notes say false', () => {
    const bundle = makeBundleWithRep({
      truth_value: 'TRUE',
      extraction_notes: 'document shows statement was false',
    });
    const result = validate(bundle);

    expect(result.valid).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  // TEST 11 — V08: disclaimer flag in warnings
  it('warns with XS1 when extraction_notes contain non-reliance', () => {
    const bundle = makeBundleWithRep({
      extraction_notes: 'contract contains non-reliance clause',
    });
    const result = validate(bundle);

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: expect.stringContaining('XS1'),
        }),
      ])
    );
  });

  // TEST 12 — multi_path_required: UNKNOWN maker_knowledge
  it('sets multi_path_required when maker_knowledge is UNKNOWN', () => {
    const bundle = makeBundleWithRep({ maker_knowledge: 'UNKNOWN' });
    const result = validate(bundle);

    expect(result.valid).toBe(true);
    expect(result.multi_path_required).toBe(true);
  });

  // TEST 13 — multi_path_required: PARTIALLY_FALSE truth_value
  it('sets multi_path_required when truth_value is PARTIALLY_FALSE', () => {
    const bundle = makeBundleWithRep({ truth_value: 'PARTIALLY_FALSE' });
    const result = validate(bundle);

    expect(result.valid).toBe(true);
    expect(result.multi_path_required).toBe(true);
  });

  // TEST 14 — multi_path_required: false when no ambiguity
  it('does not set multi_path_required when facts are unambiguous', () => {
    const bundle = makeBundleWithRep({
      maker_knowledge: 'KNEW_FALSE',
      truth_value: 'FALSE',
    });
    const result = validate(bundle);

    expect(result.multi_path_required).toBe(false);
  });

  // TEST 15 — multiple errors accumulate
  it('accumulates multiple errors from different rules', () => {
    const bundle = makeBundle({
      representations: [],
      governing_law: 'England',
    });
    const result = validate(bundle);

    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });

  // TEST 16 — validated_at is present and valid ISO string
  it('produces a valid ISO timestamp in validated_at', () => {
    const bundle = makeBundleWithRep();
    const result = validate(bundle);

    expect(new Date(result.validated_at).toISOString()).toBe(result.validated_at);
  });
});
