'use client';

/**
 * Comparison Hook
 * Orchestrates the document comparison workflow.
 */

import { useCallback } from 'react';
import { useDocumentStore } from '@/store/document-store';
import { extractDocumentModelFromJson } from '@/lib/adapters';
import { compareDocuments } from '@/lib/core';
import { applyChangeSet } from '@/lib/adapters';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuperDocInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorInstance = any;

export function useComparison() {
  const {
    v1Model,
    setV2,
    setChangeSet,
    setIsProcessing,
    setError,
    setStage,
  } = useDocumentStore();

  /**
   * Process V2 file and run comparison.
   */
  const runComparison = useCallback(
    async (
      v2File: File,
      superdoc: SuperDocInstance,
      editor: EditorInstance
    ) => {
      if (!v1Model) {
        setError('V1 document not loaded');
        return null;
      }

      setIsProcessing(true);
      setStage('comparing');
      setError(null);

      try {
        // Load V2 file and extract JSON
        const v2Json = await loadDocxAsJson(v2File);
        const v2Model = extractDocumentModelFromJson(v2Json);

        setV2(v2File, v2Model);

        // Compare documents
        const changeSet = compareDocuments(v1Model, v2Model);

        // Apply changes to editor in suggesting mode
        await applyChangeSet(superdoc, editor, changeSet);

        setChangeSet(changeSet);

        return changeSet;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Comparison failed';
        setError(message);
        console.error('Comparison error:', error);
        return null;
      } finally {
        setIsProcessing(false);
      }
    },
    [v1Model, setV2, setChangeSet, setIsProcessing, setError, setStage]
  );

  return {
    runComparison,
  };
}

/**
 * Load a DOCX file and extract ProseMirror JSON.
 * Uses SuperDoc's converter in headless mode.
 */
async function loadDocxAsJson(
  file: File
): Promise<{ type: string; content?: unknown[] }> {
  // Dynamic import to avoid SSR issues
  const { SuperConverter } = await import('superdoc');

  // Read file as ArrayBuffer
  const arrayBuffer = await file.arrayBuffer();

  // Use SuperConverter to parse DOCX
  const converter = new SuperConverter({
    fileSource: arrayBuffer,
  });

  // Get ProseMirror JSON
  const result = await converter.init();

  if (!result?.content) {
    throw new Error('Failed to parse DOCX file');
  }

  return result.content;
}

