'use client';

/**
 * DocX Diff - Main Page
 * Uses "Merge and Mark" approach: builds a merged document with track change marks.
 */

import { useCallback, useRef, useState, useEffect } from 'react';
import { useDocumentStore } from '@/store/document-store';
import {
  Header,
  Footer,
  DocxUploader,
  SuperDocViewer,
} from '@/components';
import {
  parseDocx,
  diffDocuments,
  mergeDocuments,
  ExportPreparation,
  downloadBlob,
  extractEnrichedChanges,
  type ProseMirrorJSON,
  type DiffResult,
} from '@/lib/services';
import { summarizeChanges } from '@/lib/actions/summarize';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuperDocInstance = any;

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

interface ComparisonState {
  v1Json: ProseMirrorJSON | null;
  v2Json: ProseMirrorJSON | null;
  mergedJson: ProseMirrorJSON | null;
  diffResult: DiffResult | null;
}

export default function Home() {
  const {
    stage,
    setStage,
    v1File,
    setV1File,
    v2File,
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
  const [showChangeSummary, setShowChangeSummary] = useState(true);
  const [comparison, setComparison] = useState<ComparisonState>({
    v1Json: null,
    v2Json: null,
    mergedJson: null,
    diffResult: null,
  });

  // AI Summary state - structured with type for color coding
  const [aiSummary, setAiSummary] = useState<{ type: string; text: string }[] | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Ref to store the active SuperDoc instance for download
  const activeSuperdocRef = useRef<SuperDocInstance | null>(null);

  /**
   * Generate AI summary when comparison completes
   */
  useEffect(() => {
    if (stage === 'result' && comparison.mergedJson && !aiSummary && !summaryLoading) {
      generateAiSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage, comparison.mergedJson]);

  async function generateAiSummary() {
    if (!comparison.mergedJson) return;
    
    setSummaryLoading(true);
    try {
      const enrichedChanges = extractEnrichedChanges(comparison.mergedJson);
      
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
    const superdoc = activeSuperdocRef.current;
    if (!superdoc) return;

    const editor = superdoc.activeEditor;
    try {
      const originalJson = editor.getJSON();
      const exportPrep = new ExportPreparation(superdoc);
      const { patchedDocJson, fixedComments } = exportPrep.prepare();

      // Helper to set content
      const setEditorContent = (json: typeof originalJson) => {
        if (editor.commands?.setContent) {
          editor.commands.setContent(json);
        } else if (editor.setContent) {
          editor.setContent(json);
        } else {
          const { state, view } = editor;
          if (state?.doc && view && json.content) {
            const newDoc = state.schema.nodeFromJSON(json);
            const tr = state.tr.replaceWith(0, state.doc.content.size, newDoc.content);
            view.dispatch(tr);
          }
        }
      };

      // Apply patch → Export → Restore
      setEditorContent(patchedDocJson);
      const blob = await editor.exportDocx({
        isFinalDoc: false,
        commentsType: 'external',
        comments: fixedComments,
      });
      setEditorContent(originalJson);

      if (blob) {
        const filename = v1File?.name?.replace('.docx', '-compared.docx') || 'document-compared.docx';
        downloadBlob(blob, filename);
      } else {
        throw new Error('Export returned no data');
      }
    } catch (err) {
      console.error('Failed to export document:', err);
      setError('Failed to download document');
    }
  }, [v1File, setError]);

  /**
   * Handle V1 file upload
   */
  const handleV1Upload = useCallback((file: File) => {
    setError(null);
    setV1File(file);
    setComparison({ v1Json: null, v2Json: null, mergedJson: null, diffResult: null });
    setStage('viewing');
  }, [setV1File, setStage, setError]);

  /**
   * Handle V1 JSON ready (from viewer)
   */
  const handleV1JsonReady = useCallback((json: ProseMirrorJSON) => {
    setComparison((prev) => ({ ...prev, v1Json: json }));
  }, []);

  /**
   * Handle V2 file upload and run comparison
   */
  const handleV2Upload = useCallback(async (file: File) => {
    if (!comparison.v1Json) {
      setError('V1 document not ready. Please wait for it to finish loading.');
      return;
    }

    setIsProcessing(true);
    setShowUploadModal(false);
    setStage('comparing');
    setError(null);
    setAiSummary(null); // Reset AI summary for new comparison

    try {
      // Parse V2 and diff
      const { json: v2Json } = await parseDocx(file);
      const diffResult = diffDocuments(comparison.v1Json, v2Json);
      const mergedJson = mergeDocuments(comparison.v1Json, v2Json, diffResult);

      setComparison((prev) => ({ ...prev, v2Json, mergedJson, diffResult }));
      setV2(file, { paragraphs: [], metadata: { modifiedAt: new Date() } });

      // Build change set for UI
      const textChanges = diffResult.segments
        .filter((s) => s.type !== 'equal')
        .map((s, idx) => ({
          type: s.type as 'insert' | 'delete',
          text: s.text,
          position: idx,
          paragraphIndex: 0,
        }));

      const insertions = diffResult.segments.filter((s) => s.type === 'insert').length;
      const deletions = diffResult.segments.filter((s) => s.type === 'delete').length;
      const formatChangeCount = diffResult.formatChanges?.length || 0;

      setChangeSet({
        textChanges,
        formatChanges: (diffResult.formatChanges || []).map((fc, idx) => ({
          from: fc.from,
          to: fc.to,
          text: '',
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
      });

      setShowChangeSummary(true);
      setStage('result');
    } catch (err) {
      console.error('Comparison failed:', err);
      setError(err instanceof Error ? err.message : 'Comparison failed');
      setStage('viewing');
    } finally {
      setIsProcessing(false);
    }
  }, [comparison.v1Json, setV2, setChangeSet, setStage, setIsProcessing, setError]);

  /**
   * Handle reset
   */
  const handleReset = useCallback(() => {
    reset();
    setComparison({ v1Json: null, v2Json: null, mergedJson: null, diffResult: null });
  }, [reset]);

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
        changeCount={changeSet?.summary.totalChanges}
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

        {/* Viewing stage - show V1 document */}
        {stage === 'viewing' && v1File && (
          <div className="flex-1 flex flex-col min-h-0">
            <SuperDocViewer
              key={v1File.name + v1File.lastModified}
              file={v1File}
              onJsonReady={handleV1JsonReady}
              className="flex-1 min-h-0"
            />
          </div>
        )}

        {/* Comparing stage - show loading */}
        {stage === 'comparing' && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto mb-4" style={{ borderColor: '#007ACC' }} />
              <p className="text-gray-600">Comparing documents...</p>
            </div>
          </div>
        )}

        {/* Result stage - show merged document with track changes */}
        {stage === 'result' && v1File && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Change summary notification */}
            {changeSet && showChangeSummary && (
              <div className="mx-4 mt-4 mb-2 p-4 rounded-xl shadow-sm flex-shrink-0" style={{ backgroundColor: '#E8F0F8', border: '1px solid #007ACC' }}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: '#007ACC' }}>
                      <span className="text-lg text-white">✓</span>
                    </div>
                    <div>
                      <h3 className="font-semibold mb-1" style={{ color: '#005B9C' }}>
                        Main changes detected in new version
                      </h3>
                      <div className="text-sm text-gray-600 space-y-2">
                        {changeSet.summary.totalChanges > 0 ? (
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
                                Found <span className="font-medium" style={{ color: '#007ACC' }}>{changeSet.summary.totalChanges} change{changeSet.summary.totalChanges !== 1 ? 's' : ''}</span>
                                {changeSet.summary.insertions > 0 && (
                                  <span className="text-green-600"> • {changeSet.summary.insertions} insertion{changeSet.summary.insertions !== 1 ? 's' : ''}</span>
                                )}
                                {changeSet.summary.deletions > 0 && (
                                  <span className="text-red-600"> • {changeSet.summary.deletions} deletion{changeSet.summary.deletions !== 1 ? 's' : ''}</span>
                                )}
                                {changeSet.summary.formatChanges > 0 && (
                                  <span className="text-amber-600"> • {changeSet.summary.formatChanges} format change{changeSet.summary.formatChanges !== 1 ? 's' : ''}</span>
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
                  <button
                    onClick={() => setShowChangeSummary(false)}
                    className="flex-shrink-0 p-1.5 rounded-lg transition-opacity hover:opacity-70 cursor-pointer"
                    style={{ backgroundColor: '#007ACC' }}
                    title="Dismiss"
                  >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Document viewer with merged content */}
            <div className="flex-1 flex flex-col min-h-0 mx-4 mb-4">
              <SuperDocViewer
                key={`merged-${v1File.name}`}
                file={v1File}
                content={comparison.mergedJson}
                onSuperdocReady={(sd) => { activeSuperdocRef.current = sd; }}
                showRulers
                reviewMode
                className="flex-1 min-h-0 rounded-lg overflow-hidden border border-gray-200 shadow-sm"
              />
            </div>
          </div>
        )}

        {/* Processing overlay */}
        {isProcessing && (
          <div className="fixed inset-0 bg-black bg-opacity-30 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 shadow-xl flex flex-col items-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4" />
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
