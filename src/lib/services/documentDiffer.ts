/**
 * Document Differ Service
 * Diffs two ProseMirror JSON documents at the character level.
 */

import DiffMatchPatch from 'diff-match-patch';
import type { ProseMirrorJSON } from './documentParser';

const dmp = new DiffMatchPatch();

// Re-export for use elsewhere
export type { ProseMirrorJSON };

// Diff operation types
const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

// --- Types ---

export interface DiffSegment {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface DiffResult {
  /** Character-level diff segments */
  segments: DiffSegment[];
  /** Full text from original document */
  textA: string;
  /** Full text from new document */
  textB: string;
  /** Human-readable summary */
  summary: string[];
}

// --- Utility Functions ---

/**
 * Extract text content from a ProseMirror node recursively.
 */
function extractTextContent(node: ProseMirrorJSON): string {
  if (!node) return '';

  if (node.type === 'text' && node.text) {
    return node.text;
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextContent).join('');
  }

  return '';
}

// --- Main Export ---

/**
 * Diff two ProseMirror JSON documents at the character level.
 * Compares entire document text for accurate change detection.
 */
export function diffDocuments(
  docA: ProseMirrorJSON,
  docB: ProseMirrorJSON
): DiffResult {
  // Extract full text from both documents
  const textA = extractTextContent(docA);
  const textB = extractTextContent(docB);

  console.log(`Diffing full text: ${textA.length} chars in A, ${textB.length} chars in B`);

  // Perform character-level diff on the entire document
  const diffs = dmp.diff_main(textA, textB);
  dmp.diff_cleanupSemantic(diffs);

  // Convert to our DiffSegment format
  const segments: DiffSegment[] = [];
  let insertCount = 0;
  let deleteCount = 0;

  for (const [op, text] of diffs) {
    if (op === DIFF_EQUAL) {
      segments.push({ type: 'equal', text });
    } else if (op === DIFF_INSERT) {
      segments.push({ type: 'insert', text });
      insertCount++;
    } else if (op === DIFF_DELETE) {
      segments.push({ type: 'delete', text });
      deleteCount++;
    }
  }

  // Log the actual changes found
  console.log(`Found ${segments.length} segments: ${insertCount} insertions, ${deleteCount} deletions`);
  
  // Log first few non-equal segments for debugging
  const changedSegments = segments.filter(s => s.type !== 'equal');
  if (changedSegments.length > 0) {
    console.log('Changed segments:', changedSegments.map(s => ({
      type: s.type,
      text: s.text.length > 50 ? s.text.substring(0, 50) + '...' : s.text,
    })));
  }

  // Build summary
  const summary: string[] = [];
  if (insertCount > 0) {
    summary.push(`${insertCount} insertion(s)`);
  }
  if (deleteCount > 0) {
    summary.push(`${deleteCount} deletion(s)`);
  }
  if (insertCount === 0 && deleteCount === 0) {
    summary.push('No text changes detected');
  }

  return {
    segments,
    textA,
    textB,
    summary,
  };
}
