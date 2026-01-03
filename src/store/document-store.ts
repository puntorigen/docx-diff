/**
 * Document Store
 * Global state management for document comparison.
 */

import { create } from 'zustand';
import type { DocumentModel, ChangeSet } from '@/lib/types';

export type AppStage = 'upload' | 'viewing' | 'comparing' | 'result';

export interface DocumentState {
  // Stage
  stage: AppStage;
  setStage: (stage: AppStage) => void;

  // V1 Document (original)
  v1File: File | null;
  v1Model: DocumentModel | null;
  setV1File: (file: File) => void;
  setV1Model: (model: DocumentModel) => void;
  setV1: (file: File, model: DocumentModel) => void;
  clearV1: () => void;

  // V2 Document (new version)
  v2File: File | null;
  v2Model: DocumentModel | null;
  setV2: (file: File, model: DocumentModel) => void;
  clearV2: () => void;

  // Comparison result
  changeSet: ChangeSet | null;
  setChangeSet: (changeSet: ChangeSet) => void;

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
  v1Model: null,
  setV1File: (file) => set({ v1File: file }),
  setV1Model: (model) => set({ v1Model: model }),
  setV1: (file, model) => set({ v1File: file, v1Model: model }),
  clearV1: () => set({ v1File: null, v1Model: null }),

  // V2
  v2File: null,
  v2Model: null,
  setV2: (file, model) => set({ v2File: file, v2Model: model }),
  clearV2: () => set({ v2File: null, v2Model: null }),

  // Comparison
  changeSet: null,
  setChangeSet: (changeSet) => set({ changeSet, stage: 'result' }),

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
      v1Model: null,
      v2File: null,
      v2Model: null,
      changeSet: null,
      isProcessing: false,
      error: null,
    }),
}));

