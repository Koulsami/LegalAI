/**
 * src/validation/validator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Validates a FactBundle before reasoning begins.
 * Returns a ValidationResult with errors, warnings, and multi-path flag.
 *
 * LLM calls: ❌ NONE — pure deterministic logic.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  FactBundle,
  ValidationResult,
  ValidationError,
  ValidationWarning,
} from '../types';
import { logger } from '../utils/logger';

// ─── VALID ENUM VALUES ──────────────────────────────────────────────────────

const VALID_TRUTH_VALUES = new Set([
  'TRUE', 'FALSE', 'PARTIALLY_FALSE', 'UNKNOWN',
]);

const VALID_MAKER_KNOWLEDGE = new Set([
  'KNEW_FALSE', 'RECKLESS', 'NO_REASONABLE_BELIEF',
  'REASONABLE_BELIEF', 'UNKNOWN',
]);

// ─── VALIDATOR ──────────────────────────────────────────────────────────────

export function validate(bundle: FactBundle): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // V01 — At least one representation
  if (bundle.representations.length === 0) {
    errors.push({
      field: 'representations',
      representation_id: null,
      message: 'At least one representation is required',
      code: 'NO_REPRESENTATIONS_FOUND',
    });
  }

  // V03 — Governing law
  if (bundle.governing_law !== 'Singapore') {
    errors.push({
      field: 'governing_law',
      representation_id: null,
      message: 'governing_law must be "Singapore" for MA 1967 analysis',
      code: 'OUT_OF_SCOPE',
    });
  }

  // Per-representation rules
  for (const rep of bundle.representations) {
    const notes = rep.extraction_notes.toLowerCase();

    // V02 — Required fields
    if (!rep.statement) {
      errors.push({
        field: 'statement',
        representation_id: rep.id,
        message: `Field statement is required on representation ${rep.id}`,
        code: 'MISSING_REQUIRED_FIELD',
      });
    }
    if (!rep.maker) {
      errors.push({
        field: 'maker',
        representation_id: rep.id,
        message: `Field maker is required on representation ${rep.id}`,
        code: 'MISSING_REQUIRED_FIELD',
      });
    }
    if (!rep.recipient) {
      errors.push({
        field: 'recipient',
        representation_id: rep.id,
        message: `Field recipient is required on representation ${rep.id}`,
        code: 'MISSING_REQUIRED_FIELD',
      });
    }

    // V04 — Enum validation
    if (!VALID_TRUTH_VALUES.has(rep.truth_value)) {
      errors.push({
        field: 'truth_value',
        representation_id: rep.id,
        message: `Invalid truth_value: ${rep.truth_value}`,
        code: 'INVALID_ENUM_VALUE',
      });
    }
    if (!VALID_MAKER_KNOWLEDGE.has(rep.maker_knowledge)) {
      errors.push({
        field: 'maker_knowledge',
        representation_id: rep.id,
        message: `Invalid maker_knowledge: ${rep.maker_knowledge}`,
        code: 'INVALID_ENUM_VALUE',
      });
    }

    // V05 — Timing flag
    if (notes.includes('post-contract')) {
      warnings.push({
        field: 'extraction_notes',
        representation_id: rep.id,
        message: 'Representation may have been made post-contract — timing should be verified',
      });
    }

    // V06 — Contradiction
    if (rep.maker_knowledge === 'KNEW_FALSE' && notes.includes('reasonable grounds')) {
      warnings.push({
        field: 'maker_knowledge',
        representation_id: rep.id,
        message: 'Contradiction: maker_knowledge is KNEW_FALSE but notes reference reasonable grounds',
      });
    }

    // V07 — Conflict
    if (rep.truth_value === 'TRUE' && notes.includes('false')) {
      warnings.push({
        field: 'truth_value',
        representation_id: rep.id,
        message: 'Conflict: truth_value is TRUE but extraction_notes suggest falsity',
      });
    }

    // V08 — Disclaimer flag
    if (notes.includes('disclaimer') || notes.includes('non-reliance')) {
      warnings.push({
        field: 'extraction_notes',
        representation_id: rep.id,
        message: 'Disclaimer or non-reliance clause detected — flag for XS1 analysis',
      });
    }

    // V09 — Core facts absent
    if (!rep.statement || !rep.maker || rep.truth_value === 'UNKNOWN') {
      warnings.push({
        field: 'statement',
        representation_id: rep.id,
        message: 'Core facts absent or unknown for representation — analysis may be incomplete',
      });
    }
  }

  // V10 — Loss amount
  const anyInducedContract = bundle.representations.some(
    (r) => r.induced_contract === true
  );
  if (!anyInducedContract) {
    warnings.push({
      field: 'induced_contract',
      representation_id: null,
      message: 'No representation marked as inducing contract — damages quantum analysis not possible',
    });
  }

  // multi_path_required
  const multi_path_required = bundle.representations.some(
    (r) =>
      r.maker_knowledge === 'UNKNOWN' ||
      r.truth_value === 'PARTIALLY_FALSE'
  );

  logger.debug('validation/validator', {
    error_count: errors.length,
    warning_count: warnings.length,
    multi_path_required,
  });

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    multi_path_required,
    validated_at: new Date().toISOString(),
  };
}
