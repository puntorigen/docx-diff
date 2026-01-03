/**
 * Format Diff Module
 * Compares formatting (marks) on unchanged text regions.
 */

import type {
  FormatChange,
  MarkModel,
  ParagraphModel,
  TextSpan,
} from '@/lib/types';
import { deepEqual } from '@/lib/utils';
import { getEqualRegions } from './text-diff';

/**
 * Check if two marks are equal.
 */
function marksEqual(m1: MarkModel, m2: MarkModel): boolean {
  return m1.type === m2.type && m1.value === m2.value;
}


/**
 * Find marks that are in arr2 but not in arr1.
 */
function findAddedMarks(arr1: MarkModel[], arr2: MarkModel[]): MarkModel[] {
  return arr2.filter(
    (m2) => !arr1.some((m1) => marksEqual(m1, m2))
  );
}

/**
 * Find marks that are in arr1 but not in arr2.
 */
function findRemovedMarks(arr1: MarkModel[], arr2: MarkModel[]): MarkModel[] {
  return arr1.filter(
    (m1) => !arr2.some((m2) => marksEqual(m1, m2))
  );
}

/**
 * Get marks at a specific character offset within a paragraph's spans.
 */
function getMarksAtOffset(spans: TextSpan[], offset: number): MarkModel[] {
  for (const span of spans) {
    if (offset >= span.position.start && offset < span.position.end) {
      return span.marks;
    }
  }
  return [];
}

/**
 * Get ProseMirror position for a character offset within a paragraph.
 */
function getPMPositionAtOffset(
  spans: TextSpan[],
  offset: number,
  paragraphPosition: number
): number {
  for (const span of spans) {
    if (offset >= span.position.start && offset < span.position.end) {
      return span.position.pmStart + (offset - span.position.start);
    }
  }
  // Fallback: estimate based on paragraph position
  return paragraphPosition + 1 + offset;
}

/**
 * Compare formatting between two paragraphs on their equal text regions.
 */
export function computeFormatDiff(
  v1Para: ParagraphModel,
  v2Para: ParagraphModel
): FormatChange[] {
  const changes: FormatChange[] = [];

  // Get equal regions (unchanged text)
  const equalRegions = getEqualRegions(v1Para.textContent, v2Para.textContent);

  for (const region of equalRegions) {
    // Check each character in the equal region for format changes
    let currentChangeStart: number | null = null;
    let currentAddMarks: MarkModel[] = [];
    let currentRemoveMarks: MarkModel[] = [];

    for (let i = 0; i < region.text.length; i++) {
      const v1Offset = region.v1Start + i;
      const v2Offset = region.v2Start + i;

      const v1Marks = getMarksAtOffset(v1Para.spans, v1Offset);
      const v2Marks = getMarksAtOffset(v2Para.spans, v2Offset);

      const addMarks = findAddedMarks(v1Marks, v2Marks);
      const removeMarks = findRemovedMarks(v1Marks, v2Marks);

      const hasChange = addMarks.length > 0 || removeMarks.length > 0;

      if (hasChange) {
        // Check if this continues a previous change with same marks
        const sameAsCurrentChange =
          currentChangeStart !== null &&
          deepEqual(currentAddMarks, addMarks) &&
          deepEqual(currentRemoveMarks, removeMarks);

        if (!sameAsCurrentChange) {
          // Flush previous change if exists
          if (currentChangeStart !== null) {
            const startPM = getPMPositionAtOffset(
              v1Para.spans,
              currentChangeStart,
              v1Para.position
            );
            const endPM = getPMPositionAtOffset(
              v1Para.spans,
              region.v1Start + i,
              v1Para.position
            );

            changes.push({
              from: startPM,
              to: endPM,
              text: region.text.slice(
                currentChangeStart - region.v1Start,
                i
              ),
              paragraphIndex: v1Para.index,
              addMarks: currentAddMarks,
              removeMarks: currentRemoveMarks,
            });
          }

          // Start new change
          currentChangeStart = v1Offset;
          currentAddMarks = addMarks;
          currentRemoveMarks = removeMarks;
        }
      } else {
        // No change at this position
        // Flush previous change if exists
        if (currentChangeStart !== null) {
          const startPM = getPMPositionAtOffset(
            v1Para.spans,
            currentChangeStart,
            v1Para.position
          );
          const endPM = getPMPositionAtOffset(
            v1Para.spans,
            region.v1Start + i,
            v1Para.position
          );

          changes.push({
            from: startPM,
            to: endPM,
            text: region.text.slice(
              currentChangeStart - region.v1Start,
              i
            ),
            paragraphIndex: v1Para.index,
            addMarks: currentAddMarks,
            removeMarks: currentRemoveMarks,
          });

          currentChangeStart = null;
          currentAddMarks = [];
          currentRemoveMarks = [];
        }
      }
    }

    // Flush any remaining change
    if (currentChangeStart !== null) {
      const startPM = getPMPositionAtOffset(
        v1Para.spans,
        currentChangeStart,
        v1Para.position
      );
      const endPM = getPMPositionAtOffset(
        v1Para.spans,
        region.v1End,
        v1Para.position
      );

      changes.push({
        from: startPM,
        to: endPM,
        text: region.text.slice(currentChangeStart - region.v1Start),
        paragraphIndex: v1Para.index,
        addMarks: currentAddMarks,
        removeMarks: currentRemoveMarks,
      });
    }
  }

  return changes;
}

