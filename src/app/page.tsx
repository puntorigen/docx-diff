'use client';

/**
 * DOCX Comparison Engine - Main Page
 * Uses "Merge and Mark" approach: builds a merged document with track change marks.
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { useDocumentStore } from '@/store/document-store';
import {
  Header,
  DocxUploader,
  ChangeSummary,
} from '@/components';
import {
  parseDocx,
  diffDocuments,
  mergeDocuments,
  type ProseMirrorJSON,
  type DiffResult,
} from '@/lib/services';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuperDocInstance = any;

interface ComparisonState {
  v1Json: ProseMirrorJSON | null;
  v2Json: ProseMirrorJSON | null;
  mergedJson: ProseMirrorJSON | null;
  diffResult: DiffResult | null;
}

/**
 * Document Viewer Component for the merged document.
 * Loads JSON content directly into SuperDoc.
 */
function MergedDocumentViewer({
  file,
  mergedJson,
  onSuperdocReady,
  className = '',
}: {
  file: File;
  mergedJson: ProseMirrorJSON | null;
  onSuperdocReady?: (superdoc: SuperDocInstance) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<SuperDocInstance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  // Initialize SuperDoc when file or mergedJson changes
  const initRef = useRef(false);

  const initialize = useCallback(async () => {
    if (initRef.current || !containerRef.current || !mountedRef.current) return;
    initRef.current = true;

    // Small delay to let React settle
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (!mountedRef.current || !containerRef.current) {
      initRef.current = false;
      return;
    }

    setIsLoading(true);
    setError(null);

    // Clean up previous instance
    if (superdocRef.current) {
      try {
        superdocRef.current.destroy?.();
      } catch {
        // Ignore cleanup errors
      }
      superdocRef.current = null;
    }

    // Create fresh container
    const innerContainer = document.createElement('div');
    innerContainer.style.width = '100%';
    innerContainer.style.height = '100%';
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(innerContainer);

    try {
      const { SuperDoc } = await import('superdoc');
      await import('superdoc/style.css');

      const superdoc = new SuperDoc({
        selector: innerContainer,
        document: file,
        documentMode: 'editing', // Editing mode allows accepting/rejecting changes
        role: 'editor', // Editor role has permission to accept changes
        rulers: false,
        user: {
          name: 'Comparison Viewer',
          email: 'viewer@comparison.local',
        },
        // Allow accepting/rejecting changes from any author (including our 'Comparison Tool')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        permissionResolver: ({ permission }: any) => {
          // Allow all track change operations
          // RESOLVE_OWN/RESOLVE_OTHER are for accepting changes
          // REJECT_OWN/REJECT_OTHER are for rejecting changes
          if (permission === 'RESOLVE_OWN' ||
              permission === 'RESOLVE_OTHER' || 
              permission === 'REJECT_OWN' ||
              permission === 'REJECT_OTHER') {
            return true;
          }
          return undefined; // Use default decision
        },
        onReady: ({ superdoc: sd }: { superdoc: SuperDocInstance }) => {
          superdocRef.current = sd;

          // If we have merged JSON, set it as the content
          if (mergedJson && sd?.activeEditor) {
            try {
              console.log('Setting merged content...');
              console.log('Available commands:', Object.keys(sd.activeEditor.commands || {}));
              
              const editor = sd.activeEditor;
              
              // Try different methods to set content
              if (editor.commands?.setContent) {
                editor.commands.setContent(mergedJson);
              } else if (editor.setContent) {
                editor.setContent(mergedJson);
              } else {
                // Use ProseMirror's replaceWith directly
                const { state, view } = editor;
                if (state?.doc && view && mergedJson.content) {
                  console.log('Using ProseMirror transaction to replace content');
                  // Create nodes from JSON
                  const newDoc = state.schema.nodeFromJSON(mergedJson);
                  const tr = state.tr.replaceWith(0, state.doc.content.size, newDoc.content);
                  view.dispatch(tr);
                  console.log('Content replaced via transaction');
                } else {
                  console.warn('Could not find a way to set content - state.doc:', !!state?.doc, 'view:', !!view);
                }
              }
              
              console.log('Merged content set successfully');

              // Enable track changes REVIEW mode to show both insertions and deletions visually
              // 'review' mode shows: strikethrough for deletions, highlighting for insertions
              if (sd.setTrackedChangesPreferences) {
                sd.setTrackedChangesPreferences({
                  mode: 'review',  // 'review' shows both, 'original' hides insertions, 'final' hides deletions
                  enabled: true
                });
                console.log('Track changes set to REVIEW mode');
              } else if (editor.commands?.enableTrackChanges) {
                editor.commands.enableTrackChanges();
                console.log('Track changes enabled via command');
              }

              // Log available track change related methods for debugging
              console.log('Track change commands available:', {
                acceptAll: !!editor.commands?.acceptAllTrackedChanges,
                rejectAll: !!editor.commands?.rejectAllTrackedChanges,
                acceptById: !!editor.commands?.acceptTrackedChangeById,
                rejectById: !!editor.commands?.rejectTrackedChangeById,
              });

            } catch (err) {
              console.error('Failed to set merged content:', err);
            }
          }

          setIsLoading(false);
          
          // Notify parent that superdoc is ready
          if (onSuperdocReady) {
            onSuperdocReady(sd);
          }
        },
        onException: ({ error: err }: { error: Error }) => {
          console.error('SuperDoc error:', err);
          setError(err.message);
          setIsLoading(false);
        },
      });

      superdocRef.current = superdoc;
    } catch (err) {
      console.error('Failed to initialize SuperDoc:', err);
      setError(err instanceof Error ? err.message : 'Failed to load document');
      setIsLoading(false);
    }

    initRef.current = false;
  }, [file, mergedJson, onSuperdocReady]);

  // Effect to initialize
  useEffect(() => {
    mountedRef.current = true;
    initialize();

    return () => {
      mountedRef.current = false;
      if (superdocRef.current) {
        try {
          superdocRef.current.destroy?.();
        } catch {
          // Ignore cleanup errors
        }
        superdocRef.current = null;
      }
    };
  }, [initialize]);

  // Reinitialize when mergedJson changes
  const prevMergedRef = useRef<ProseMirrorJSON | null>(null);
  if (mergedJson !== prevMergedRef.current) {
    prevMergedRef.current = mergedJson;
    if (superdocRef.current?.activeEditor && mergedJson) {
      try {
        const editor = superdocRef.current.activeEditor;
        if (editor.commands?.setContent) {
          editor.commands.setContent(mergedJson);
        }
        // Enable track changes REVIEW mode
        if (superdocRef.current.setTrackedChangesPreferences) {
          superdocRef.current.setTrackedChangesPreferences({
            mode: 'review',
            enabled: true
          });
        }
      } catch (err) {
        console.error('Failed to update content:', err);
      }
    }
  }

  return (
    <div className={`relative flex flex-col ${className}`}>
      {/* Loading state */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-3"></div>
            <p className="text-gray-600">Loading document...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div className="text-center p-6">
            <div className="text-red-500 mb-3">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-gray-700 font-medium">Failed to load document</p>
            <p className="text-gray-500 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Document container */}
      <div
        ref={containerRef}
        className="w-full flex-1 min-h-[600px] bg-gray-100"
      />
    </div>
  );
}

/**
 * Simple Document Viewer (for V1 before comparison).
 */
function SimpleDocumentViewer({
  file,
  onReady,
  className = '',
}: {
  file: File;
  onReady?: (json: ProseMirrorJSON) => void;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<SuperDocInstance | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initRef = useRef(false);

  const initialize = useCallback(async () => {
    if (initRef.current || !containerRef.current) return;
    initRef.current = true;

    setIsLoading(true);
    setError(null);

    // Create fresh container
    const innerContainer = document.createElement('div');
    innerContainer.style.width = '100%';
    innerContainer.style.height = '100%';
    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(innerContainer);

    try {
      const { SuperDoc } = await import('superdoc');
      await import('superdoc/style.css');

      const superdoc = new SuperDoc({
        selector: innerContainer,
        document: file,
        documentMode: 'viewing',
        rulers: false,
        user: {
          name: 'Document Viewer',
          email: 'viewer@comparison.local',
        },
        onReady: ({ superdoc: sd }: { superdoc: SuperDocInstance }) => {
          superdocRef.current = sd;
          setIsLoading(false);

          // Extract and report JSON
          if (onReady && sd?.activeEditor) {
            try {
              const json = sd.activeEditor.getJSON();
              onReady(json);
            } catch (err) {
              console.error('Failed to extract JSON:', err);
            }
          }
        },
        onException: ({ error: err }: { error: Error }) => {
          console.error('SuperDoc error:', err);
          setError(err.message);
          setIsLoading(false);
        },
      });

      superdocRef.current = superdoc;
    } catch (err) {
      console.error('Failed to initialize SuperDoc:', err);
      setError(err instanceof Error ? err.message : 'Failed to load document');
      setIsLoading(false);
    }
  }, [file, onReady]);

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className={`relative ${className}`}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-3"></div>
            <p className="text-gray-600">Loading document...</p>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
          <div className="text-center p-6">
            <p className="text-red-500 font-medium">Failed to load document</p>
            <p className="text-gray-500 text-sm mt-1">{error}</p>
          </div>
        </div>
      )}

      <div
        ref={containerRef}
        className="w-full h-full min-h-[600px] bg-gray-100"
      />
    </div>
  );
}

export default function Home() {
  const {
    stage,
    setStage,
    v1File,
    setV1File,
    setV2,
    changeSet,
    setChangeSet,
    isProcessing,
    setIsProcessing,
    error,
    setError,
    reset,
  } = useDocumentStore();

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [comparison, setComparison] = useState<ComparisonState>({
    v1Json: null,
    v2Json: null,
    mergedJson: null,
    diffResult: null,
  });

  // Ref to store the active SuperDoc instance for download
  const activeSuperdocRef = useRef<SuperDocInstance | null>(null);

  /**
   * Handle download of current document as DOCX
   */
  const handleDownload = useCallback(async () => {
    if (!activeSuperdocRef.current) {
      console.warn('No active SuperDoc instance');
      return;
    }

    try {
      await activeSuperdocRef.current.export({
        exportType: ['docx'],
        exportedName: v1File?.name?.replace('.docx', '-compared') || 'document-compared',
        triggerDownload: true,
        commentsType: 'external',
      });
    } catch (err) {
      console.error('Failed to export document:', err);
      setError('Failed to download document');
    }
  }, [v1File, setError]);

  /**
   * Handle V1 file upload
   */
  const handleV1Upload = useCallback(
    (file: File) => {
      setError(null);
      setV1File(file);
      setComparison({ v1Json: null, v2Json: null, mergedJson: null, diffResult: null });
      setStage('viewing');
    },
    [setV1File, setStage, setError]
  );

  /**
   * Handle V1 JSON ready (from viewer)
   */
  const handleV1JsonReady = useCallback((json: ProseMirrorJSON) => {
    console.log('V1 JSON extracted:', json?.type);
    setComparison((prev) => ({ ...prev, v1Json: json }));
  }, []);

  /**
   * Handle V2 file upload and run comparison
   */
  const handleV2Upload = useCallback(
    async (file: File) => {
      if (!comparison.v1Json) {
        setError('V1 document not ready. Please wait for it to finish loading.');
        return;
      }

      setIsProcessing(true);
      setShowUploadModal(false);
      setStage('comparing');
      setError(null);

      try {
        // Parse V2 document
        console.log('Parsing V2 document...');
        const { json: v2Json } = await parseDocx(file);
        console.log('V2 JSON extracted:', v2Json?.type);

        // Diff the documents
        console.log('Diffing documents...');
        const diffResult = diffDocuments(comparison.v1Json, v2Json);
        console.log('Diff result:', diffResult.summary);

        // Create merged document with track changes
        console.log('Creating merged document...');
        const mergedJson = mergeDocuments(comparison.v1Json, v2Json, diffResult);
        console.log('Merged document created:', mergedJson?.type);

        // Update state
        setComparison((prev) => ({
          ...prev,
          v2Json,
          mergedJson,
          diffResult,
        }));

        // Set V2 in store (for compatibility with sidebar)
        setV2(file, { paragraphs: [], metadata: { modifiedAt: new Date() } });

        // Convert diff result to ChangeSet format for sidebar
        // Extract text changes from segments
        const textChanges = diffResult.segments
          .filter((s) => s.type !== 'equal')
          .map((s, idx) => ({
            type: s.type as 'insert' | 'delete',
            text: s.text,
            position: idx,
            paragraphIndex: 0,
          }));

        // Count changes
        const insertions = diffResult.segments.filter((s) => s.type === 'insert').length;
        const deletions = diffResult.segments.filter((s) => s.type === 'delete').length;
        const formatChangeCount = diffResult.formatChanges?.length || 0;

        const changeSetData = {
          textChanges,
          // Convert format changes to match ChangeSet interface
          formatChanges: (diffResult.formatChanges || []).map((fc, idx) => ({
            from: fc.from,
            to: fc.to,
            text: '', // Text is embedded in the merged document
            paragraphIndex: idx,
          })),
          paragraphChanges: [],
          summary: {
            totalChanges: insertions + deletions + formatChangeCount,
            insertions,
            deletions,
            formatChanges: formatChangeCount,
            paragraphsAdded: 0,
            paragraphsRemoved: 0,
            highlights: diffResult.summary,
          },
        };

        setChangeSet(changeSetData);
        setStage('result');
      } catch (err) {
        console.error('Comparison failed:', err);
        setError(err instanceof Error ? err.message : 'Comparison failed');
        setStage('viewing');
      } finally {
        setIsProcessing(false);
      }
    },
    [comparison.v1Json, setV2, setChangeSet, setStage, setIsProcessing, setError]
  );

  /**
   * Handle reset
   */
  const handleReset = useCallback(() => {
    reset();
    setComparison({ v1Json: null, v2Json: null, mergedJson: null, diffResult: null });
  }, [reset]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <Header
        showUploadButton={stage === 'viewing' || stage === 'result'}
        onUploadNewVersion={() => setShowUploadModal(true)}
        showDownloadButton={stage === 'result'}
        onDownload={handleDownload}
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

        {/* Viewing stage - show V1 document */}
        {stage === 'viewing' && v1File && (
          <div className="flex-1 flex">
            <div className="flex-1 flex flex-col">
              <SimpleDocumentViewer
                key={v1File.name + v1File.lastModified}
                file={v1File}
                onReady={handleV1JsonReady}
                className="flex-1"
              />
            </div>
          </div>
        )}

        {/* Comparing stage - show loading */}
        {stage === 'comparing' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-gray-600">Comparing documents...</p>
            </div>
          </div>
        )}

        {/* Result stage - show merged document with track changes */}
        {stage === 'result' && v1File && (
          <div className="flex-1 flex">
            {/* Document viewer with merged content */}
            <div className="flex-1 flex flex-col">
              <MergedDocumentViewer
                key={`merged-${v1File.name}`}
                file={v1File}
                mergedJson={comparison.mergedJson}
                onSuperdocReady={(sd) => { activeSuperdocRef.current = sd; }}
                className="flex-1"
              />

              {/* Summary panel (bottom) */}
              {changeSet && (
                <div className="p-4 bg-gray-50 border-t border-gray-200">
                  <ChangeSummary summary={changeSet.summary} />
                </div>
              )}
            </div>

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
