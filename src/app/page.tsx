'use client';

/**
 * DOCX Comparison Engine - Main Page
 * Orchestrates the document comparison workflow.
 */

import { useCallback, useRef, useState } from 'react';
import { useDocumentStore } from '@/store/document-store';
import {
  Header,
  DocxUploader,
  DocumentViewer,
  ChangeSummary,
  ChangesSidebar,
} from '@/components';
import { extractDocumentModel } from '@/lib/adapters';
import { compareDocuments } from '@/lib/core';
import { applyChangeSet } from '@/lib/adapters';
import type { DocumentModel } from '@/lib/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuperDocInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorInstance = any;

/**
 * Load a DOCX file using SuperDoc in a hidden container and extract its model.
 */
async function loadDocxInHiddenEditor(file: File): Promise<DocumentModel> {
  const { SuperDoc } = await import('superdoc');
  
  // Create a hidden container for the editor
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:800px;height:600px;visibility:hidden;';
  document.body.appendChild(container);
  
  return new Promise((resolve, reject) => {
    let superdoc: SuperDocInstance = null;
    let resolved = false;
    
    const cleanup = () => {
      if (superdoc) {
        try {
          superdoc.destroy?.();
        } catch {
          // Ignore cleanup errors
        }
      }
      if (container.parentNode) {
        container.parentNode.removeChild(container);
      }
    };
    
    try {
      superdoc = new SuperDoc({
        selector: container,
        document: file,
        documentMode: 'viewing',
        rulers: false,
        user: { name: 'System', email: 'system@example.com' },
        onReady: () => {
          if (resolved) return;
          try {
            // Get the active editor from superdoc once it's ready
            const editor = superdoc?.activeEditor;
            if (!editor) {
              throw new Error('No active editor found');
            }
            // Extract the document model from the editor
            const model = extractDocumentModel(editor);
            resolved = true;
            cleanup();
            resolve(model);
          } catch (err) {
            resolved = true;
            cleanup();
            reject(err);
          }
        },
        onException: ({ error: err }: { error: Error }) => {
          if (resolved) return;
          resolved = true;
          cleanup();
          reject(err);
        },
      });
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          cleanup();
          reject(new Error('Document loading timed out'));
        }
      }, 30000);
    } catch (err) {
      cleanup();
      reject(err);
    }
  });
}

export default function Home() {
  const {
    stage,
    setStage,
    v1File,
    v1Model,
    setV1File,
    setV1Model,
    setV2,
    changeSet,
    setChangeSet,
    isProcessing,
    setIsProcessing,
    error,
    setError,
    reset,
  } = useDocumentStore();

  const superdocRef = useRef<SuperDocInstance | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);

  /**
   * Handle V1 file upload - just set the file, extraction happens when editor is ready
   */
  const handleV1Upload = useCallback(
    (file: File) => {
      setError(null);
      // Store file but don't extract model yet - that happens in onEditorReady
      setV1File(file);
      setStage('viewing');
    },
    [setV1File, setStage, setError]
  );

  /**
   * Handle V2 file upload and run comparison
   */
  const handleV2Upload = useCallback(
    async (file: File) => {
      if (!v1Model || !superdocRef.current || !editorRef.current) {
        setError('V1 document not properly loaded. Please wait for it to finish loading.');
        return;
      }

      setIsProcessing(true);
      setShowUploadModal(false);
      setStage('comparing');
      setError(null);

      try {
        // Load V2 in a hidden editor and extract model
        const v2Model = await loadDocxInHiddenEditor(file);
        setV2(file, v2Model);

        // Debug: log what we're comparing
        console.log('V1 Model:', v1Model);
        console.log('V1 Paragraphs:', v1Model.paragraphs.length);
        console.log('V1 First para:', v1Model.paragraphs[0]?.textContent?.substring(0, 50));
        console.log('V2 Model:', v2Model);
        console.log('V2 Paragraphs:', v2Model.paragraphs.length);
        console.log('V2 First para:', v2Model.paragraphs[0]?.textContent?.substring(0, 50));

        // Compare documents
        const changes = compareDocuments(v1Model, v2Model);
        console.log('Changes detected:', changes);
        console.log('Text changes:', changes.textChanges.length);
        console.log('Format changes:', changes.formatChanges.length);
        console.log('Paragraph changes:', changes.paragraphChanges.length);
        if (changes.textChanges.length > 0) {
          console.log('All text changes:');
          changes.textChanges.forEach((tc, i) => {
            console.log(`  ${i}: ${tc.type} "${tc.text}" at position ${tc.position}`);
          });
        }
        if (changes.paragraphChanges.length > 0) {
          console.log('First paragraph change:', changes.paragraphChanges[0]);
        }

        // Apply changes to editor in suggesting mode
        await applyChangeSet(superdocRef.current, editorRef.current, changes);

        setChangeSet(changes);
        setStage('result');
      } catch (err) {
        console.error('Comparison failed:', err);
        setError(err instanceof Error ? err.message : 'Comparison failed');
        setStage('viewing');
      } finally {
        setIsProcessing(false);
      }
    },
    [v1Model, setV2, setChangeSet, setStage, setIsProcessing, setError]
  );

  /**
   * Handle editor ready - extract V1 model here
   */
  const handleEditorReady = useCallback(
    (superdoc: SuperDocInstance, editor: EditorInstance) => {
      superdocRef.current = superdoc;
      editorRef.current = editor;
      
      // Debug: log editor state
      console.log('Editor ready, state:', editor?.state);
      console.log('Editor doc:', editor?.state?.doc);
      
      // Extract V1 model from the editor if not already done
      if (!v1Model && v1File) {
        try {
          const model = extractDocumentModel(editor);
          console.log('V1 Model extracted:', model);
          console.log('V1 Paragraphs found:', model.paragraphs.length);
          setV1Model(model);
        } catch (err) {
          console.error('Failed to extract V1 model:', err);
          setError(err instanceof Error ? err.message : 'Failed to extract document model');
        }
      }
    },
    [v1File, v1Model, setV1Model, setError]
  );

  /**
   * Handle reset
   */
  const handleReset = useCallback(() => {
    reset();
    superdocRef.current = null;
    editorRef.current = null;
  }, [reset]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <Header
        showUploadButton={stage === 'viewing' || stage === 'result'}
        onUploadNewVersion={() => setShowUploadModal(true)}
        onReset={stage !== 'upload' ? handleReset : undefined}
      />

      {/* Main content */}
      <main className="flex-1 flex">
        {/* Upload stage */}
        {stage === 'upload' && (
          <div className="flex-1 flex items-center justify-center p-8">
            <DocxUploader
              onFileSelect={handleV1Upload}
              label="Upload your original document"
              disabled={isProcessing}
            />
          </div>
        )}

        {/* Viewing / Comparing / Result stages */}
        {(stage === 'viewing' || stage === 'comparing' || stage === 'result') &&
          v1File && (
            <div className="flex-1 flex">
              {/* Document viewer */}
              <div className="flex-1 flex flex-col">
                <DocumentViewer
                  key={v1File.name + v1File.lastModified}
                  file={v1File}
                  onReady={handleEditorReady}
                  documentMode="editing"
                  className="flex-1"
                />

                {/* Summary panel (bottom) */}
                {stage === 'result' && changeSet && (
                  <div className="p-4 bg-gray-50 border-t border-gray-200">
                    <ChangeSummary summary={changeSet.summary} />
                  </div>
                )}
              </div>

              {/* Sidebar (right) */}
              {stage === 'result' && changeSet && (
                <ChangesSidebar
                  changeSet={changeSet}
                  className="w-80 flex-shrink-0"
                />
              )}
            </div>
          )}

        {/* Processing overlay */}
        {isProcessing && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 shadow-xl flex flex-col items-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
              <p className="text-gray-700 font-medium">
                {stage === 'comparing' ? 'Comparing documents...' : 'Loading...'}
              </p>
            </div>
          </div>
        )}

        {/* Error toast */}
        {error && (
          <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 hover:text-red-200">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {/* Upload V2 modal */}
        {showUploadModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 shadow-xl max-w-lg w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">
                  Upload new version
                </h2>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <DocxUploader
                onFileSelect={handleV2Upload}
                label="Drop the updated document here"
                disabled={isProcessing}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
