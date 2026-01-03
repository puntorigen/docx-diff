'use client';

/**
 * SuperDoc Hook
 * Manages SuperDoc instance lifecycle.
 */

import { useRef, useCallback, useEffect } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuperDocInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorInstance = any;

interface UseSuperDocOptions {
  onReady?: (superdoc: SuperDocInstance) => void;
  onEditorCreate?: (editor: EditorInstance) => void;
  documentMode?: 'editing' | 'suggesting' | 'viewing';
}

export function useSuperDoc(options: UseSuperDocOptions = {}) {
  const superdocRef = useRef<SuperDocInstance | null>(null);
  const editorRef = useRef<EditorInstance | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const initializeSuperDoc = useCallback(
    async (file: File) => {
      if (!containerRef.current) {
        console.error('Container ref not set');
        return;
      }

      // Clean up previous instance
      if (superdocRef.current) {
        superdocRef.current.destroy?.();
        superdocRef.current = null;
        editorRef.current = null;
      }

      try {
        // Dynamic import to avoid SSR issues
        const { SuperDoc } = await import('superdoc');
        // @ts-expect-error - CSS import doesn't have types
        await import('superdoc/style.css');

        const superdoc = new SuperDoc({
          selector: containerRef.current,
          document: file,
          documentMode: options.documentMode || 'editing',
          rulers: false,
          user: {
            name: 'Comparison User',
            email: 'comparison@example.com',
          },
          onReady: ({ superdoc: sd }: { superdoc: SuperDocInstance }) => {
            superdocRef.current = sd;
            options.onReady?.(sd);
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onEditorCreate: (event: any) => {
            const editor = event?.editor || event;
            editorRef.current = editor;
            options.onEditorCreate?.(editor);
          },
        });

        superdocRef.current = superdoc;
      } catch (error) {
        console.error('Failed to initialize SuperDoc:', error);
        throw error;
      }
    },
    [options]
  );

  const destroy = useCallback(() => {
    if (superdocRef.current) {
      superdocRef.current.destroy?.();
      superdocRef.current = null;
      editorRef.current = null;
    }
  }, []);

  const setDocumentMode = useCallback(
    (mode: 'editing' | 'suggesting' | 'viewing') => {
      if (superdocRef.current?.setDocumentMode) {
        superdocRef.current.setDocumentMode(mode);
      }
    },
    []
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      destroy();
    };
  }, [destroy]);

  return {
    containerRef,
    superdocRef,
    editorRef,
    initializeSuperDoc,
    destroy,
    setDocumentMode,
  };
}

