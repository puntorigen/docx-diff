/**
 * Diff type definitions.
 * These types represent changes between two document versions.
 */

import { MarkModel, ParagraphModel } from './document.types';

/**
 * Complete set of changes between two documents.
 */
export interface ChangeSet {
  textChanges: TextChange[];
  formatChanges: FormatChange[];
  paragraphChanges: ParagraphChange[];
  summary: ChangeSummary;
}

/**
 * A text insertion or deletion.
 */
export interface TextChange {
  type: 'insert' | 'delete';
  text: string;
  /** Position in V1 document */
  position: number;
  /** Which paragraph this belongs to */
  paragraphIndex: number;
}

/**
 * A formatting change on unchanged text.
 */
export interface FormatChange {
  /** Affected text range in V1 */
  from: number;
  to: number;
  text: string;
  paragraphIndex: number;
  /** Marks to add */
  addMarks: MarkModel[];
  /** Marks to remove */
  removeMarks: MarkModel[];
}

/**
 * A paragraph-level change (add or remove entire paragraph).
 */
export interface ParagraphChange {
  type: 'insert' | 'delete';
  paragraph: ParagraphModel;
  /** Position to insert at (for inserts) */
  insertAfterIndex?: number;
}

/**
 * Summary of all changes for display.
 */
export interface ChangeSummary {
  totalChanges: number;
  insertions: number;
  deletions: number;
  formatChanges: number;
  paragraphsAdded: number;
  paragraphsRemoved: number;
  /** Human-readable key changes */
  highlights: string[];
}

/**
 * Result of paragraph alignment between two documents.
 */
export type AlignmentResult =
  | { type: 'match'; v1: ParagraphModel; v2: ParagraphModel }
  | { type: 'delete'; v1: ParagraphModel }
  | { type: 'insert'; v2: ParagraphModel };

