/**
 * Document Store
 * Simplified global state management for document comparison.
 */

import { create } from 'zustand';
import type { ComparisonResult } from 'docx-diff-editor';

export type AppStage = 'upload' | 'viewing' | 'comparing' | 'result';

export interface DocumentState {
  // Stage
  stage: AppStage;
  setStage: (stage: AppStage) => void;

  // V1 Document (original)
  v1File: File | null;
  setV1File: (file: File) => void;

  // V2 Document (new version)
  v2File: File | null;
  setV2File: (file: File) => void;

  // Comparison result from the package
  comparisonResult: ComparisonResult | null;
  setComparisonResult: (result: ComparisonResult) => void;

  // Processing state
  isProcessing: boolean;
  setIsProcessing: (isProcessing: boolean) => void;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;

  // Reset all
  reset: () => void;
}

export const useDocumentStore = create<DocumentState>((set) => ({
  // Stage
  stage: 'upload',
  setStage: (stage) => set({ stage }),

  // V1
  v1File: null,
  setV1File: (file) => set({ v1File: file }),

  // V2
  v2File: null,
  setV2File: (file) => set({ v2File: file }),

  // Comparison result
  comparisonResult: null,
  setComparisonResult: (result) => set({ comparisonResult: result, stage: 'result' }),

  // Processing
  isProcessing: false,
  setIsProcessing: (isProcessing) => set({ isProcessing }),

  // Error
  error: null,
  setError: (error) => set({ error }),

  // Reset
  reset: () =>
    set({
      stage: 'upload',
      v1File: null,
      v2File: null,
      comparisonResult: null,
      isProcessing: false,
      error: null,
    }),
}));
