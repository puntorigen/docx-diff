/**
 * Types for AI-powered change summary feature
 */

/**
 * Location context for a change
 */
export interface ChangeLocation {
  nodeType: 'heading' | 'paragraph' | 'listItem' | 'tableCell' | 'unknown';
  headingLevel?: number;
  paragraphIndex?: number;
  sectionTitle?: string;
  description: string;
}

/**
 * Format change details
 */
export interface FormatDetails {
  added: string[];
  removed: string[];
}

/**
 * Enriched change with full context
 */
export interface EnrichedChange {
  type: 'insertion' | 'deletion' | 'replacement' | 'format';
  text?: string;
  oldText?: string;
  newText?: string;
  location: ChangeLocation;
  formatDetails?: FormatDetails;
  charCount?: number;
  surroundingText?: string;  // The sentence or clause containing the change
}

/**
 * API request body
 */
export interface SummarizeChangesRequest {
  changes: EnrichedChange[];
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

