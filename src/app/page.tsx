'use client';

/**
 * DocX Diff - Main Page
 * Uses docx-diff-editor package for document comparison with track changes.
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { useDocumentStore } from '@/store/document-store';
import {
  Header,
  Footer,
  DocxUploader,
  DocxViewer,
  type DocxViewerRef,
} from '@/components';
import { downloadBlob, type ComparisonResult } from '@/lib/services';
import { summarizeChanges } from '@/lib/actions/summarize';

/**
 * Get color for bullet based on change type
 */
function getBulletColor(type: string): string {
  switch (type) {
    case 'format':
      return '#F59E0B'; // amber
    case 'replacement':
      return '#007ACC'; // blue (brand)
    case 'insertion':
      return '#10B981'; // green
    case 'deletion':
      return '#EF4444'; // red
    default:
      return '#6B7280'; // gray
  }
}

export default function Home() {
  const {
    stage,
    setStage,
    v1File,
    setV1File,
    v2File,
    setV2File,
    comparisonResult,
    setComparisonResult,
    isProcessing,
    setIsProcessing,
    error,
    setError,
    reset,
  } = useDocumentStore();

  const [showUploadModal, setShowUploadModal] = useState(false);
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(true);

  // AI Summary state - structured with type for color coding
  const [aiSummary, setAiSummary] = useState<{ type: string; text: string }[] | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Ref to the DocxViewer component
  const viewerRef = useRef<DocxViewerRef>(null);

  // Track if editor is ready
  const [editorReady, setEditorReady] = useState(false);

  // Track which file has been loaded to avoid reloading
  const loadedFileRef = useRef<File | null>(null);

  /**
   * Load file into editor when both editor is ready and we have a file
   */
  useEffect(() => {
    // Only proceed if editor is ready and we have a file that hasn't been loaded
    if (!editorReady || !v1File || !viewerRef.current) return;
    if (loadedFileRef.current === v1File) return; // Already loaded this file

    const loadFile = async () => {
      try {
        console.log('[Page] Loading file into editor:', v1File.name);
        loadedFileRef.current = v1File;
        // DocxDiffEditor handles its own loading state, no need for overlay
        await viewerRef.current!.setSource(v1File);
        console.log('[Page] File loaded successfully');
      } catch (err) {
        console.error('[Page] Failed to load document:', err);
        setError(err instanceof Error ? err.message : 'Failed to load document');
        loadedFileRef.current = null; // Allow retry
      }
    };

    loadFile();
  }, [editorReady, v1File, setError]);

  /**
   * Generate AI summary when comparison completes
   */
  useEffect(() => {
    if (stage === 'result' && comparisonResult && !aiSummary && !summaryLoading) {
      generateAiSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, comparisonResult]);

  async function generateAiSummary() {
    if (!viewerRef.current) return;
    
    setSummaryLoading(true);
    try {
      // Get enriched changes from the package
      const enrichedChanges = viewerRef.current.getEnrichedChangesContext();
      
      if (enrichedChanges.length === 0) {
        setAiSummary([{ type: 'other', text: 'No changes detected' }]);
        return;
      }
      
      // Use Server Action (no public API endpoint)
      const bullets = await summarizeChanges(enrichedChanges);
      setAiSummary(bullets);
    } catch (error) {
      console.error('AI summary failed:', error);
      // Keep showing basic stats on error
    } finally {
      setSummaryLoading(false);
    }
  }

  /**
   * Handle download of current document as DOCX
   */
  const handleDownload = useCallback(async () => {
    if (!viewerRef.current) return;

    try {
      const blob = await viewerRef.current.exportDocx();
      const filename = v1File?.name?.replace('.docx', '-compared.docx') || 'document-compared.docx';
      downloadBlob(blob, filename);
    } catch (err) {
      console.error('Failed to export document:', err);
      setError('Failed to download document');
    }
  }, [v1File, setError]);

  /**
   * Handle editor ready
   */
  const handleEditorReady = useCallback(() => {
    console.log('[Page] Editor ready');
    setEditorReady(true);
  }, []);

  /**
   * Handle V1 file upload
   */
  const handleV1Upload = useCallback((file: File) => {
    console.log('[Page] V1 file uploaded:', file.name);
    setError(null);
    setV1File(file);
    setStage('viewing');
  }, [setV1File, setStage, setError]);

  /**
   * Handle V2 file upload and run comparison
   */
  const handleV2Upload = useCallback(async (file: File) => {
    if (!viewerRef.current?.isReady()) {
      setError('Document not ready. Please wait for it to finish loading.');
      return;
    }

    setShowUploadModal(false);
    setError(null);
    setAiSummary(null); // Reset AI summary for new comparison
    // DocxDiffEditor handles its own loading state during comparison

    try {
      // Use the package's compareWith method - it handles everything!
      const result = await viewerRef.current.compareWith(file);
      
      setV2File(file);
      setComparisonResult(result);
      setIsSummaryExpanded(true);
      // Stage is set to 'result' by setComparisonResult
    } catch (err) {
      console.error('Comparison failed:', err);
      setError(err instanceof Error ? err.message : 'Comparison failed');
    }
  }, [setV2File, setComparisonResult, setError]);

  /**
   * Handle reset
   */
  const handleReset = useCallback(() => {
    reset();
    setAiSummary(null);
    setEditorReady(false);
    loadedFileRef.current = null;
  }, [reset]);

  // Convenience accessor for comparison stats
  const stats = comparisonResult ? {
    totalChanges: comparisonResult.totalChanges,
    insertions: comparisonResult.insertions,
    deletions: comparisonResult.deletions,
    formatChanges: comparisonResult.formatChanges,
    structuralChanges: comparisonResult.structuralChanges,
  } : null;

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      <Header
        showUploadButton={stage === 'viewing' || stage === 'result'}
        onUploadNewVersion={() => setShowUploadModal(true)}
        showDownloadButton={stage === 'result'}
        onDownload={handleDownload}
        onReset={stage !== 'upload' ? handleReset : undefined}
        v1FileName={v1File?.name}
        v2FileName={v2File?.name}
        changeCount={stats?.totalChanges}
      />

      <main className="flex-1 flex min-h-0">
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

        {/* Viewing/Comparing/Result stage - show document viewer */}
        {(stage === 'viewing' || stage === 'comparing' || stage === 'result') && v1File && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Collapsible change summary notification */}
            {stage === 'result' && stats && (
              <div className="mx-4 mt-4 mb-2 rounded-xl shadow-sm flex-shrink-0 overflow-hidden" style={{ backgroundColor: '#E8F0F8', border: '1px solid #007ACC' }}>
                {/* Header - always visible */}
                <div 
                  className="p-4 flex items-center justify-between gap-4 cursor-pointer select-none"
                  onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#007ACC' }}>
                      <span className="text-lg text-white">✓</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold" style={{ color: '#005B9C' }}>
                        Main changes detected in new version
                      </h3>
                      {/* Show change count badge when collapsed */}
                      {!isSummaryExpanded && stats.totalChanges > 0 && (
                        <span className="text-xs px-2 py-0.5 rounded-full text-white" style={{ backgroundColor: '#007ACC' }}>
                          {stats.totalChanges} change{stats.totalChanges !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    className="flex-shrink-0 p-1.5 rounded-lg transition-all hover:opacity-70 cursor-pointer"
                    style={{ backgroundColor: '#007ACC' }}
                    title={isSummaryExpanded ? 'Collapse' : 'Expand'}
                  >
                    <svg 
                      className="w-4 h-4 text-white transition-transform duration-300"
                      style={{ transform: isSummaryExpanded ? 'rotate(0deg)' : 'rotate(180deg)' }}
                      fill="none" 
                      stroke="currentColor" 
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                </div>

                {/* Collapsible content */}
                <div 
                  className="overflow-hidden transition-all duration-300 ease-in-out"
                  style={{ 
                    maxHeight: isSummaryExpanded ? '500px' : '0',
                    opacity: isSummaryExpanded ? 1 : 0,
                  }}
                >
                  <div className="px-4 pb-4 pl-[4.25rem] text-sm text-gray-600 space-y-2">
                    {stats.totalChanges > 0 ? (
                      <>
                        {/* AI Summary or loading */}
                        {summaryLoading ? (
                          <p className="flex items-center gap-2">
                            <span className="inline-block w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                            <span className="text-gray-500">Analyzing changes...</span>
                          </p>
                        ) : aiSummary && aiSummary.length > 0 ? (
                          <ul className="space-y-1.5">
                            {aiSummary.map((bullet, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span 
                                  className="inline-block w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                                  style={{ backgroundColor: getBulletColor(bullet.type) }}
                                />
                                <span>{bullet.text}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>
                            Found <span className="font-medium" style={{ color: '#007ACC' }}>{stats.totalChanges} change{stats.totalChanges !== 1 ? 's' : ''}</span>
                            {stats.insertions > 0 && (
                              <span className="text-green-600"> • {stats.insertions} insertion{stats.insertions !== 1 ? 's' : ''}</span>
                            )}
                            {stats.deletions > 0 && (
                              <span className="text-red-600"> • {stats.deletions} deletion{stats.deletions !== 1 ? 's' : ''}</span>
                            )}
                            {stats.formatChanges > 0 && (
                              <span className="text-amber-600"> • {stats.formatChanges} format change{stats.formatChanges !== 1 ? 's' : ''}</span>
                            )}
                            {stats.structuralChanges > 0 && (
                              <span className="text-purple-600"> • {stats.structuralChanges} structural change{stats.structuralChanges !== 1 ? 's' : ''}</span>
                            )}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          Use the track change bubbles in the document to accept or reject each change.
                        </p>
                      </>
                    ) : (
                      <p>No changes detected between the two versions.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Document viewer */}
            <div className="flex-1 flex flex-col min-h-0 mx-4 mb-4">
              <DocxViewer
                ref={viewerRef}
                onReady={handleEditorReady}
                showRulers={stage === 'result'}
                className="flex-1 min-h-0 rounded-lg overflow-hidden border border-gray-200 shadow-sm"
              />
            </div>
          </div>
        )}

        {/* DocxDiffEditor handles its own loading states */}

        {/* Error toast */}
        {error && (
          <div className="fixed bottom-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-3">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-2 hover:text-red-200 cursor-pointer">
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
                <h2 className="text-lg font-semibold" style={{ color: '#005B9C' }}>
                  Upload new version
                </h2>
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="p-1 rounded hover:opacity-70 transition-opacity cursor-pointer"
                  style={{ color: '#007ACC' }}
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

      <Footer />
    </div>
  );
}
