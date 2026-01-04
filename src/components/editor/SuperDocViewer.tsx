'use client';

/**
 * Unified SuperDoc Viewer Component
 * Handles both simple document viewing and merged document display with track changes.
 */

import { useCallback, useRef, useState, useEffect } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuperDocInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProseMirrorJSON = any;

interface SuperDocViewerProps {
  /** The DOCX file to load as base document */
  file: File;
  /** Optional merged JSON content to inject after loading */
  content?: ProseMirrorJSON;
  /** Callback when JSON is extracted from the document */
  onJsonReady?: (json: ProseMirrorJSON) => void;
  /** Callback when SuperDoc instance is ready (for export access) */
  onSuperdocReady?: (superdoc: SuperDocInstance) => void;
  /** Show rulers in the editor */
  showRulers?: boolean;
  /** Enable track changes review mode */
  reviewMode?: boolean;
  /** Additional CSS classes */
  className?: string;
}

const SUPERDOC_USER = {
  name: 'DocX Diff User',
  email: 'tool@docxdiff.com',
};

/**
 * Permission resolver that allows accepting/rejecting all track changes
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const permissionResolver = ({ permission }: any) => {
  const allowedPermissions = ['RESOLVE_OWN', 'RESOLVE_OTHER', 'REJECT_OWN', 'REJECT_OTHER'];
  return allowedPermissions.includes(permission) ? true : undefined;
};

export function SuperDocViewer({
  file,
  content,
  onJsonReady,
  onSuperdocReady,
  showRulers = false,
  reviewMode = false,
  className = '',
}: SuperDocViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<SuperDocInstance | null>(null);
  const mountedRef = useRef(true);
  const initRef = useRef(false);
  const prevContentRef = useRef<ProseMirrorJSON | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Generate unique IDs for this instance
  const instanceId = useRef(`sd-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const editorId = `superdoc-editor-${instanceId.current}`;
  const toolbarId = `superdoc-toolbar-${instanceId.current}`;

  /**
   * Set content in the editor using available methods
   */
  const setEditorContent = useCallback((editor: SuperDocInstance, json: ProseMirrorJSON) => {
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
  }, []);

  /**
   * Enable track changes review mode
   */
  const enableReviewMode = useCallback((sd: SuperDocInstance) => {
    if (sd.setTrackedChangesPreferences) {
      sd.setTrackedChangesPreferences({ mode: 'review', enabled: true });
    } else if (sd.activeEditor?.commands?.enableTrackChanges) {
      sd.activeEditor.commands.enableTrackChanges();
    }
  }, []);

  /**
   * Initialize SuperDoc instance
   */
  const initialize = useCallback(async () => {
    if (initRef.current || !containerRef.current || !toolbarRef.current || !mountedRef.current) return;
    initRef.current = true;

    // Small delay for React to settle
    await new Promise(resolve => setTimeout(resolve, 100));
    
    if (!mountedRef.current || !containerRef.current || !toolbarRef.current) {
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

    // Set IDs on DOM elements
    containerRef.current.id = editorId;
    toolbarRef.current.id = toolbarId;

    try {
      const { SuperDoc } = await import('superdoc');
      await import('superdoc/style.css');

      const superdoc = new SuperDoc({
        selector: `#${editorId}`,
        toolbar: `#${toolbarId}`,
        document: file,
        documentMode: 'editing',
        role: 'editor',
        rulers: showRulers,
        user: SUPERDOC_USER,
        permissionResolver,
        onReady: ({ superdoc: sd }: { superdoc: SuperDocInstance }) => {
          superdocRef.current = sd;

          // Inject content if provided
          if (content && sd?.activeEditor) {
            try {
              setEditorContent(sd.activeEditor, content);
              if (reviewMode) enableReviewMode(sd);
            } catch (err) {
              console.error('Failed to set content:', err);
            }
          }

          // Extract JSON if callback provided
          if (onJsonReady && sd?.activeEditor) {
            try {
              onJsonReady(sd.activeEditor.getJSON());
            } catch (err) {
              console.error('Failed to extract JSON:', err);
            }
          }

          setIsLoading(false);
          onSuperdocReady?.(sd);
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
  }, [file, content, showRulers, reviewMode, onJsonReady, onSuperdocReady, setEditorContent, enableReviewMode, editorId, toolbarId]);

  // Initialize on mount
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

  // Update content when it changes (for merged documents)
  if (content !== prevContentRef.current) {
    prevContentRef.current = content;
    if (superdocRef.current?.activeEditor && content) {
      try {
        setEditorContent(superdocRef.current.activeEditor, content);
        if (reviewMode) enableReviewMode(superdocRef.current);
      } catch (err) {
        console.error('Failed to update content:', err);
      }
    }
  }

  return (
    <div className={`relative flex flex-col ${className}`}>
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-3" />
            <p className="text-gray-600">Loading document...</p>
          </div>
        </div>
      )}

      {/* Error overlay */}
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

      {/* Toolbar */}
      <div ref={toolbarRef} className="border-b border-gray-200 bg-gray-50 flex-shrink-0" />

      {/* Editor container */}
      <div ref={containerRef} className="flex-1 min-h-0 overflow-auto" />
    </div>
  );
}

export default SuperDocViewer;

