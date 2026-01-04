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
│   │     Merged JSON with trackInsert,      │                           │
│   │     trackDelete, and trackFormat marks │                           │
│   └────────────────────┬───────────────────┘                           │
│                        │                                                │
│                        ▼                                                │
│   ┌────────────────────────────────────────┐                           │
│   │    SuperDoc (review mode)              │   Display with            │
│   │    - Red strikethrough = deletions     │   visual styling          │
│   │    - Green underline = insertions      │                           │
│   │    - Gold underline = format changes*  │                           │
│   └────────────────────────────────────────┘                           │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Dependencies

```json
{
  "dependencies": {
    "diff-match-patch": "^1.0.5",
    "groq-sdk": "^0.8.0",
    "next": "16.1.1",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "superdoc": "^1.1.3",
    "uuid": "^13.0.0",
    "zustand": "^5.0.9"
  }
}
```

> **Note**: SuperDoc includes TipTap and ProseMirror internally - no need to install `@tiptap/core`, `prosemirror-model`, or `prosemirror-state` separately.

## File Structure

```
src/
├── app/
│   └── page.tsx                    # Main page (orchestration)
├── components/
│   ├── editor/
│   │   └── SuperDocViewer.tsx      # Unified SuperDoc viewer component
│   ├── layout/
│   │   ├── Header.tsx
│   │   └── Footer.tsx
│   ├── upload/
│   │   └── DocxUploader.tsx
│   └── index.ts
├── lib/
│   ├── actions/
│   │   └── summarize.ts            # Server Action for AI summary
│   ├── services/
│   │   ├── documentParser.ts       # DOCX → ProseMirror JSON
│   │   ├── documentDiffer.ts       # Character-level diff
│   │   ├── mergeDocuments.ts       # Apply track changes to cloned doc
│   │   ├── trackChangeInjector.ts  # Create track change marks
│   │   ├── exportPreparation.ts    # Fix SuperDoc export limitations
│   │   ├── changeContextExtractor.ts  # Extract enriched changes for AI
│   │   ├── groqService.ts          # Groq LLM API wrapper
│   │   └── index.ts
│   └── types/
│       └── summary.types.ts        # AI summary types
└── store/
    └── document-store.ts           # Zustand state management
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

export interface FormatChange {
  from: number;        // Start position in docA text
  to: number;          // End position in docA text
  before: any[];       // Marks from V1
  after: any[];        // Marks from V2
}

export interface DiffResult {
  segments: DiffSegment[];
  textA: string;
  textB: string;
  summary: string[];
  formatChanges: FormatChange[];  // Format-only changes (same text, different marks)
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

  // Detect format changes in 'equal' segments
  // (text is same, but formatting marks differ)
  const formatChanges = detectFormatChanges(docA, docB, segments, textA);

  // Build summary
  const summary: string[] = [];
  if (insertCount > 0) summary.push(`${insertCount} insertion(s)`);
  if (deleteCount > 0) summary.push(`${deleteCount} deletion(s)`);
  if (formatChanges.length > 0) summary.push(`${formatChanges.length} format change(s)`);
  if (insertCount === 0 && deleteCount === 0 && formatChanges.length === 0) {
    summary.push('No changes detected');
  }

  return { segments, textA, textB, summary, formatChanges };
}

/**
 * Detect format changes in 'equal' text segments.
 * Format changes occur when text is identical but marks differ.
 */
function detectFormatChanges(
  docA: ProseMirrorJSON, 
  docB: ProseMirrorJSON, 
  segments: DiffSegment[],
  textA: string
): FormatChange[] {
  // Extract text spans with their marks from both documents
  const spansA = extractTextSpans(docA);
  const spansB = extractTextSpans(docB);
  
  const formatChanges: FormatChange[] = [];
  let posA = 0;
  let posB = 0;
  
  for (const segment of segments) {
    if (segment.type === 'equal') {
      // For equal text, compare marks character by character
      for (let i = 0; i < segment.text.length; i++) {
        const marksA = getMarksAtPosition(spansA, posA);
        const marksB = getMarksAtPosition(spansB, posB);
        
        if (!marksEqual(marksA, marksB)) {
          // Found format change - extend to find full range
          const startPos = posA;
          let endPos = posA + 1;
          
          // Group consecutive format changes
          while (i + 1 < segment.text.length) {
            const nextMarksA = getMarksAtPosition(spansA, posA + 1);
            const nextMarksB = getMarksAtPosition(spansB, posB + 1);
            if (marksEqual(nextMarksA, nextMarksB)) break;
            i++; posA++; posB++; endPos++;
          }
          
          formatChanges.push({
            from: startPos,
            to: endPos,
            before: marksA,
            after: marksB
          });
        }
        posA++; posB++;
      }
    } else if (segment.type === 'delete') {
      posA += segment.text.length;
    } else if (segment.type === 'insert') {
      posB += segment.text.length;
    }
  }
  
  return formatChanges;
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
  name: 'DocX Diff Tool',
  email: 'tool@docxdiff.com',
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
 * The 'before' and 'after' arrays store the original and new marks.
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
      authorImage: '',
      date: new Date().toISOString(),
      before,  // Original formatting (V1)
      after,   // New formatting (V2)
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
    authorImage: string; // Author image URL (optional, can be '')
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

interface TrackFormatMark {
  type: 'trackFormat';
  attrs: {
    id: string;
    author: string;
    authorEmail: string;
    authorImage: string;
    date: string;
    before: any[];      // Array of marks from V1
    after: any[];       // Array of marks from V2
  };
}
```

**Format Change Example:**
```typescript
// When "Chile" changes from normal to bold:
{
  type: 'trackFormat',
  attrs: {
    id: '550e8400-e29b-41d4-a716-446655440000',
    author: 'DocX Diff Tool',
    authorEmail: 'tool@docxdiff.com',
    authorImage: '',
    date: '2024-01-15T10:30:00.000Z',
    before: [],                           // No marks (plain text)
    after: [{ type: 'bold' }]            // Bold mark added
  }
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
  name: 'DocX Diff Tool',
  email: 'tool@docxdiff.com',
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

const SUPERDOC_USER = {
  name: 'DocX Diff User',
  email: 'tool@docxdiff.com',
};

// Permission resolver that allows accepting/rejecting all track changes
const permissionResolver = ({ permission }: { permission: string }) => {
  const allowedPermissions = ['RESOLVE_OWN', 'RESOLVE_OTHER', 'REJECT_OWN', 'REJECT_OTHER'];
  return allowedPermissions.includes(permission) ? true : undefined;
};

const superdoc = new SuperDoc({
  selector: container,
  toolbar: '#toolbar',       // Optional: toolbar container
  document: originalFile,    // Load original file first
  documentMode: 'editing',   // Required for accept/reject
  role: 'editor',            // Permission to accept/reject
  rulers: true,              // Show rulers
  user: SUPERDOC_USER,
  permissionResolver,        // CRITICAL: Without this, reject won't work!
  
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
    sd.setTrackedChangesPreferences({ mode: 'review', enabled: true });
  }
});
```

**Track Changes Modes:**

| Mode | Insertions | Deletions | Format Changes |
|------|------------|-----------|----------------|
| `review` | Green underline | Red strikethrough | Gold underline (when selected)* |
| `original` | Hidden | Visible (no style) | Shows original |
| `final` | Visible (no style) | Hidden | Shows new format |

> *SuperDoc's default `trackFormat` styling is minimal (gold underline only when highlighted). We added custom CSS for better visibility - see "Custom Format Change Styling" below.

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

## Step 7: Custom Format Change Styling (Optional)

SuperDoc's default styling for `trackFormat` is minimal (gold underline only when selected). To make format changes always visible, add custom CSS:

```css
/* globals.css - Custom format change styling */

/* Format changes - yellow highlight with dashed underline */
[data-track-format],
.track-format,
span[data-type="trackFormat"],
.ProseMirror span.trackFormat {
  background-color: #fef9c3 !important;  /* Light yellow */
  border-bottom: 2px dashed #ca8a04 !important;  /* Amber dashed underline */
}

.sd-track-format {
  background-color: #fef9c3 !important;
}
```

This makes format changes visually distinct from insertions (green) and deletions (red).

---

## Complete Usage Example

### Using the SuperDocViewer Component (Recommended)

The `SuperDocViewer` is a unified React component that handles both simple viewing and merged document display:

```tsx
import { SuperDocViewer } from '@/components';
import { parseDocx, diffDocuments, mergeDocuments } from '@/lib/services';

function DocumentComparison({ v1File, v2File }) {
  const [mergedJson, setMergedJson] = useState(null);
  const superdocRef = useRef(null);
  
  // Run comparison when V2 is uploaded
  useEffect(() => {
    async function compare() {
      const { json: v1Json } = await parseDocx(v1File);
      const { json: v2Json } = await parseDocx(v2File);
      const diffResult = diffDocuments(v1Json, v2Json);
      const merged = mergeDocuments(v1Json, v2Json, diffResult);
      setMergedJson(merged);
    }
    if (v2File) compare();
  }, [v1File, v2File]);
  
  return (
    <SuperDocViewer
      file={v1File}
      content={mergedJson}           // Optional: inject merged JSON
      onSuperdocReady={(sd) => { superdocRef.current = sd; }}
      showRulers                     // Show document rulers
      reviewMode                     // Enable track changes display
      className="h-full"
    />
  );
}
```

### Direct SuperDoc Usage

```typescript
import { parseDocx, diffDocuments, mergeDocuments } from '@/lib/services';

async function compareDocuments(v1File: File, v2File: File) {
  // Step 1: Parse both documents
  const { json: v1Json } = await parseDocx(v1File);
  const { json: v2Json } = await parseDocx(v2File);
  
  // Step 2: Diff the documents
  const diffResult = diffDocuments(v1Json, v2Json);
  
  // Step 3: Merge with track changes
  const mergedJson = mergeDocuments(v1Json, v2Json, diffResult);
  
  // Step 4: Display in SuperDoc
  const { SuperDoc } = await import('superdoc');
  
  const superdoc = new SuperDoc({
    selector: '#editor',
    toolbar: '#toolbar',
    document: v1File,
    documentMode: 'editing',
    role: 'editor',
    user: { name: 'DocX Diff User', email: 'tool@docxdiff.com' },
    permissionResolver: ({ permission }) => 
      ['RESOLVE_OWN', 'RESOLVE_OTHER', 'REJECT_OWN', 'REJECT_OTHER'].includes(permission) 
        ? true : undefined,
    onReady: ({ superdoc: sd }) => {
      sd.activeEditor.commands.setContent(mergedJson);
      sd.setTrackedChangesPreferences({ mode: 'review', enabled: true });
    }
  });
  
  return { mergedJson, diffResult, superdoc };
}
```

---

## Step 8: Export Preparation (DOCX Download)

SuperDoc has limitations when exporting documents with comments and format changes. The `ExportPreparation` class fixes these:

```typescript
// src/lib/services/exportPreparation.ts

import { ExportPreparation, downloadBlob } from '@/lib/services';

async function handleDownload(superdoc: SuperDocInstance, filename: string) {
  const editor = superdoc.activeEditor;
  
  // Save original state
  const originalJson = editor.getJSON();
  
  // Prepare document for export (fixes comments and trackFormat)
  const exportPrep = new ExportPreparation(superdoc);
  const { patchedDocJson, fixedComments } = exportPrep.prepare();
  
  // Temporarily apply patched content
  editor.commands.setContent(patchedDocJson);
  
  // Export with fixed comments
  const blob = await editor.exportDocx({
    isFinalDoc: false,
    commentsType: 'external',
    comments: fixedComments,
  });
  
  // Restore original content (keeps editor visually unchanged)
  editor.commands.setContent(originalJson);
  
  // Trigger download
  if (blob) downloadBlob(blob, filename);
}
```

**What ExportPreparation fixes:**
1. **Comments with empty text**: SuperDoc's internal `convertHtmlToSchema` creates empty paragraph JSON. We manually construct the correct structure.
2. **Standalone trackFormat marks**: SuperDoc only exports format changes when paired with `trackInsert`/`trackDelete`. We transform standalone format changes into delete+insert pairs.

> ⚠️ **Limitation**: Rejecting format changes in MS Word will erase the text due to how Word handles the generated XML. Accepting works correctly.

---

## Step 9: AI-Powered Change Summary

The application uses Groq LLM to generate human-readable bullet points describing what changed.

### Architecture

```
┌─────────────────┐     ┌────────────────────┐     ┌─────────────┐
│  mergedJson     │ ──▶ │ extractEnriched    │ ──▶ │ summarize   │ ──▶ Bullets
│  (with track    │     │ Changes()          │     │ Changes()   │
│  marks)         │     │ (context extractor)│     │ (Server     │
└─────────────────┘     └────────────────────┘     │  Action)    │
                                                    └─────────────┘
                                                          │
                                                          ▼
                                                    ┌─────────────┐
                                                    │ GroqService │
                                                    │ (LLM API)   │
                                                    └─────────────┘
```

### Why Server Action (not API Route)?

Using a Server Action instead of `/api/summarize-changes` provides better security:

- **No public endpoint**: The summarization cannot be called externally
- **Only frontend can trigger**: curl, Postman, etc. cannot access it
- **Simpler code**: No HTTP request/response handling needed

### Implementation

```typescript
// src/lib/actions/summarize.ts
'use server';

import { GroqService } from '@/lib/services/groqService';
import type { EnrichedChange, SummaryBullet } from '@/lib/types/summary.types';

export async function summarizeChanges(changes: EnrichedChange[]): Promise<SummaryBullet[]> {
  if (!changes.length) return [{ type: 'other', text: 'No changes to summarize' }];

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return fallbackSummary(changes);

  try {
    const groq = new GroqService(apiKey);
    return await groq.generateSummary(changes);
  } catch {
    return fallbackSummary(changes);
  }
}
```

### Usage in page.tsx

```typescript
import { summarizeChanges } from '@/lib/actions/summarize';
import { extractEnrichedChanges } from '@/lib/services';

// After comparison completes
useEffect(() => {
  if (stage === 'result' && comparison.mergedJson) {
    generateAiSummary();
  }
}, [stage, comparison.mergedJson]);

async function generateAiSummary() {
  const enrichedChanges = extractEnrichedChanges(comparison.mergedJson!);
  const bullets = await summarizeChanges(enrichedChanges);  // Direct call, no fetch!
  setAiSummary(bullets);
}
```

### Environment Variable

```env
# .env.local
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxx
```

> **Note**: If `GROQ_API_KEY` is not set, the app falls back to basic change counts.

---

## Troubleshooting

### "Cannot read properties of undefined (reading 'doc')"
- Add delayed cleanup (100ms) in `parseDocx`
- Check `state?.doc` before accessing
- Ensure `mountedRef` pattern for React components

### Track changes not visible
- Ensure `setTrackedChangesPreferences({ mode: 'review', enabled: true })`
- Check that marks have correct `type` ('trackInsert', 'trackDelete', 'trackFormat')
- Verify marks include all required `attrs` (id, author, authorEmail, date)
- For `trackFormat`, also include `before` and `after` arrays

### Cannot accept changes
- Set `documentMode: 'editing'`
- Set `role: 'editor'`
- Add `permissionResolver` that returns `true` for `RESOLVE_OWN` and `RESOLVE_OTHER`

### Cannot REJECT changes (accept works but reject doesn't)
This is a common gotcha! The reject button requires **separate permissions**:
```typescript
permissionResolver: ({ permission }) => {
  if (
    permission === 'RESOLVE_OWN' ||
    permission === 'RESOLVE_OTHER' ||
    permission === 'REJECT_OWN' ||    // <-- Required for reject!
    permission === 'REJECT_OTHER'     // <-- Required for reject!
  ) {
    return true;
  }
  return undefined;
},
```

### Format changes not detected
- Format changes only occur when text is identical but marks differ
- Ensure `extractTextSpans()` captures marks from the ProseMirror JSON
- Check that format changes are being included in `formatChanges` array

### React StrictMode issues
- Add 50ms delay before SuperDoc initialization
- Use `initRef` pattern to prevent double initialization
- Create fresh container div for each SuperDoc instance

---

## References

- [SuperDoc Documentation](https://docs.superdoc.dev)
- [diff-match-patch](https://github.com/google/diff-match-patch)
- [ProseMirror](https://prosemirror.net/)

