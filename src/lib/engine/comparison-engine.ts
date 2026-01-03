/**
 * Comparison Engine
 * Orchestrates the full document comparison workflow.
 */

import type { DocumentModel, ChangeSet } from '@/lib/types';
import { extractDocumentModel, extractDocumentModelFromJson } from '@/lib/adapters';
import { compareDocuments } from '@/lib/core';
import { applyChangeSet } from '@/lib/adapters';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuperDocInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorInstance = any;

export interface ComparisonResult {
  changeSet: ChangeSet;
  v1Model: DocumentModel;
  v2Model: DocumentModel;
}

/**
 * Compare two documents using their editor instances.
 */
export function compareEditors(
  v1Editor: EditorInstance,
  v2Editor: EditorInstance
): ComparisonResult {
  // Extract document models
  const v1Model = extractDocumentModel(v1Editor);
  const v2Model = extractDocumentModel(v2Editor);

  // Compare documents
  const changeSet = compareDocuments(v1Model, v2Model);

  return {
    changeSet,
    v1Model,
    v2Model,
  };
}

/**
 * Compare two documents using their ProseMirror JSON.
 */
export function compareJson(
  v1Json: { type: string; content?: unknown[] },
  v2Json: { type: string; content?: unknown[] }
): ComparisonResult {
  // Extract document models from JSON
  const v1Model = extractDocumentModelFromJson(v1Json);
  const v2Model = extractDocumentModelFromJson(v2Json);

  // Compare documents
  const changeSet = compareDocuments(v1Model, v2Model);

  return {
    changeSet,
    v1Model,
    v2Model,
  };
}

/**
 * Full comparison workflow: compare and apply changes.
 */
export async function runComparison(
  superdoc: SuperDocInstance,
  v1Editor: EditorInstance,
  v2Model: DocumentModel
): Promise<ComparisonResult> {
  // Extract V1 model from active editor
  const v1Model = extractDocumentModel(v1Editor);

  // Compare documents
  const changeSet = compareDocuments(v1Model, v2Model);

  // Apply changes to V1 editor in suggesting mode
  await applyChangeSet(superdoc, v1Editor, changeSet);

  return {
    changeSet,
    v1Model,
    v2Model,
  };
}

/**
 * Generate a text-based diff summary for display.
 */
export function generateDiffSummaryText(changeSet: ChangeSet): string {
  const { summary } = changeSet;
  const lines: string[] = [];

  lines.push('Changes in the new version include:');
  lines.push('');

  for (const highlight of summary.highlights) {
    lines.push(`• ${highlight}`);
  }

  if (summary.highlights.length === 0) {
    lines.push('• No significant changes detected');
  }

  return lines.join('\n');
}

