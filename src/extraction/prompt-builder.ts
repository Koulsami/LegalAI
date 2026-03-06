/**
 * src/extraction/prompt-builder.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Builds the structured extraction prompt for Gemini.
 * Pure function — no side effects, no I/O, no LLM calls.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { TreeNode, DocumentInput } from '../types';

const WILDCARD_PREFIX = 'representations[*].';

/**
 * Builds a prompt that instructs Gemini to extract structured facts
 * from the provided documents, matching the FactBundle schema.
 */
export function buildExtractionPrompt(
  nodes: readonly TreeNode[],
  documents: readonly DocumentInput[]
): string {
  // Collect all unique required_facts across the CRG
  const allFacts = new Set<string>();
  for (const node of nodes) {
    for (const fact of node.required_facts) {
      allFacts.add(fact);
    }
  }

  // Separate wildcard (per-representation) from scalar (case-level) facts
  const repFacts: string[] = [];
  const scalarFacts: string[] = [];
  for (const fact of allFacts) {
    if (fact.startsWith(WILDCARD_PREFIX)) {
      repFacts.push(fact.substring(WILDCARD_PREFIX.length));
    } else {
      scalarFacts.push(fact);
    }
  }

  // Build document section
  const documentSections = documents.map(
    (doc, i) =>
      `═══ DOCUMENT ${i + 1}: ${doc.filename} (type: ${doc.doc_type}) ═══\n${doc.content}\n═══ END DOCUMENT ${i + 1} ═══`
  ).join('\n\n');

  return `You are a legal fact extraction system for Singapore misrepresentation law analysis.

Your task is to carefully read the provided documents and extract structured facts about any representations (statements) made by one party to another that may constitute misrepresentation under Singapore's Misrepresentation Act 1967.

INSTRUCTIONS:
1. Read all provided documents carefully.
2. Identify every distinct representation made by one party to another — label them R1, R2, R3, etc.
3. For each representation, extract every representation-level fact listed below.
4. Extract case-level (scalar) facts once for the entire case.
5. Return ONLY valid JSON — no prose, no markdown, no code fences.
6. For every extracted value, assess extraction_confidence: HIGH | MEDIUM | LOW | ABSENT.
7. Mark unknown facts explicitly as null — never invent or infer values.
8. For evidence_of_falsity: extract verbatim quotes or close paraphrases from the documents that show the statement was false. If no evidence of falsity is found, set to null.

REPRESENTATION-LEVEL FACTS TO EXTRACT:
${repFacts.map((f) => `  - ${f}`).join('\n')}

CASE-LEVEL FACTS TO EXTRACT:
${scalarFacts.map((f) => `  - ${f}`).join('\n')}

OUTPUT JSON SCHEMA — return exactly this structure:
{
  "case_id": "string — use the document context to derive a short identifier",
  "governing_law": "string — must be 'Singapore' or null if unclear",
  "contract_formed": "boolean or null — was a contract formed based on the representations?",
  "loss_amount": "number in SGD or null — total quantifiable loss if mentioned",
  "representations": [
    {
      "id": "R1",
      "statement": "verbatim or close paraphrase of the representation",
      "maker": "who made the statement",
      "recipient": "who received the statement",
      "context": "circumstances of the statement (pre-contract, during negotiation, etc.)",
      "truth_value": "TRUE | FALSE | PARTIALLY_FALSE | UNKNOWN",
      "maker_knowledge": "KNEW_FALSE | RECKLESS | NO_REASONABLE_BELIEF | REASONABLE_BELIEF | UNKNOWN",
      "induced_contract": "true | false | null",
      "evidence_of_falsity": "string — verbatim quotes or close paraphrases showing falsity, or null",
      "source_document": "filename of the source document",
      "source_location": "page, clause, or paragraph reference",
      "extraction_confidence": "HIGH | MEDIUM | LOW | ABSENT",
      "extraction_notes": "any uncertainty or ambiguity in the extraction"
    }
  ]
}

CRITICAL RULES:
- Each representation must be a distinct statement — do not merge multiple statements into one.
- truth_value must reflect the objective truth based on all documents, not what the maker claimed.
- maker_knowledge reflects what the maker knew or should have known at the time of making the statement.
- Use UNKNOWN when evidence is insufficient to determine a value — never guess.
- extraction_notes must explain any uncertainty or ambiguity.

DOCUMENTS:

${documentSections}

Return ONLY the JSON object. No other text.`;
}
