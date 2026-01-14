/**
 * Services Index
 * Re-exports types and utilities from docx-diff-editor package.
 */

// Re-export types from the package for backward compatibility
export type {
  ProseMirrorJSON,
  DiffResult,
  DiffSegment,
  FormatChange,
  ComparisonResult,
  EnrichedChange,
  ChangeLocation,
  TrackChangeAuthor,
  StructuralChangeInfo,
  DocumentInfo,
  DocumentProperties,
} from 'docx-diff-editor';

// Keep our local services
export { GroqService } from './groqService';

// Helper to download blob (simple utility we can keep)
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
