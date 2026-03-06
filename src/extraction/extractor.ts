/**
 * src/extraction/extractor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Calls Gemini to extract structured facts from documents.
 * This is one of two modules where LLM calls are permitted.
 *
 * LLM calls: ✅ YES — structured JSON output only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  TreeNode,
  DocumentInput,
  FactBundle,
  RepresentationFact,
  TruthValue,
  MakerKnowledge,
  ExtractionConfidence,
} from '../types';
import { buildExtractionPrompt } from './prompt-builder';
import { logger } from '../utils/logger';

// ─── EXTRACTION ERROR ───────────────────────────────────────────────────────

export class ExtractionError extends Error {
  constructor(
    message: string,
    public readonly code: 'INVALID_JSON' | 'SCHEMA_MISMATCH' | 'API_ERROR'
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

// ─── VALIDATION HELPERS ─────────────────────────────────────────────────────

const VALID_TRUTH_VALUES: readonly string[] = [
  'TRUE', 'FALSE', 'PARTIALLY_FALSE', 'UNKNOWN',
];

const VALID_MAKER_KNOWLEDGE: readonly string[] = [
  'KNEW_FALSE', 'RECKLESS', 'NO_REASONABLE_BELIEF', 'REASONABLE_BELIEF', 'UNKNOWN',
];

const VALID_CONFIDENCE: readonly string[] = [
  'HIGH', 'MEDIUM', 'LOW', 'ABSENT',
];

function coerceTruthValue(value: unknown): TruthValue {
  if (typeof value === 'string' && VALID_TRUTH_VALUES.includes(value)) {
    return value as TruthValue;
  }
  return 'UNKNOWN';
}

function coerceMakerKnowledge(value: unknown): MakerKnowledge {
  if (typeof value === 'string' && VALID_MAKER_KNOWLEDGE.includes(value)) {
    return value as MakerKnowledge;
  }
  return 'UNKNOWN';
}

function coerceConfidence(value: unknown): ExtractionConfidence {
  if (typeof value === 'string' && VALID_CONFIDENCE.includes(value)) {
    return value as ExtractionConfidence;
  }
  return 'LOW';
}

function coerceRepresentation(
  raw: Record<string, unknown>,
  index: number
): RepresentationFact {
  const rep: RepresentationFact = {
    id: typeof raw['id'] === 'string' ? raw['id'] : `R${index + 1}`,
    statement: typeof raw['statement'] === 'string' ? raw['statement'] : '',
    maker: typeof raw['maker'] === 'string' ? raw['maker'] : '',
    recipient: typeof raw['recipient'] === 'string' ? raw['recipient'] : '',
    context: typeof raw['context'] === 'string' ? raw['context'] : '',
    truth_value: coerceTruthValue(raw['truth_value']),
    maker_knowledge: coerceMakerKnowledge(raw['maker_knowledge']),
    induced_contract:
      typeof raw['induced_contract'] === 'boolean'
        ? raw['induced_contract']
        : null,
    source_document:
      typeof raw['source_document'] === 'string' ? raw['source_document'] : '',
    source_location:
      typeof raw['source_location'] === 'string' ? raw['source_location'] : '',
    extraction_confidence: coerceConfidence(raw['extraction_confidence']),
    extraction_notes:
      typeof raw['extraction_notes'] === 'string'
        ? raw['extraction_notes']
        : '',
    ...(typeof raw['evidence_of_falsity'] === 'string'
      ? { evidence_of_falsity: raw['evidence_of_falsity'] }
      : {}),
  };
  return rep;
}

// ─── EXTRACTOR ──────────────────────────────────────────────────────────────

export async function extract(
  nodes: readonly TreeNode[],
  documents: readonly DocumentInput[],
  caseId: string
): Promise<FactBundle> {
  const apiKey = process.env['GEMINI_API_KEY'];
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set');
  }

  const modelName = process.env['GEMINI_MODEL'] ?? 'gemini-1.5-pro';

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0,
      maxOutputTokens: 8192,
    },
  });

  const prompt = buildExtractionPrompt(nodes, documents);

  let responseText: string;
  try {
    const response = await model.generateContent(prompt);
    responseText = response.response.text();
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    logger.error('extraction/extractor', e);
    throw new ExtractionError(
      `Gemini API call failed: ${message}`,
      'API_ERROR'
    );
  }

  // Parse JSON
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(responseText) as Record<string, unknown>;
  } catch {
    logger.error('extraction/extractor', new Error('Gemini returned invalid JSON'));
    throw new ExtractionError(
      'Gemini returned invalid JSON',
      'INVALID_JSON'
    );
  }

  // Validate representations array
  const rawReps = parsed['representations'];
  if (!Array.isArray(rawReps) || rawReps.length === 0) {
    logger.error('extraction/extractor', new Error('No representations found in Gemini response'));
    throw new ExtractionError(
      'Gemini response contains no representations',
      'SCHEMA_MISMATCH'
    );
  }

  // Coerce representations
  const representations: RepresentationFact[] = rawReps.map(
    (raw: unknown, i: number) =>
      coerceRepresentation(
        (raw !== null && typeof raw === 'object' ? raw : {}) as Record<string, unknown>,
        i
      )
  );

  const bundle: FactBundle = {
    case_id: caseId,
    extracted_at: new Date().toISOString(),
    representations,
    contract_formed:
      typeof parsed['contract_formed'] === 'boolean'
        ? parsed['contract_formed']
        : null,
    governing_law:
      typeof parsed['governing_law'] === 'string'
        ? parsed['governing_law']
        : 'Singapore',
    loss_amount:
      typeof parsed['loss_amount'] === 'number'
        ? parsed['loss_amount']
        : null,
    extraction_model: modelName,
    raw_documents: documents.map((d) => d.filename),
  };

  logger.info('extraction/extractor', {
    case_id: caseId,
    model: modelName,
    representation_count: representations.length,
  });

  return bundle;
}
