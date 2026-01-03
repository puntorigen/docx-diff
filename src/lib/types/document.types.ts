/**
 * Document type definitions.
 * These types abstract SuperDoc/ProseMirror internals into a clean, testable model.
 */

/**
 * Our abstracted document representation.
 * Decouples business logic from SuperDoc internals.
 */
export interface DocumentModel {
  paragraphs: ParagraphModel[];
  metadata?: DocumentMetadata;
}

export interface DocumentMetadata {
  title?: string;
  author?: string;
  createdAt?: Date;
  modifiedAt?: Date;
}

/**
 * Represents a single paragraph in the document.
 */
export interface ParagraphModel {
  /** Unique identifier for alignment */
  id: string;
  /** Index in document (0-based) */
  index: number;
  /** ProseMirror position (for change application) */
  position: number;
  /** Text spans with formatting */
  spans: TextSpan[];
  /** Plain text content (for quick comparison) */
  textContent: string;
  /** Hash of content for quick equality check */
  contentHash: string;
}

/**
 * A span of text with consistent formatting.
 */
export interface TextSpan {
  text: string;
  position: SpanPosition;
  marks: MarkModel[];
}

/**
 * Position information for a text span.
 */
export interface SpanPosition {
  /** Offset within paragraph */
  start: number;
  end: number;
  /** Absolute ProseMirror position */
  pmStart: number;
  pmEnd: number;
}

/**
 * Normalized mark representation.
 * Abstracts ProseMirror marks into comparable format.
 */
export interface MarkModel {
  type: MarkType;
  value?: string | number | boolean;
}

/**
 * Supported mark types for formatting.
 */
export type MarkType =
  | 'bold'
  | 'italic'
  | 'underline'
  | 'strike'
  | 'fontSize'
  | 'fontFamily'
  | 'color'
  | 'backgroundColor'
  | 'link'
  | 'subscript'
  | 'superscript';

