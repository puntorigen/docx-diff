'use client';

/**
 * DocxViewer Component
 * Wrapper around docx-diff-editor for document comparison with track changes.
 */

import { useRef, useState, forwardRef, useImperativeHandle, useCallback } from 'react';
import {
  DocxDiffEditor,
  type DocxDiffEditorRef,
  type DocxContent,
  type ComparisonResult,
  type EnrichedChange,
  type ProseMirrorJSON,
} from 'docx-diff-editor';
import 'docx-diff-editor/styles.css';

const AUTHOR = {
  name: 'DocX Diff Tool',
  email: 'tool@docxdiff.com',
};

interface DocxViewerProps {
  /** Callback when editor is ready */
  onReady?: () => void;
  /** Callback when source document is loaded with its JSON */
  onSourceLoaded?: (json: ProseMirrorJSON) => void;
  /** Callback when comparison completes */
  onComparisonComplete?: (result: ComparisonResult) => void;
  /** Callback on errors */
  onError?: (error: Error) => void;
  /** Show rulers in the editor */
  showRulers?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export interface DocxViewerRef {
  /** Set the source/base document (File, HTML string, or JSON) */
  setSource: (content: DocxContent) => Promise<void>;
  /** Compare current document with new content */
  compareWith: (content: DocxContent) => Promise<ComparisonResult>;
  /** Get current document content as JSON */
  getContent: () => ProseMirrorJSON;
  /** Get enriched changes context for LLM processing */
  getEnrichedChangesContext: () => EnrichedChange[];
  /** Export document as DOCX blob */
  exportDocx: () => Promise<Blob>;
  /** Reset comparison (back to source state) */
  resetComparison: () => void;
  /** Accept all track changes */
  acceptAllChanges: () => Promise<ProseMirrorJSON>;
  /** Check if editor is ready */
  isReady: () => boolean;
}

export const DocxViewer = forwardRef<DocxViewerRef, DocxViewerProps>(
  function DocxViewer(
    {
      onReady,
      onSourceLoaded,
      onComparisonComplete,
      onError,
      showRulers = false,
      className = '',
    },
    ref
  ) {
    const editorRef = useRef<DocxDiffEditorRef>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Expose methods to parent via ref
    useImperativeHandle(ref, () => ({
      setSource: async (content: DocxContent) => {
        if (!editorRef.current) throw new Error('Editor not ready');
        console.log('[DocxViewer] setSource called');
        await editorRef.current.setSource(content);
      },
      compareWith: async (content: DocxContent) => {
        if (!editorRef.current) throw new Error('Editor not ready');
        console.log('[DocxViewer] compareWith called');
        return await editorRef.current.compareWith(content);
      },
      getContent: () => {
        if (!editorRef.current) return { type: 'doc', content: [] };
        return editorRef.current.getContent();
      },
      getEnrichedChangesContext: () => {
        if (!editorRef.current) return [];
        return editorRef.current.getEnrichedChangesContext();
      },
      exportDocx: async () => {
        if (!editorRef.current) throw new Error('Editor not ready');
        return await editorRef.current.exportDocx();
      },
      resetComparison: () => {
        editorRef.current?.resetComparison();
      },
      acceptAllChanges: async () => {
        if (!editorRef.current) throw new Error('Editor not ready');
        return await editorRef.current.acceptAllChanges();
      },
      isReady: () => {
        return editorRef.current !== null && !isLoading;
      },
    }));

    const handleReady = useCallback(() => {
      console.log('[DocxViewer] Editor ready');
      setIsLoading(false);
      onReady?.();
    }, [onReady]);

    const handleSourceLoaded = useCallback((json: ProseMirrorJSON) => {
      console.log('[DocxViewer] Source loaded');
      onSourceLoaded?.(json);
    }, [onSourceLoaded]);

    const handleComparisonComplete = useCallback((result: ComparisonResult) => {
      console.log('[DocxViewer] Comparison complete:', result.totalChanges, 'changes');
      onComparisonComplete?.(result);
    }, [onComparisonComplete]);

    const handleError = useCallback((err: Error) => {
      console.error('[DocxViewer] Error:', err);
      setError(err.message);
      onError?.(err);
    }, [onError]);

    return (
      <div className={`relative flex flex-col ${className}`}>
        {/* Error overlay */}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="text-center p-6">
              <div className="text-red-500 mb-3">
                <svg
                  className="w-12 h-12 mx-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <p className="text-gray-700 font-medium">Failed to load document</p>
              <p className="text-gray-500 text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        <DocxDiffEditor
          ref={editorRef}
          initialSource="<p></p>"
          showToolbar
          showRulers={showRulers}
          author={AUTHOR}
          onReady={handleReady}
          onSourceLoaded={handleSourceLoaded}
          onComparisonComplete={handleComparisonComplete}
          onError={handleError}
          className="flex-1 min-h-0 flex flex-col"
          toolbarClassName="border-b border-gray-200 bg-gray-50 flex-shrink-0"
          editorClassName="flex-1 min-h-0 overflow-auto"
          // Structural changes pane options
          structuralPanePosition="bottom-right"
          structuralPaneCollapsed={false}
          hideStructuralPane={false}
        />
      </div>
    );
  }
);

export default DocxViewer;
