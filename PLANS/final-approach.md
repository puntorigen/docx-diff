# DOCX Comparison Engine - Final Implementation Guide

This document describes the complete implementation of a DOCX comparison engine using SuperDoc. It can be used as a reference to rebuild this solution in other projects.

## Overview

The solution uses a **"Merge and Mark"** approach:
1. Parse both DOCX files to ProseMirror JSON
2. Perform character-level diff on the text content
3. Clone the original document and inject track change marks
4. Load the merged document into SuperDoc with track changes enabled

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DOCX COMPARISON FLOW                            │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌──────────┐        ┌──────────┐                                     │
│   │  V1.docx │        │  V2.docx │                                     │
│   └────┬─────┘        └────┬─────┘                                     │
│        │                   │                                            │
│        ▼                   ▼                                            │
│   ┌─────────────────────────────────┐                                  │
│   │      parseDocx() - Hidden       │   Parse via hidden               │
│   │      SuperDoc Instances         │   SuperDoc editors               │
│   └────────────┬────────────────────┘                                  │
│                │                                                        │
│                ▼                                                        │
│   ┌──────────────────┐  ┌──────────────────┐                           │
│   │   V1 JSON (docA) │  │   V2 JSON (docB) │                           │
│   └────────┬─────────┘  └────────┬─────────┘                           │
│            │                     │                                      │
│            └──────────┬──────────┘                                      │
│                       │                                                 │
│                       ▼                                                 │
│   ┌───────────────────────────────────────┐                            │
│   │         diffDocuments()               │   Character-level          │
│   │   Extract text → diff-match-patch     │   diff                     │
│   └────────────────────┬──────────────────┘                            │
│                        │                                                │
│                        ▼                                                │
│   ┌────────────────────────────────────────┐                           │
│   │  DiffResult: segments[], textA, textB  │                           │
│   │  [equal, delete, insert, equal, ...]   │                           │
│   └────────────────────┬───────────────────┘                           │
│                        │                                                │
│                        ▼                                                │
│   ┌────────────────────────────────────────┐                           │
│   │         mergeDocuments()               │   Clone docA, inject      │
│   │   docA + diffResult → mergedDoc        │   track change marks      │
│   └────────────────────┬───────────────────┘                           │
│                        │                                                │
│                        ▼                                                │
│   ┌────────────────────────────────────────┐                           │
│   │     Merged JSON with trackInsert       │                           │
│   │     and trackDelete marks              │                           │
│   └────────────────────┬───────────────────┘                           │
│                        │                                                │
│                        ▼                                                │
│   ┌────────────────────────────────────────┐                           │
│   │    SuperDoc (review mode)              │   Display with            │
│   │    - Red strikethrough = deletions     │   visual styling          │
│   │    - Green underline = insertions      │                           │
│   └────────────────────────────────────────┘                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Dependencies

```json
{
  "dependencies": {
    "superdoc": "^x.x.x",
    "diff-match-patch": "^1.0.5",
    "uuid": "^9.0.0"
  }
}
```

## File Structure

```
src/lib/services/
├── documentParser.ts      # DOCX → ProseMirror JSON
├── documentDiffer.ts      # Character-level diff
├── mergeDocuments.ts      # Apply track changes to cloned doc
├── trackChangeInjector.ts # Create track change marks
└── index.ts               # Export all services
```

---

## Step 1: Document Parser

Parses DOCX files into ProseMirror JSON using a hidden SuperDoc editor.

```typescript
// documentParser.ts

export type ProseMirrorJSON = any;
type SuperDocInstance = any;

export interface ParsedDocument {
  json: ProseMirrorJSON;
}

/**
 * Parse a DOCX file into ProseMirror JSON using a hidden SuperDoc editor.
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
            const sd = superdoc;
            superdoc = null;
            sd.destroy?.();
          } catch (e) {
            // Ignore cleanup errors
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
```

**Key Points:**
- Uses a hidden DOM element to mount SuperDoc
- Extracts JSON via `editor.getJSON()`
- Includes delayed cleanup to prevent errors during destroy
- 50ms initial delay helps with React StrictMode

---

## Step 2: Document Differ

Performs character-level diff using diff-match-patch.

```typescript
// documentDiffer.ts

import DiffMatchPatch from 'diff-match-patch';
import type { ProseMirrorJSON } from './documentParser';

const dmp = new DiffMatchPatch();

const DIFF_DELETE = -1;
const DIFF_INSERT = 1;
const DIFF_EQUAL = 0;

export interface DiffSegment {
  type: 'equal' | 'insert' | 'delete';
  text: string;
}

export interface DiffResult {
  segments: DiffSegment[];
  textA: string;
  textB: string;
  summary: string[];
}

/**
 * Extract text content from a ProseMirror node recursively.
 */
function extractTextContent(node: ProseMirrorJSON): string {
  if (!node) return '';

  if (node.type === 'text' && node.text) {
    return node.text;
  }

  if (node.content && Array.isArray(node.content)) {
    return node.content.map(extractTextContent).join('');
  }

  return '';
}

/**
 * Diff two ProseMirror JSON documents at the character level.
 */
export function diffDocuments(
  docA: ProseMirrorJSON,
  docB: ProseMirrorJSON
): DiffResult {
  // Extract full text from both documents
  const textA = extractTextContent(docA);
  const textB = extractTextContent(docB);

  // Perform character-level diff
  const diffs = dmp.diff_main(textA, textB);
  dmp.diff_cleanupSemantic(diffs);

  // Convert to segments
  const segments: DiffSegment[] = [];
  let insertCount = 0;
  let deleteCount = 0;

  for (const [op, text] of diffs) {
    if (op === DIFF_EQUAL) {
      segments.push({ type: 'equal', text });
    } else if (op === DIFF_INSERT) {
      segments.push({ type: 'insert', text });
      insertCount++;
    } else if (op === DIFF_DELETE) {
      segments.push({ type: 'delete', text });
      deleteCount++;
    }
  }

  // Build summary
  const summary: string[] = [];
  if (insertCount > 0) summary.push(`${insertCount} insertion(s)`);
  if (deleteCount > 0) summary.push(`${deleteCount} deletion(s)`);
  if (insertCount === 0 && deleteCount === 0) {
    summary.push('No text changes detected');
  }

  return { segments, textA, textB, summary };
}
```

**Key Points:**
- Uses `diff_cleanupSemantic` for more readable diffs
- Recursively extracts text from nested ProseMirror nodes
- Returns segments that can be mapped back to document positions

---

## Step 3: Track Change Injector

Creates SuperDoc-compatible track change marks.

```typescript
// trackChangeInjector.ts

import { v4 as uuidv4 } from 'uuid';

type ProseMirrorJSON = any;

export interface TrackChangeAuthor {
  name: string;
  email: string;
}

const DEFAULT_AUTHOR: TrackChangeAuthor = {
  name: 'Comparison Tool',
  email: 'comparison@tool.local',
};

/**
 * Create a trackInsert mark for new content.
 */
export function createTrackInsertMark(author: TrackChangeAuthor = DEFAULT_AUTHOR) {
  return {
    type: 'trackInsert',
    attrs: {
      id: uuidv4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: '',
      date: new Date().toISOString(),
    },
  };
}

/**
 * Create a trackDelete mark for removed content.
 */
export function createTrackDeleteMark(author: TrackChangeAuthor = DEFAULT_AUTHOR) {
  return {
    type: 'trackDelete',
    attrs: {
      id: uuidv4(),
      author: author.name,
      authorEmail: author.email,
      authorImage: '',
      date: new Date().toISOString(),
    },
  };
}

/**
 * Create a trackFormat mark for formatting changes.
 */
export function createTrackFormatMark(
  before: any[],
  after: any[],
  author: TrackChangeAuthor = DEFAULT_AUTHOR
) {
  return {
    type: 'trackFormat',
    attrs: {
      id: uuidv4(),
      author: author.name,
      authorEmail: author.email,
      date: new Date().toISOString(),
      before,
      after,
    },
  };
}
```

**Mark Schema:**
```typescript
// Track change marks used by SuperDoc
interface TrackInsertMark {
  type: 'trackInsert';
  attrs: {
    id: string;         // Unique ID (UUID)
    author: string;     // Author name
    authorEmail: string; // Author email
    authorImage: string; // Author image URL (optional)
    date: string;       // ISO date string
  };
}

interface TrackDeleteMark {
  type: 'trackDelete';
  attrs: {
    id: string;
    author: string;
    authorEmail: string;
    authorImage: string;
    date: string;
  };
}
```

---

## Step 4: Merge Documents

The core algorithm that clones the original document and injects track change marks.

```typescript
// mergeDocuments.ts

import type { DiffResult } from './documentDiffer';
import { createTrackInsertMark, createTrackDeleteMark, type TrackChangeAuthor } from './trackChangeInjector';

type ProseMirrorNode = any;

const DEFAULT_AUTHOR: TrackChangeAuthor = {
  name: 'Comparison Tool',
  email: 'comparison@tool.local',
};

function cloneNode(node: ProseMirrorNode): ProseMirrorNode {
  return JSON.parse(JSON.stringify(node));
}

/**
 * Merge documents by applying diff segments to the original structure.
 * 
 * Algorithm:
 * 1. Clone docA (preserves original structure/formatting)
 * 2. Build character state map from diff segments
 * 3. Recursively transform text nodes:
 *    - 'equal' text: keep original marks
 *    - 'delete' text: add trackDelete mark
 *    - 'insert' text: inject new nodes with trackInsert mark
 */
export function mergeDocuments(
  docA: ProseMirrorNode,
  docB: ProseMirrorNode,
  diffResult: DiffResult,
  author: TrackChangeAuthor = DEFAULT_AUTHOR
): ProseMirrorNode {
  // Clone the original document
  const merged = cloneNode(docA);

  // Build character state map: for each char in docA, what's its state?
  interface CharState {
    type: 'equal' | 'delete';
  }
  
  const charStates: CharState[] = [];
  let insertions: { afterOffset: number; text: string }[] = [];
  
  let docAOffset = 0;
  for (const segment of diffResult.segments) {
    if (segment.type === 'equal') {
      for (let i = 0; i < segment.text.length; i++) {
        charStates[docAOffset + i] = { type: 'equal' };
      }
      docAOffset += segment.text.length;
    } else if (segment.type === 'delete') {
      for (let i = 0; i < segment.text.length; i++) {
        charStates[docAOffset + i] = { type: 'delete' };
      }
      docAOffset += segment.text.length;
    } else if (segment.type === 'insert') {
      // Insertions don't consume docA chars - track where to insert
      insertions.push({
        afterOffset: docAOffset,
        text: segment.text,
      });
    }
  }

  // Transform function: recursively process nodes
  function transformNode(
    node: ProseMirrorNode,
    nodeOffset: number,
    path: number[]
  ): { nodes: ProseMirrorNode[]; consumedLength: number } {
    
    // Text node: split by character states and inject marks
    if (node.type === 'text' && node.text) {
      const text = node.text;
      const result: ProseMirrorNode[] = [];
      let i = 0;

      while (i < text.length) {
        const charOffset = nodeOffset + i;
        const charState = charStates[charOffset] || { type: 'equal' };

        // Check for insertions at this position
        const insertionsHere = insertions.filter(ins => ins.afterOffset === charOffset);
        for (const ins of insertionsHere) {
          result.push({
            type: 'text',
            text: ins.text,
            marks: [...(node.marks || []), createTrackInsertMark(author)],
          });
        }

        // Find run of same state (optimization: group consecutive same-state chars)
        let j = i + 1;
        while (j < text.length) {
          const nextState = charStates[nodeOffset + j] || { type: 'equal' };
          if (nextState.type !== charState.type) break;
          if (insertions.some(ins => ins.afterOffset === nodeOffset + j)) break;
          j++;
        }

        const chunk = text.substring(i, j);
        const marks = [...(node.marks || [])];

        if (charState.type === 'delete') {
          marks.push(createTrackDeleteMark(author));
        }

        result.push({
          type: 'text',
          text: chunk,
          marks: marks.length > 0 ? marks : undefined,
        });

        i = j;
      }

      // Check for insertions at the end of this text node
      const endOffset = nodeOffset + text.length;
      const endInsertions = insertions.filter(ins => ins.afterOffset === endOffset);
      for (const ins of endInsertions) {
        result.push({
          type: 'text',
          text: ins.text,
          marks: [...(node.marks || []), createTrackInsertMark(author)],
        });
      }

      // Remove processed insertions
      insertions = insertions.filter(ins => 
        ins.afterOffset < nodeOffset || ins.afterOffset > endOffset
      );

      return { nodes: result, consumedLength: text.length };
    }

    // Non-text node: recursively transform children
    if (node.content && Array.isArray(node.content)) {
      const newContent: ProseMirrorNode[] = [];
      let offset = nodeOffset;

      for (const child of node.content) {
        const { nodes, consumedLength } = transformNode(child, offset, path);
        newContent.push(...nodes);
        offset += consumedLength;
      }

      return {
        nodes: [{ ...node, content: newContent }],
        consumedLength: offset - nodeOffset,
      };
    }

    // Node without content (hard break, etc.)
    return { nodes: [node], consumedLength: 0 };
  }

  // Transform the document content
  if (merged.content && Array.isArray(merged.content)) {
    const newContent: ProseMirrorNode[] = [];
    let offset = 0;

    for (let i = 0; i < merged.content.length; i++) {
      const child = merged.content[i];
      const { nodes, consumedLength } = transformNode(child, offset, [i]);
      newContent.push(...nodes);
      offset += consumedLength;
    }

    merged.content = newContent;
  }

  return merged;
}
```

**Algorithm Visualization:**

```
Original (docA):        "Hello World"
New (docB):             "Hello there World"
                               ^^^^^^ inserted

Diff segments:
  [equal: "Hello "]
  [insert: "there "]
  [equal: "World"]

Character states (docA indices):
  0-5: equal (H,e,l,l,o, )
  6-10: equal (W,o,r,l,d)

Insertions:
  afterOffset: 6, text: "there "

Result after merge:
  "Hello " (no mark)
  "there " (trackInsert mark)
  "World" (no mark)
```

---

## Step 5: SuperDoc Configuration

Configure SuperDoc to display and interact with track changes.

```typescript
// Display merged document with track changes

const superdoc = new SuperDoc({
  selector: container,
  document: originalFile,  // Load original file first
  documentMode: 'editing', // Required for accept/reject
  role: 'editor',          // Permission to accept/reject
  rulers: false,
  user: {
    name: 'Reviewer',
    email: 'reviewer@app.local',
  },
  
  // Allow accepting/rejecting changes from any author
  permissionResolver: ({ permission, defaultDecision }) => {
    if (permission === 'RESOLVE_OTHER' || 
        permission === 'accept-change' || 
        permission === 'reject-change') {
      return true;
    }
    return defaultDecision;
  },
  
  onReady: ({ superdoc: sd }) => {
    const editor = sd.activeEditor;
    
    // Replace content with merged JSON
    if (editor.commands?.setContent) {
      editor.commands.setContent(mergedJson);
    } else {
      // Fallback: use ProseMirror transaction
      const { state, view } = editor;
      if (state?.doc && view && mergedJson.content) {
        const newDoc = state.schema.nodeFromJSON(mergedJson);
        const tr = state.tr.replaceWith(0, state.doc.content.size, newDoc.content);
        view.dispatch(tr);
      }
    }
    
    // Enable track changes in REVIEW mode
    // - 'review': Shows both insertions (green) and deletions (red strikethrough)
    // - 'original': Hides insertions, shows deletions
    // - 'final': Shows insertions, hides deletions
    sd.setTrackedChangesPreferences({
      mode: 'review',
      enabled: true
    });
  }
});
```

**Track Changes Modes:**

| Mode | Insertions | Deletions |
|------|------------|-----------|
| `review` | Green underline | Red strikethrough |
| `original` | Hidden | Visible (no style) |
| `final` | Visible (no style) | Hidden |

---

## Step 6: Accept/Reject Changes

SuperDoc provides commands for accepting and rejecting changes:

```typescript
const editor = superdoc.activeEditor;

// Accept all changes
editor.commands.acceptAllTrackedChanges();

// Reject all changes
editor.commands.rejectAllTrackedChanges();

// Accept/reject by ID (from the mark's attrs.id)
editor.commands.acceptTrackedChangeById(changeId);
editor.commands.rejectTrackedChangeById(changeId);
```

---

## Complete Usage Example

```typescript
import { parseDocx, diffDocuments, mergeDocuments } from './services';

async function compareDocuments(v1File: File, v2File: File) {
  // Step 1: Parse both documents
  const { json: v1Json } = await parseDocx(v1File);
  const { json: v2Json } = await parseDocx(v2File);
  
  // Step 2: Diff the documents
  const diffResult = diffDocuments(v1Json, v2Json);
  console.log(`Found ${diffResult.summary.join(', ')}`);
  
  // Step 3: Merge with track changes
  const mergedJson = mergeDocuments(v1Json, v2Json, diffResult);
  
  // Step 4: Display in SuperDoc
  const superdoc = new SuperDoc({
    selector: '#editor',
    document: v1File,
    documentMode: 'editing',
    role: 'editor',
    permissionResolver: () => true,
    onReady: ({ superdoc: sd }) => {
      sd.activeEditor.commands.setContent(mergedJson);
      sd.setTrackedChangesPreferences({ mode: 'review', enabled: true });
    }
  });
  
  return { mergedJson, diffResult, superdoc };
}
```

---

## Troubleshooting

### "Cannot read properties of undefined (reading 'doc')"
- Add delayed cleanup (100ms) in `parseDocx`
- Check `state?.doc` before accessing
- Ensure `mountedRef` pattern for React components

### Track changes not visible
- Ensure `setTrackedChangesPreferences({ mode: 'review', enabled: true })`
- Check that marks have correct `type` ('trackInsert', 'trackDelete')
- Verify marks include all required `attrs` (id, author, authorEmail, date)

### Cannot accept/reject changes
- Set `documentMode: 'editing'`
- Set `role: 'editor'`
- Add `permissionResolver` that returns `true` for track change permissions

### React StrictMode issues
- Add 50ms delay before SuperDoc initialization
- Use `initRef` pattern to prevent double initialization
- Create fresh container div for each SuperDoc instance

---

## References

- [SuperDoc Documentation](https://docs.superdoc.dev)
- [diff-match-patch](https://github.com/google/diff-match-patch)
- [ProseMirror](https://prosemirror.net/)

