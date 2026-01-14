/**
 * Diff type definitions.
 * Core diff types are now imported from docx-diff-editor.
 * These types are kept for backward compatibility with UI components.
 */

// Re-export core diff types from the package
export type {
  DiffSegment,
  DiffResult,
  FormatChange as PackageFormatChange,
  ComparisonResult,
  StructuralChangeInfo,
  StructuralChangeType,
} from 'docx-diff-editor';

/**
 * Summary of all changes for display (simplified UI type).
 */
export interface ChangeSummary {
  totalChanges: number;
  insertions: number;
  deletions: number;
  formatChanges: number;
  structuralChanges?: number;
  /** Human-readable key changes */
  highlights: string[];
}
