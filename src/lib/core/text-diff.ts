/**
 * Text Diff Module
 * Uses diff-match-patch to find text insertions and deletions.
 */

import DiffMatchPatch from 'diff-match-patch';
import type { TextChange, ParagraphModel } from '@/lib/types';

const dmp = new DiffMatchPatch();

// diff-match-patch operation types
const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

type DiffOperation = [number, string];

/**
 * Compute text differences between two strings.
 * Returns positioned TextChange operations.
 */
export function computeTextDiff(
  oldText: string,
  newText: string,
  basePosition: number = 0,
  paragraphIndex: number = 0
): TextChange[] {
  const changes: TextChange[] = [];

  // Compute raw diff
  const diffs: DiffOperation[] = dmp.diff_main(oldText, newText);

  // Clean up for more semantic output
  dmp.diff_cleanupSemantic(diffs);

  // Track position in old text
  // For inserts that follow deletes (replacements), we need to track the position
  // BEFORE the delete, not after
  let oldPos = basePosition;
  let insertPos = basePosition; // Separate tracker for insert position

  for (const [op, text] of diffs) {
    if (op === DIFF_DELETE) {
      changes.push({
        type: 'delete',
        text,
        position: oldPos,
        paragraphIndex,
      });
      oldPos += text.length;
      // insertPos stays the same - inserts after this delete should be at the same spot
    } else if (op === DIFF_INSERT) {
      changes.push({
        type: 'insert',
        text,
        position: insertPos, // Use insertPos, not oldPos
        paragraphIndex,
      });
      // After insert, update insertPos for next potential insert
      insertPos = oldPos;
    } else if (op === DIFF_EQUAL) {
      oldPos += text.length;
      insertPos = oldPos; // Equal text advances both
    }
  }

  return changes;
}

/**
 * Compute text differences at the paragraph level.
 * Takes two paragraphs and returns changes within them.
 */
export function computeParagraphTextDiff(
  v1Para: ParagraphModel,
  v2Para: ParagraphModel
): TextChange[] {
  return computeTextDiff(
    v1Para.textContent,
    v2Para.textContent,
    v1Para.position + 1, // +1 to account for paragraph node
    v1Para.index
  );
}

/**
 * Get equal regions between two texts.
 * Used for format comparison on unchanged text.
 */
export interface EqualRegion {
  text: string;
  v1Start: number;
  v1End: number;
  v2Start: number;
  v2End: number;
}

export function getEqualRegions(
  oldText: string,
  newText: string
): EqualRegion[] {
  const regions: EqualRegion[] = [];
  const diffs: DiffOperation[] = dmp.diff_main(oldText, newText);
  dmp.diff_cleanupSemantic(diffs);

  let v1Pos = 0;
  let v2Pos = 0;

  for (const [op, text] of diffs) {
    if (op === DIFF_EQUAL) {
      regions.push({
        text,
        v1Start: v1Pos,
        v1End: v1Pos + text.length,
        v2Start: v2Pos,
        v2End: v2Pos + text.length,
      });
      v1Pos += text.length;
      v2Pos += text.length;
    } else if (op === DIFF_DELETE) {
      v1Pos += text.length;
    } else if (op === DIFF_INSERT) {
      v2Pos += text.length;
    }
  }

  return regions;
}

