/**
 * Types for AI-powered change summary feature
 * EnrichedChange and ChangeLocation are now imported from docx-diff-editor
 */

// Re-export types from the package for convenience
export type { EnrichedChange, ChangeLocation, FormatDetails } from 'docx-diff-editor';

/**
 * API request body
 */
export interface SummarizeChangesRequest {
  changes: import('docx-diff-editor').EnrichedChange[];
  maxBullets?: number;
}

/**
 * A single summary bullet with type for color coding
 */
export interface SummaryBullet {
  type: 'format' | 'replacement' | 'insertion' | 'deletion' | 'other';
  text: string;
}

/**
 * API response
 */
export interface SummarizeChangesResponse {
  bullets: SummaryBullet[];
  generatedAt: string;
  fallback?: boolean;
}
