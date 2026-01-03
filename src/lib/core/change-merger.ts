/**
 * Change Merger Module
 * Combines all change types into a unified ChangeSet.
 */

import type {
  ChangeSet,
  TextChange,
  FormatChange,
  ParagraphChange,
  ChangeSummary,
  DocumentModel,
  AlignmentResult,
} from '@/lib/types';
import { computeParagraphTextDiff } from './text-diff';
import { computeFormatDiff } from './format-diff';
import { alignParagraphsFuzzy } from './paragraph-aligner';

/**
 * Generate a human-readable summary of changes.
 */
function generateSummary(
  textChanges: TextChange[],
  formatChanges: FormatChange[],
  paragraphChanges: ParagraphChange[]
): ChangeSummary {
  const highlights: string[] = [];

  // Count by type
  const insertions = textChanges.filter((c) => c.type === 'insert').length;
  const deletions = textChanges.filter((c) => c.type === 'delete').length;
  const paragraphsAdded = paragraphChanges.filter((c) => c.type === 'insert').length;
  const paragraphsRemoved = paragraphChanges.filter((c) => c.type === 'delete').length;

  // Generate highlights
  if (paragraphsAdded > 0) {
    highlights.push(`${paragraphsAdded} new paragraph${paragraphsAdded > 1 ? 's' : ''} added`);
  }

  if (paragraphsRemoved > 0) {
    highlights.push(`${paragraphsRemoved} paragraph${paragraphsRemoved > 1 ? 's' : ''} removed`);
  }

  if (insertions > 0) {
    const totalInsertedChars = textChanges
      .filter((c) => c.type === 'insert')
      .reduce((sum, c) => sum + c.text.length, 0);
    highlights.push(`${totalInsertedChars} character${totalInsertedChars > 1 ? 's' : ''} inserted`);
  }

  if (deletions > 0) {
    const totalDeletedChars = textChanges
      .filter((c) => c.type === 'delete')
      .reduce((sum, c) => sum + c.text.length, 0);
    highlights.push(`${totalDeletedChars} character${totalDeletedChars > 1 ? 's' : ''} deleted`);
  }

  if (formatChanges.length > 0) {
    // Summarize format changes by type
    const formatTypes = new Set<string>();
    for (const fc of formatChanges) {
      for (const mark of fc.addMarks) {
        formatTypes.add(mark.type);
      }
      for (const mark of fc.removeMarks) {
        formatTypes.add(mark.type);
      }
    }
    if (formatTypes.size > 0) {
      highlights.push(`Formatting changed: ${Array.from(formatTypes).join(', ')}`);
    }
  }

  return {
    totalChanges: textChanges.length + formatChanges.length + paragraphChanges.length,
    insertions,
    deletions,
    formatChanges: formatChanges.length,
    paragraphsAdded,
    paragraphsRemoved,
    highlights,
  };
}

/**
 * Merge all changes from aligned paragraphs into a ChangeSet.
 */
export function mergeChanges(
  alignmentResults: AlignmentResult[]
): ChangeSet {
  const textChanges: TextChange[] = [];
  const formatChanges: FormatChange[] = [];
  const paragraphChanges: ParagraphChange[] = [];

  for (const result of alignmentResults) {
    if (result.type === 'match') {
      // Same paragraph structure, check for content/format changes
      const textDiff = computeParagraphTextDiff(result.v1, result.v2);
      textChanges.push(...textDiff);

      // Check for format changes on equal text
      const formatDiff = computeFormatDiff(result.v1, result.v2);
      formatChanges.push(...formatDiff);
    } else if (result.type === 'delete') {
      // Entire paragraph deleted
      paragraphChanges.push({
        type: 'delete',
        paragraph: result.v1,
      });
    } else if (result.type === 'insert') {
      // Entire paragraph inserted
      paragraphChanges.push({
        type: 'insert',
        paragraph: result.v2,
        insertAfterIndex: result.v2.index > 0 ? result.v2.index - 1 : undefined,
      });
    }
  }

  const summary = generateSummary(textChanges, formatChanges, paragraphChanges);

  return {
    textChanges,
    formatChanges,
    paragraphChanges,
    summary,
  };
}

/**
 * Compare two documents and produce a complete ChangeSet.
 */
export function compareDocuments(
  v1Doc: DocumentModel,
  v2Doc: DocumentModel
): ChangeSet {
  // Align paragraphs with fuzzy matching
  const alignment = alignParagraphsFuzzy(v1Doc.paragraphs, v2Doc.paragraphs);

  // Merge all changes
  return mergeChanges(alignment);
}

