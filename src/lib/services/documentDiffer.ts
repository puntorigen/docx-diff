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

export interface TextChange {
  type: 'insert' | 'delete';
  text: string;
  from: number;
  to: number;
}

export interface FormatChange {
  from: number;
  to: number;
  text: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  before: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  after: any[];
}

export interface ParagraphDiff {
  index: number;
  node: ProseMirrorJSON;
  textContent: string;
}

export interface ModifiedParagraph {
  indexA: number;
  indexB: number;
  nodeA: ProseMirrorJSON;
  nodeB: ProseMirrorJSON;
  textChanges: TextChange[];
  formatChanges: FormatChange[];
}

export interface DiffResult {
  // Character-level diff segments
  segments: DiffSegment[];
  // Full text from both documents
  textA: string;
  textB: string;
  // Legacy fields for compatibility
  insertedParagraphs: ParagraphDiff[];
  deletedParagraphs: ParagraphDiff[];
  modifiedParagraphs: ModifiedParagraph[];
  // Summary
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

/**
 * Extract paragraph-like nodes from a document.
 */
function extractParagraphs(
  doc: ProseMirrorJSON
): { node: ProseMirrorJSON; text: string; hash: string }[] {
  const paragraphs: { node: ProseMirrorJSON; text: string; hash: string }[] = [];

  function traverse(node: ProseMirrorJSON) {
    if (!node) return;

    // Paragraph-like nodes
    if (
      node.type === 'paragraph' ||
      node.type === 'heading' ||
      node.type === 'listItem'
    ) {
      const text = extractTextContent(node);
      paragraphs.push({
        node,
        text,
        hash: hashString(text),
      });
    }

    // Recurse into content
    if (node.content && Array.isArray(node.content)) {
      for (const child of node.content) {
        traverse(child);
      }
    }
  }

  traverse(doc);
  return paragraphs;
}

/**
 * Position-based paragraph alignment.
 * For documents with the same structure, match paragraphs by their position.
 * This is simpler and more accurate for typical document comparisons.
 */
function alignParagraphs(
  parasA: { hash: string; text: string }[],
  parasB: { hash: string; text: string }[]
): { matchedA: Set<number>; matchedB: Set<number>; matches: [number, number][] } {
  const matches: [number, number][] = [];
  const matchedA = new Set<number>();
  const matchedB = new Set<number>();

  // Simple position-based matching: pair paragraphs by index
  // This works well when documents have the same structure
  const minLen = Math.min(parasA.length, parasB.length);
  
  for (let i = 0; i < minLen; i++) {
    matches.push([i, i]);
    matchedA.add(i);
    matchedB.add(i);
  }

  // Any extra paragraphs in A are deletions (unmatched)
  // Any extra paragraphs in B are insertions (unmatched)
  // These are handled by the caller checking which indices aren't in matchedA/matchedB

  return { matchedA, matchedB, matches };
}

/**
 * Compute text diff between two strings.
 */
function computeTextDiff(textA: string, textB: string): TextChange[] {
  const changes: TextChange[] = [];
  const diffs = dmp.diff_main(textA, textB);
  dmp.diff_cleanupSemantic(diffs);

  let posA = 0;

  for (const [op, text] of diffs) {
    if (op === DIFF_DELETE) {
      changes.push({
        type: 'delete',
        text,
        from: posA,
        to: posA + text.length,
      });
      posA += text.length;
    } else if (op === DIFF_INSERT) {
      changes.push({
        type: 'insert',
        text,
        from: posA,
        to: posA,
      });
    } else if (op === DIFF_EQUAL) {
      posA += text.length;
    }
  }

  return changes;
}

/**
 * Deep compare two values.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!deepEqual(a[key], b[key])) return false;
  }

  return true;
}

/**
 * Compare marks between two nodes to detect format changes.
 */
function compareMarks(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marksA: any[] = [],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  marksB: any[] = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { before: any[]; after: any[] } | null {
  // Normalize marks
  const normA = marksA.map((m) => ({ type: m.type, attrs: m.attrs || {} }));
  const normB = marksB.map((m) => ({ type: m.type, attrs: m.attrs || {} }));

  // Check if marks are equal
  if (deepEqual(normA, normB)) {
    return null;
  }

  // Find differences
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const before: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const after: any[] = [];

  // Marks in A but not in B (removed)
  for (const markA of normA) {
    const match = normB.find(
      (m) => m.type === markA.type && deepEqual(m.attrs, markA.attrs)
    );
    if (!match) {
      before.push(markA);
    }
  }

  // Marks in B but not in A (added)
  for (const markB of normB) {
    const match = normA.find(
      (m) => m.type === markB.type && deepEqual(m.attrs, markB.attrs)
    );
    if (!match) {
      after.push(markB);
    }
  }

  if (before.length === 0 && after.length === 0) {
    return null;
  }

  return { before, after };
}

/**
 * Extract text spans with their marks from a paragraph node.
 */
function extractTextSpans(
  node: ProseMirrorJSON
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): { text: string; marks: any[]; from: number; to: number }[] {
  const spans: { text: string; marks: any[]; from: number; to: number }[] = [];
  let offset = 0;

  function traverse(n: ProseMirrorJSON) {
    if (!n) return;

    if (n.type === 'text' && n.text) {
      spans.push({
        text: n.text,
        marks: n.marks || [],
        from: offset,
        to: offset + n.text.length,
      });
      offset += n.text.length;
    }

    if (n.content && Array.isArray(n.content)) {
      for (const child of n.content) {
        traverse(child);
      }
    }
  }

  traverse(node);
  return spans;
}

/**
 * Detect format changes on text that exists in both versions.
 */
function detectFormatChanges(
  nodeA: ProseMirrorJSON,
  nodeB: ProseMirrorJSON,
  textA: string,
  textB: string
): FormatChange[] {
  // Only check format changes where text is the same
  if (textA !== textB) {
    // For now, skip format detection on modified text
    // (format changes are most meaningful on unchanged text)
    return [];
  }

  const spansA = extractTextSpans(nodeA);
  const spansB = extractTextSpans(nodeB);

  const formatChanges: FormatChange[] = [];

  // Compare spans at same positions
  for (const spanA of spansA) {
    // Find corresponding span in B
    const spanB = spansB.find(
      (s) => s.from === spanA.from && s.to === spanA.to && s.text === spanA.text
    );

    if (spanB) {
      const markDiff = compareMarks(spanA.marks, spanB.marks);
      if (markDiff) {
        formatChanges.push({
          from: spanA.from,
          to: spanA.to,
          text: spanA.text,
          before: markDiff.before,
          after: markDiff.after,
        });
      }
    }
  }

  return formatChanges;
}

// --- Main Export ---

/**
 * Diff two ProseMirror JSON documents at the character level.
 * This compares the entire document text, not paragraph by paragraph.
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
    // Legacy fields (empty for now, could be populated if needed)
    insertedParagraphs: [],
    deletedParagraphs: [],
    modifiedParagraphs: [],
    summary,
  };
}

