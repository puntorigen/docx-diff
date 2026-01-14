/**
 * Document type definitions.
 * Core document types are now imported from docx-diff-editor.
 */

// Re-export document types from the package
export type {
  ProseMirrorJSON,
  DocumentInfo,
  DocumentProperties,
} from 'docx-diff-editor';

/**
 * Document metadata (simplified).
 */
export interface DocumentMetadata {
  title?: string;
  author?: string;
  createdAt?: Date;
  modifiedAt?: Date;
}
