/**
 * Document type definitions.
 * These types abstract SuperDoc/ProseMirror internals into a clean, testable model.
 */

/**
 * Document metadata.
 */
export interface DocumentMetadata {
  title?: string;
  author?: string;
  createdAt?: Date;
  modifiedAt?: Date;
}

/**
 * Simplified document model for state management.
 */
export interface DocumentModel {
  paragraphs: unknown[];
  metadata?: DocumentMetadata;
}
