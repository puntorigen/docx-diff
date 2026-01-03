/**
 * Document Parser Service
 * Parses DOCX files into ProseMirror JSON using SuperDoc.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ProseMirrorJSON = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuperDocInstance = any;

export interface ParsedDocument {
  json: ProseMirrorJSON;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mediaFiles?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  fonts?: any;
}

/**
 * Parse a DOCX file into ProseMirror JSON using a hidden SuperDoc editor.
 * This creates a temporary editor, loads the document, extracts the JSON, and cleans up.
 */
export async function parseDocx(file: File): Promise<ParsedDocument> {
  const { SuperDoc } = await import('superdoc');

  // Create a hidden container for the editor
  const container = document.createElement('div');
  container.style.cssText =
    'position:absolute;top:-9999px;left:-9999px;width:800px;height:600px;visibility:hidden;';
  document.body.appendChild(container);

  return new Promise((resolve, reject) => {
    let superdoc: SuperDocInstance = null;
    let resolved = false;

    const cleanup = () => {
      // Delay cleanup to allow SuperDoc to finish any pending operations
      setTimeout(() => {
        if (superdoc) {
          try {
            // Set to null first to prevent any callbacks from using it
            const sd = superdoc;
            superdoc = null;
            sd.destroy?.();
          } catch (e) {
            // Ignore cleanup errors - these are expected when destroying during transition
          }
        }
        if (container.parentNode) {
          container.parentNode.removeChild(container);
        }
      }, 100);
    };

    // Small delay to avoid React StrictMode issues
    setTimeout(async () => {
      if (resolved) return;

      try {
        superdoc = new SuperDoc({
          selector: container,
          document: file,
          documentMode: 'viewing',
          rulers: false,
          user: { name: 'Parser', email: 'parser@local' },
          onReady: ({ superdoc: sd }: { superdoc: SuperDocInstance }) => {
            if (resolved) return;
            try {
              const editor = sd?.activeEditor;
              if (!editor) {
                throw new Error('No active editor found');
              }

              // Extract full ProseMirror JSON
              const json = editor.getJSON();

              resolved = true;
              cleanup();
              resolve({ json });
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
            reject(new Error('Document parsing timed out'));
          }
        }, 30000);
      } catch (err) {
        cleanup();
        reject(err);
      }
    }, 50);
  });
}

/**
 * Extract the JSON from a live SuperDoc editor instance.
 */
export function extractJSON(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  editor: any
): ProseMirrorJSON {
  if (!editor?.getJSON) {
    throw new Error('Invalid editor instance: missing getJSON method');
  }
  return editor.getJSON();
}

