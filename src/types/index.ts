/**
 * src/types/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CANONICAL TYPE DEFINITIONS — Single Source of Truth
 *
 * ALL modules import from here. NEVER redefine these elsewhere.
 * Changes to this file require architect review.
 *
 * Law: LLM calls are ONLY permitted in src/extraction/
 *      Everything else is deterministic — no LLM calls.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ─── ENUMERATIONS ────────────────────────────────────────────────────────────

/** Misrepresentation classification under Singapore Misrepresentation Act 1967 */
export type MisrepresentationClass =
  | 'FRAUDULENT'          // s.2 — knowingly false or reckless
  | 'NEGLIGENT_COMMON_LAW'// Hedley Byrne duty of care
  | 'NEGLIGENT_STATUTORY' // s.2(1) — cannot prove reasonable belief
  | 'INNOCENT'            // s.2(2) — reasonable belief, no negligence
  | 'NOT_ESTABLISHED';    // insufficient facts to classify

/** Available remedies */
export type RemedyType =
  | 'RESCISSION'
  | 'DAMAGES_IN_LIEU'     // s.2(2) court discretion
  | 'DAMAGES_TORTIOUS'    // fraudulent / negligent CL
  | 'DAMAGES_STATUTORY'   // s.2(1)
  | 'INDEMNITY'
  | 'NONE';

/** Whether a representation was true, false, or ambiguous */
export type TruthValue = 'TRUE' | 'FALSE' | 'PARTIALLY_FALSE' | 'UNKNOWN';

/** Confidence level from LLM extraction — used only in FactBundle */
export type ExtractionConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'ABSENT';

/** Node evaluation outcome */
export type NodeOutcome = 'SATISFIED' | 'NOT_SATISFIED' | 'ABSTAINED' | 'PENDING';

/** Reasoning path type — normal vs alternative when facts are ambiguous */
export type PathType = 'PRIMARY' | 'ALTERNATIVE';

// ─── KNOWLEDGE LAYER ─────────────────────────────────────────────────────────

/**
 * A single node in the Conditional Reasoning Graph (CRG).
 * Loaded from YAML files in knowledge/misrepresentation/
 * NEVER modified at runtime — treat as immutable after load.
 */
export interface TreeNode {
  readonly id: string;                    // e.g. "E1", "C2", "R3"
  readonly name: string;                  // human-readable label
  readonly layer: CRGLayer;
  readonly prerequisites: readonly string[]; // IDs of nodes that must be evaluated first
  readonly required_facts: readonly string[]; // FactBundle keys this node reads
  readonly predicate: string;             // deterministic rule description
  readonly conclusion: string;            // what it means if SATISFIED
  readonly burden: BurdenOfProof;
  readonly modality: RuleModality;
  readonly protected: boolean;            // if true: Validation Firewall applies
  readonly citations: readonly string[];  // statutory / case law references
  readonly abstention_policy: AbstentionPolicy;
}

/** Layers of the Conditional Reasoning Graph */
export type CRGLayer =
  | 'ELEMENTS'     // E-nodes: did a representation occur?
  | 'CLASSIFICATION'// C-nodes: what type of misrepresentation?
  | 'REMEDIES'     // R-nodes: what relief is available?
  | 'BARS'         // B-nodes: is relief barred?

export type BurdenOfProof = 'CLAIMANT' | 'DEFENDANT' | 'COURT';
export type RuleModality = 'MUST' | 'SHOULD' | 'MAY';
export type AbstentionPolicy = 'STRICT' | 'PERMISSIVE';

// ─── EXTRACTION LAYER ────────────────────────────────────────────────────────

/**
 * A single extracted fact about one representation.
 * Produced exclusively by src/extraction/ via LLM structured call.
 * Immutable once created — reasoning layer reads but never writes.
 */
export interface RepresentationFact {
  readonly id: string;                    // e.g. "R1", "R2", "R3"
  readonly statement: string;             // verbatim or close paraphrase from document
  readonly maker: string;                 // who made the representation
  readonly recipient: string;             // to whom
  readonly context: string;              // circumstances (pre-contract, during negotiation, etc.)
  readonly truth_value: TruthValue;
  readonly maker_knowledge: MakerKnowledge;
  readonly induced_contract: boolean | null;
  readonly source_document: string;       // filename / document title
  readonly source_location: string;       // page, paragraph, section
  readonly extraction_confidence: ExtractionConfidence;
  readonly extraction_notes: string;      // LLM commentary on uncertainty
  readonly evidence_of_falsity?: string;   // evidence supporting falsity finding
}

export type MakerKnowledge =
  | 'KNEW_FALSE'
  | 'RECKLESS'
  | 'NO_REASONABLE_BELIEF'
  | 'REASONABLE_BELIEF'
  | 'UNKNOWN';

/**
 * Full output of the extraction layer.
 * This is the boundary object between LLM territory and deterministic territory.
 * After FactBundle is produced, no further LLM calls occur in the reasoning pipeline.
 */
export interface FactBundle {
  readonly case_id: string;
  readonly extracted_at: string;          // ISO timestamp
  readonly representations: readonly RepresentationFact[];
  readonly contract_formed: boolean | null;
  readonly governing_law: string;         // "Singapore" for MA 1967 scope
  readonly loss_amount?: number | null;    // total loss in SGD, if quantified
  readonly extraction_model: string;      // model identifier used
  readonly raw_documents: readonly string[]; // list of filenames processed
}

// ─── VALIDATION LAYER ────────────────────────────────────────────────────────

/**
 * Result of validating a FactBundle before reasoning begins.
 * Produced by src/validation/ — pure deterministic functions.
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
  readonly multi_path_required: boolean;  // true if ambiguous facts trigger branching
  readonly validated_at: string;          // ISO timestamp
}

export interface ValidationError {
  readonly field: string;
  readonly representation_id: string | null;
  readonly message: string;
  readonly code: ValidationErrorCode;
}

export interface ValidationWarning {
  readonly field: string;
  readonly representation_id: string | null;
  readonly message: string;
}

export type ValidationErrorCode =
  | 'MISSING_REQUIRED_FIELD'
  | 'INVALID_ENUM_VALUE'
  | 'CONFLICTING_FACTS'
  | 'OUT_OF_SCOPE'             // e.g. governing_law not Singapore
  | 'NO_REPRESENTATIONS_FOUND';

// ─── REASONING LAYER ─────────────────────────────────────────────────────────

/**
 * The outcome of evaluating a single CRG node.
 * Produced by src/reasoning/ — purely deterministic.
 */
export interface NodeEvaluation {
  readonly node_id: string;
  readonly node_name: string;
  readonly layer: CRGLayer;
  readonly outcome: NodeOutcome;
  readonly facts_used: Readonly<Record<string, unknown>>;
  readonly reasoning_trace: string;       // human-readable deterministic explanation
  readonly citations_applied: readonly string[];
  readonly evaluated_at: string;          // ISO timestamp
}

/**
 * Classification result for a single representation.
 */
export interface ClassificationResult {
  readonly representation_id: string;
  readonly classification: MisrepresentationClass;
  readonly confidence: 'CERTAIN' | 'PROBABLE' | 'POSSIBLE'; // based on fact completeness
  readonly node_evaluations: readonly NodeEvaluation[];
  readonly path_type: PathType;
}

/**
 * Remedy analysis for a single representation.
 */
export interface RemedyResult {
  readonly representation_id: string;
  readonly available_remedies: readonly RemedyType[];
  readonly barred_remedies: readonly BarredRemedy[];
  readonly node_evaluations: readonly NodeEvaluation[];
}

export interface BarredRemedy {
  readonly remedy: RemedyType;
  readonly bar_node_id: string;           // which B-node triggered the bar
  readonly reason: string;
}

/**
 * Full reasoning result for one case across all representations.
 * This is the output of src/reasoning/ — immutable, hashable.
 */
export interface ReasoningResult {
  readonly case_id: string;
  readonly reasoned_at: string;           // ISO timestamp
  readonly classifications: readonly ClassificationResult[];
  readonly remedies: readonly RemedyResult[];
  readonly all_node_evaluations: readonly NodeEvaluation[];
  readonly multi_path_results: readonly MultiPathResult[] | null;
}

/**
 * When facts are ambiguous, reasoning produces multiple paths.
 * Each path represents a complete reasoning chain under different fact assumptions.
 */
export interface MultiPathResult {
  readonly path_id: string;              // e.g. "PATH_A", "PATH_B"
  readonly path_type: PathType;
  readonly assumption: string;           // what ambiguous fact was assumed
  readonly classifications: readonly ClassificationResult[];
  readonly remedies: readonly RemedyResult[];
}

// ─── VALIDATION FIREWALL ─────────────────────────────────────────────────────

/**
 * Record produced by the Validation Firewall for each protected field.
 * SHA-256 hash computed before LLM explanation is generated.
 * Verified after. Mismatch = revert to raw reasoning result.
 */
export interface FirewallRecord {
  readonly field_id: string;             // e.g. "classification.R1", "remedy.R1.available"
  readonly protected_value: string;      // the deterministic value being protected
  readonly hash_before: string;          // SHA-256 hex of protected_value
  readonly hash_after: string | null;    // set after explanation generated + re-extracted
  readonly verified: boolean | null;     // null = not yet verified
  readonly verified_at: string | null;   // ISO timestamp
  readonly reverted: boolean;            // true if mismatch detected and reverted
}

export interface FirewallSummary {
  readonly case_id: string;
  readonly records: readonly FirewallRecord[];
  readonly all_verified: boolean;
  readonly revert_count: number;
  readonly summary_hash: string;         // SHA-256 of all hash_before values concatenated
}

// ─── FINAL REPORT ────────────────────────────────────────────────────────────

/**
 * The complete structured output of the Reasonex misrepresentation engine.
 * This is what the API returns. Immutable after production.
 */
export interface FinalReport {
  readonly report_id: string;
  readonly case_id: string;
  readonly generated_at: string;         // ISO timestamp
  readonly fact_bundle: FactBundle;
  readonly validation_result: ValidationResult;
  readonly reasoning_result: ReasoningResult;
  readonly firewall_summary: FirewallSummary;

  /** Per-representation summary rows for report rendering */
  readonly representation_summaries: readonly RepresentationSummary[];

  /** Overall case disposition */
  readonly case_summary: CaseSummary;
}

export interface RepresentationSummary {
  readonly id: string;
  readonly statement: string;
  readonly classification: MisrepresentationClass;
  readonly available_remedies: readonly RemedyType[];
  readonly key_facts: readonly string[];
  readonly citations: readonly string[];
  readonly confidence: 'CERTAIN' | 'PROBABLE' | 'POSSIBLE';
  readonly audit_trail_hash: string;     // hash of full NodeEvaluation chain for this rep
}

export interface CaseSummary {
  readonly total_representations: number;
  readonly classifications_found: readonly MisrepresentationClass[];
  readonly strongest_claim: MisrepresentationClass | null;
  readonly rescission_available: boolean;
  readonly damages_available: boolean;
  readonly any_bars_apply: boolean;
  readonly requires_further_facts: boolean;
}

// ─── API LAYER ───────────────────────────────────────────────────────────────

/** Request body for POST /analyse */
export interface AnalyseRequest {
  readonly case_id: string;
  readonly documents: readonly DocumentInput[];
}

export interface DocumentInput {
  readonly filename: string;
  readonly content: string;              // plain text extracted from document
  readonly doc_type: DocumentType;
}

export type DocumentType =
  | 'CONTRACT'
  | 'EMAIL'
  | 'STATEMENT'
  | 'BROCHURE'
  | 'AFFIDAVIT'
  | 'OTHER';

/** Standard API response envelope */
export interface ApiResponse<T> {
  readonly success: boolean;
  readonly data: T | null;
  readonly error: ApiError | null;
  readonly request_id: string;
  readonly timestamp: string;
}

export interface ApiError {
  readonly code: string;
  readonly message: string;
  readonly details: unknown;
}

// ─── PIPELINE 1 — KNOWLEDGE INGESTION ──────────────────────────────────────

/** A single section extracted from a statute PDF */
export interface StatuteSection {
  readonly section_number: string;    // e.g. "2", "2(1)", "3"
  readonly heading: string;           // section title if present, empty string if not
  readonly text: string;              // full verbatim text of the section
  readonly source_document: string;   // filename of source PDF
  readonly page: number | null;       // page number in source, null if unknown
}

/** Full parsed output of a statute document */
export interface ParsedStatute {
  readonly title: string;             // e.g. "Misrepresentation Act 1967"
  readonly jurisdiction: string;      // "Singapore"
  readonly cap: string;               // e.g. "Cap. 390"
  readonly parsed_at: string;         // ISO timestamp
  readonly sections: readonly StatuteSection[];
  readonly source_document: string;
}

/** Full parsed output of a judgment document */
export interface ParsedJudgment {
  readonly case_name: string;         // e.g. "Derry v Peek"
  readonly citation: string;          // e.g. "[1889] UKHL 1"
  readonly court: string;             // e.g. "House of Lords"
  readonly year: number;
  readonly jurisdiction: string;      // "SG" | "UK" | "other"
  readonly parsed_at: string;         // ISO timestamp
  readonly full_text: string;         // full extracted text
  readonly source_document: string;
}

/** Extracted ratio decidendi from a judgment */
export interface RatioDecidendi {
  readonly judgment_citation: string;
  readonly ratio_text: string;        // verbatim or close paraphrase of the ratio
  readonly principle: string;         // one-sentence summary of legal principle
  readonly candidate_node_ids: readonly string[]; // CRG node IDs this may affect
  readonly extraction_confidence: ExtractionConfidence; // reuse existing enum
  readonly extraction_notes: string;
}

/** Source type for a proposed rule */
export type RuleSource = 'STATUTE' | 'JUDGMENT';

/** A CRG rule proposed by Pipeline 1 for human review */
export interface ProposedRule {
  readonly proposal_id: string;       // UUID
  readonly source_type: RuleSource;
  readonly source_reference: string;  // section number (1A) or citation (1B)
  readonly proposed_at: string;       // ISO timestamp
  readonly proposed_yaml: string;     // full YAML content as raw string
  readonly node_preview: TreeNode;    // structured preview — reuse existing TreeNode
  readonly rationale: string;         // LLM explanation of why this rule was proposed
  readonly candidate_affects: readonly string[]; // IDs of existing nodes potentially affected
  readonly extraction_confidence: ExtractionConfidence;
}

/** Human reviewer decision on a proposed rule */
export type ReviewDecision = 'APPROVED' | 'REJECTED' | 'AMENDED';

/** A proposed rule after human review */
export interface ReviewedRule {
  readonly proposal_id: string;
  readonly decision: ReviewDecision;
  readonly reviewed_at: string;       // ISO timestamp
  readonly reviewer_notes: string;    // human's comments — empty string if none
  readonly final_yaml: string;        // proposed_yaml if APPROVED, amended content if AMENDED
}

/** A batch of proposed rules submitted for human review */
export interface ReviewBatch {
  readonly batch_id: string;
  readonly created_at: string;        // ISO timestamp
  readonly source_type: RuleSource;
  readonly proposals: readonly ProposedRule[];
}

/** Result of reviewing a full batch */
export interface ReviewBatchResult {
  readonly batch_id: string;
  readonly completed_at: string;      // ISO timestamp
  readonly decisions: readonly ReviewedRule[];
  readonly approved_count: number;
  readonly rejected_count: number;
  readonly amended_count: number;
}

/** Record of a single approved rule written to disk */
export interface CommitRecord {
  readonly proposal_id: string;
  readonly node_id: string;           // the id field from the approved TreeNode
  readonly yaml_filename: string;     // e.g. "E2-statement-of-fact.yaml"
  readonly written_at: string;        // ISO timestamp
}

/** Result of committing a batch of approved rules */
export interface CommitResult {
  readonly batch_id: string;
  readonly committed_at: string;      // ISO timestamp
  readonly records: readonly CommitRecord[];
  readonly success_count: number;
  readonly failed: readonly CommitFailure[];
}

/** A single commit failure */
export interface CommitFailure {
  readonly proposal_id: string;
  readonly error: string;
}
