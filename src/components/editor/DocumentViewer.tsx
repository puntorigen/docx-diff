'use client';

/**
 * Document Viewer Component
 * Wrapper for SuperDoc editor display.
 */

import { useEffect, useRef, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuperDocInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorInstance = any;

interface DocumentViewerProps {
  file: File;
  onReady?: (superdoc: SuperDocInstance, editor: EditorInstance) => void;
  documentMode?: 'editing' | 'suggesting' | 'viewing';
  className?: string;
}

export function DocumentViewer({
  file,
  onReady,
  documentMode = 'viewing',
  className = '',
}: DocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const superdocRef = useRef<SuperDocInstance | null>(null);
  const onReadyRef = useRef(onReady);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Keep onReady ref updated
  onReadyRef.current = onReady;

  useEffect(() => {
    let isCancelled = false;
    let superdocInstance: SuperDocInstance | null = null;
    let innerContainer: HTMLDivElement | null = null;
    let initTimeout: NodeJS.Timeout | null = null;

    const initializeSuperDoc = async () => {
      const container = containerRef.current;
      if (!container || isCancelled) return;

      try {
        // Dynamic imports for client-side only
        const { SuperDoc } = await import('superdoc');
        // @ts-expect-error - CSS import doesn't have types
        await import('superdoc/style.css');

        // Check if cancelled after async imports
        if (isCancelled) return;

        // Create a fresh inner container
        innerContainer = document.createElement('div');
        innerContainer.style.width = '100%';
        innerContainer.style.height = '100%';
        container.innerHTML = '';
        container.appendChild(innerContainer);

        superdocInstance = new SuperDoc({
          selector: innerContainer,
          document: file,
          documentMode,
          rulers: false,
          user: {
            name: 'Comparison User',
            email: 'comparison@example.com',
          },
          onReady: () => {
            if (isCancelled) return;
            setIsLoading(false);
            superdocRef.current = superdocInstance;
            // Get the active editor from superdoc once it's ready
            const editor = superdocInstance?.activeEditor;
            if (onReadyRef.current && editor) {
              onReadyRef.current(superdocInstance, editor);
            }
          },
          onException: ({ error: err }: { error: Error }) => {
            if (isCancelled) return;
            console.error('SuperDoc error:', err);
            setError(err.message);
            setIsLoading(false);
          },
        });
      } catch (err) {
        if (isCancelled) return;
        console.error('Failed to initialize SuperDoc:', err);
        setError(err instanceof Error ? err.message : 'Failed to load document');
        setIsLoading(false);
      }
    };

    // Small delay to let React StrictMode's double-mount settle
    // This prevents the first mount from initializing SuperDoc just to be destroyed
    initTimeout = setTimeout(() => {
      if (!isCancelled) {
        setIsLoading(true);
        setError(null);
        initializeSuperDoc();
      }
    }, 50);

    return () => {
      isCancelled = true;
      if (initTimeout) {
        clearTimeout(initTimeout);
      }
      if (superdocInstance) {
        try {
          superdocInstance.destroy?.();
        } catch {
          // Ignore cleanup errors
        }
      }
      superdocRef.current = null;
    };
  }, [file, documentMode]);

  return (
    <div className={`relative ${className}`}>
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-80 z-10">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-3"></div>
            <p className="text-gray-600">Loading document...</p>
          </div>
        </div>
      )}

      {/* Error display */}
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

      {/* SuperDoc container */}
      <div
        ref={containerRef}
        className="w-full h-full min-h-[600px] bg-gray-100"
      />
    </div>
  );
}
