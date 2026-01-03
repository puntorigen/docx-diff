/**
 * Paragraph Aligner Module
 * Uses LCS (Longest Common Subsequence) to align paragraphs between documents.
 */

import type { ParagraphModel, AlignmentResult } from '@/lib/types';

/**
 * Compute LCS length table for two arrays.
 */
function computeLCSTable(
  arr1: string[],
  arr2: string[]
): number[][] {
  const m = arr1.length;
  const n = arr2.length;

  // Create table with dimensions (m+1) x (n+1)
  const table: number[][] = Array(m + 1)
    .fill(null)
    .map(() => Array(n + 1).fill(0));

  // Fill the table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        table[i][j] = table[i - 1][j - 1] + 1;
      } else {
        table[i][j] = Math.max(table[i - 1][j], table[i][j - 1]);
      }
    }
  }

  return table;
}

/**
 * Backtrack through LCS table to find alignment.
 */
function backtrackLCS(
  table: number[][],
  arr1: string[],
  arr2: string[],
  i: number,
  j: number
): Array<{ type: 'match' | 'delete' | 'insert'; i1?: number; i2?: number }> {
  const result: Array<{
    type: 'match' | 'delete' | 'insert';
    i1?: number;
    i2?: number;
  }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && arr1[i - 1] === arr2[j - 1]) {
      // Match
      result.unshift({ type: 'match', i1: i - 1, i2: j - 1 });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || table[i][j - 1] >= table[i - 1][j])) {
      // Insert from arr2
      result.unshift({ type: 'insert', i2: j - 1 });
      j--;
    } else {
      // Delete from arr1
      result.unshift({ type: 'delete', i1: i - 1 });
      i--;
    }
  }

  return result;
}

/**
 * Align paragraphs between two documents using content hash matching.
 */
export function alignParagraphs(
  v1Paragraphs: ParagraphModel[],
  v2Paragraphs: ParagraphModel[]
): AlignmentResult[] {
  // Use content hash for matching
  const v1Hashes = v1Paragraphs.map((p) => p.contentHash);
  const v2Hashes = v2Paragraphs.map((p) => p.contentHash);

  // Compute LCS
  const table = computeLCSTable(v1Hashes, v2Hashes);
  const alignment = backtrackLCS(
    table,
    v1Hashes,
    v2Hashes,
    v1Hashes.length,
    v2Hashes.length
  );

  // Convert to AlignmentResult
  const results: AlignmentResult[] = [];

  for (const item of alignment) {
    if (item.type === 'match' && item.i1 !== undefined && item.i2 !== undefined) {
      results.push({
        type: 'match',
        v1: v1Paragraphs[item.i1],
        v2: v2Paragraphs[item.i2],
      });
    } else if (item.type === 'delete' && item.i1 !== undefined) {
      results.push({
        type: 'delete',
        v1: v1Paragraphs[item.i1],
      });
    } else if (item.type === 'insert' && item.i2 !== undefined) {
      results.push({
        type: 'insert',
        v2: v2Paragraphs[item.i2],
      });
    }
  }

  return results;
}

/**
 * Align paragraphs using fuzzy matching (for similar but not identical paragraphs).
 * Falls back to content hash matching but also tries to match similar paragraphs.
 */
export function alignParagraphsFuzzy(
  v1Paragraphs: ParagraphModel[],
  v2Paragraphs: ParagraphModel[],
  similarityThreshold: number = 0.6
): AlignmentResult[] {
  // First, try exact matching
  const exactAlignment = alignParagraphs(v1Paragraphs, v2Paragraphs);

  // Find unmatched paragraphs
  const v1Matched = new Set<number>();
  const v2Matched = new Set<number>();

  for (const result of exactAlignment) {
    if (result.type === 'match') {
      v1Matched.add(result.v1.index);
      v2Matched.add(result.v2.index);
    }
  }

  // Try to match remaining paragraphs by similarity
  const results: AlignmentResult[] = [];
  const v2UsedForFuzzy = new Set<number>();

  for (const result of exactAlignment) {
    if (result.type === 'match') {
      results.push(result);
    } else if (result.type === 'delete') {
      // Try to find a similar unmatched paragraph in v2
      let bestMatch: ParagraphModel | null = null;
      let bestSimilarity = 0;

      for (const v2Para of v2Paragraphs) {
        if (!v2Matched.has(v2Para.index) && !v2UsedForFuzzy.has(v2Para.index)) {
          const similarity = computeSimilarity(
            result.v1.textContent,
            v2Para.textContent
          );
          if (similarity > similarityThreshold && similarity > bestSimilarity) {
            bestMatch = v2Para;
            bestSimilarity = similarity;
          }
        }
      }

      if (bestMatch) {
        // Found a similar paragraph - treat as match (content changed)
        v2UsedForFuzzy.add(bestMatch.index);
        results.push({
          type: 'match',
          v1: result.v1,
          v2: bestMatch,
        });
      } else {
        results.push(result);
      }
    } else if (result.type === 'insert') {
      // Check if this was matched via fuzzy
      if (!v2UsedForFuzzy.has(result.v2.index)) {
        results.push(result);
      }
    }
  }

  return results;
}

/**
 * Compute similarity between two strings (0 to 1).
 * Uses a simple character-based approach.
 */
function computeSimilarity(str1: string, str2: string): number {
  if (str1 === str2) return 1;
  if (str1.length === 0 || str2.length === 0) return 0;

  // Use Jaccard similarity on word sets
  const words1 = new Set(str1.toLowerCase().split(/\s+/).filter(Boolean));
  const words2 = new Set(str2.toLowerCase().split(/\s+/).filter(Boolean));

  if (words1.size === 0 || words2.size === 0) return 0;

  let intersection = 0;
  for (const word of words1) {
    if (words2.has(word)) {
      intersection++;
    }
  }

  const union = words1.size + words2.size - intersection;
  return intersection / union;
}

