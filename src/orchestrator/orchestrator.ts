/**
 * src/orchestrator/orchestrator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sequences the analysis pipeline: load CRG → validate → reason → firewall.
 * Thin controller with no domain logic.
 *
 * LLM calls: ❌ NONE — delegates to modules only.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { randomUUID } from 'crypto';
import type {
  AnalyseRequest,
  FinalReport,
  FactBundle,
  ReasoningResult,
  FirewallSummary,
  ValidationResult,
  MisrepresentationClass,
  RepresentationSummary,
  CaseSummary,
} from '../types';
import { loadCRG } from '../knowledge/loader';
import { buildGraph } from '../knowledge/graph-builder';
import { validate } from '../validation/validator';
import { reason } from '../reasoning/engine';
import { protect } from '../firewall/firewall';
import { logger } from '../utils/logger';

// ─── HELPERS ────────────────────────────────────────────────────────────────

const CLASSIFICATION_PRIORITY: readonly MisrepresentationClass[] = [
  'FRAUDULENT',
  'NEGLIGENT_STATUTORY',
  'NEGLIGENT_COMMON_LAW',
  'INNOCENT',
  'NOT_ESTABLISHED',
];

function emptyReasoningResult(caseId: string): ReasoningResult {
  return {
    case_id: caseId,
    reasoned_at: new Date().toISOString(),
    classifications: [],
    remedies: [],
    all_node_evaluations: [],
    multi_path_results: null,
  };
}

function emptyFirewallSummary(caseId: string): FirewallSummary {
  return {
    case_id: caseId,
    records: [],
    all_verified: false,
    revert_count: 0,
    summary_hash: '',
  };
}

function buildRepresentationSummaries(
  bundle: FactBundle,
  reasoningResult: ReasoningResult
): readonly RepresentationSummary[] {
  return reasoningResult.classifications.map((c) => ({
    id: c.representation_id,
    statement:
      bundle.representations.find((r) => r.id === c.representation_id)
        ?.statement ?? '',
    classification: c.classification,
    available_remedies:
      reasoningResult.remedies.find(
        (r) => r.representation_id === c.representation_id
      )?.available_remedies ?? [],
    key_facts: [] as readonly string[],
    citations: c.node_evaluations.flatMap((e) => e.citations_applied),
    confidence: c.confidence,
    audit_trail_hash: randomUUID(),
  }));
}

function buildCaseSummary(
  bundle: FactBundle,
  reasoningResult: ReasoningResult,
  validationResult: ValidationResult
): CaseSummary {
  const classificationValues = reasoningResult.classifications.map(
    (c) => c.classification
  );
  const uniqueClassifications = [
    ...new Set(classificationValues),
  ] as readonly MisrepresentationClass[];

  let strongestClaim: MisrepresentationClass | null = null;
  for (const priority of CLASSIFICATION_PRIORITY) {
    if (uniqueClassifications.includes(priority)) {
      strongestClaim = priority;
      break;
    }
  }

  return {
    total_representations: bundle.representations.length,
    classifications_found: uniqueClassifications,
    strongest_claim: strongestClaim,
    rescission_available: reasoningResult.remedies.some((r) =>
      r.available_remedies.includes('RESCISSION')
    ),
    damages_available: reasoningResult.remedies.some((r) =>
      r.available_remedies.some((rem) => rem.startsWith('DAMAGES'))
    ),
    any_bars_apply: reasoningResult.remedies.some(
      (r) => r.barred_remedies.length > 0
    ),
    requires_further_facts:
      reasoningResult.multi_path_results !== null ||
      validationResult.multi_path_required,
  };
}

// ─── ORCHESTRATOR ───────────────────────────────────────────────────────────

export async function analyse(
  request: AnalyseRequest,
  crgDir: string
): Promise<FinalReport> {
  logger.info('orchestrator/orchestrator', {
    case_id: request.case_id,
    document_count: request.documents.length,
  });

  try {
    // Step 1: Load CRG
    const nodes = await loadCRG(crgDir);
    const graph = buildGraph(nodes);

    // Step 2: Validate request has documents
    if (request.documents.length === 0) {
      const validationResult: ValidationResult = {
        valid: false,
        errors: [
          {
            field: 'documents',
            representation_id: null,
            message: 'At least one document is required',
            code: 'MISSING_REQUIRED_FIELD',
          },
        ],
        warnings: [],
        multi_path_required: false,
        validated_at: new Date().toISOString(),
      };

      const emptyBundle: FactBundle = {
        case_id: request.case_id,
        extracted_at: new Date().toISOString(),
        representations: [],
        contract_formed: null,
        governing_law: 'Singapore',
        extraction_model: 'none-mvp',
        raw_documents: [],
      };

      const reasoningResult = emptyReasoningResult(request.case_id);
      const firewallSummary = emptyFirewallSummary(request.case_id);

      logger.info('orchestrator/orchestrator', {
        case_id: request.case_id,
        valid: false,
        classification_count: 0,
      });

      return {
        report_id: randomUUID(),
        case_id: request.case_id,
        generated_at: new Date().toISOString(),
        fact_bundle: emptyBundle,
        validation_result: validationResult,
        reasoning_result: reasoningResult,
        firewall_summary: firewallSummary,
        representation_summaries: [],
        case_summary: buildCaseSummary(
          emptyBundle,
          reasoningResult,
          validationResult
        ),
      };
    }

    // Step 3: Build FactBundle (MVP — no LLM extraction yet)
    const bundle: FactBundle = {
      case_id: request.case_id,
      extracted_at: new Date().toISOString(),
      representations: [],
      contract_formed: null,
      governing_law: 'Singapore',
      extraction_model: 'none-mvp',
      raw_documents: request.documents.map((d) => d.filename),
    };

    // Step 4: Validate
    const validationResult = validate(bundle);
    if (!validationResult.valid) {
      const reasoningResult = emptyReasoningResult(request.case_id);
      const firewallSummary = emptyFirewallSummary(request.case_id);

      logger.info('orchestrator/orchestrator', {
        case_id: request.case_id,
        valid: false,
        classification_count: 0,
      });

      return {
        report_id: randomUUID(),
        case_id: request.case_id,
        generated_at: new Date().toISOString(),
        fact_bundle: bundle,
        validation_result: validationResult,
        reasoning_result: reasoningResult,
        firewall_summary: firewallSummary,
        representation_summaries: [],
        case_summary: buildCaseSummary(
          bundle,
          reasoningResult,
          validationResult
        ),
      };
    }

    // Step 5: Reason
    const reasoningResult = reason(bundle, graph);

    // Step 6: Protect
    const { protected: protectedResult, summary } = protect(reasoningResult);

    // Step 7: Assemble FinalReport
    const representationSummaries = buildRepresentationSummaries(
      bundle,
      protectedResult
    );
    const caseSummary = buildCaseSummary(
      bundle,
      protectedResult,
      validationResult
    );

    logger.info('orchestrator/orchestrator', {
      case_id: request.case_id,
      valid: true,
      classification_count: protectedResult.classifications.length,
    });

    return {
      report_id: randomUUID(),
      case_id: request.case_id,
      generated_at: new Date().toISOString(),
      fact_bundle: bundle,
      validation_result: validationResult,
      reasoning_result: protectedResult,
      firewall_summary: summary,
      representation_summaries: representationSummaries,
      case_summary: caseSummary,
    };
  } catch (e: unknown) {
    logger.error('orchestrator/orchestrator', e);
    throw e;
  }
}
