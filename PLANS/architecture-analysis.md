# DOCX Comparison Engine - Architecture Analysis

## Project Summary

Build a web app that shows and summarizes how a DOCX document changed between versions using SuperDoc.

### User Flow
1. User uploads V1 DOCX → displayed in SuperDoc editor
2. User edits in MS Word Desktop (externally)
3. User returns and uploads V2 DOCX
4. Changes (text, layout, styling, comments) show as tracked changes in web UI
5. (Optional) Summary of changes displayed

---

## Recommended Architecture: "Diff and Apply in Suggesting Mode"

### Why This Approach?

SuperDoc has native tracked changes support with a "suggesting" mode that automatically tracks all modifications. By:
1. Loading V1 into the editor
2. Enabling suggesting mode
3. Programmatically applying the differences as edits

...SuperDoc will automatically create proper tracked changes with author/date metadata.

### Technical Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Next.js)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Upload V1 DOCX                                              │
│     └─> SuperDoc.load(v1) → Display in editor                   │
│     └─> Extract JSON/text → Store in state                      │
│                                                                 │
│  2. Upload V2 DOCX                                              │
│     └─> SuperDoc.load(v2, headless) → Extract JSON/text         │
│     └─> Compute diff (diff-match-patch)                         │
│     └─> Map text positions → ProseMirror positions              │
│                                                                 │
│  3. Apply Changes                                               │
│     └─> Set editor to "suggesting" mode                         │
│     └─> Execute diff operations (delete/insert)                 │
│     └─> SuperDoc auto-creates tracked changes                   │
│                                                                 │
│  4. Display Results                                             │
│     └─> Show document with inline tracked changes               │
│     └─> Show changes summary in sidebar                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Key Technical Components

### Complete Diff Strategy: Rich Text Comparison

The diff must capture THREE types of changes:
1. **Text changes** (insertions/deletions)
2. **Format changes** (marks/styling on unchanged text)
3. **Structural changes** (paragraph-level)

```typescript
interface RichTextDiff {
  textChanges: TextChange[];       // INSERT/DELETE operations
  formatChanges: FormatChange[];   // Mark changes on EQUAL text
  structuralChanges: StructuralChange[];  // Paragraph add/remove/reorder
}
```

### 1. Extract Formatted Spans (`/lib/diff/extract-spans.ts`)

First, we extract text WITH formatting information:

```typescript
interface FormattedSpan {
  text: string;
  pmStart: number;        // ProseMirror position
  pmEnd: number;
  marks: Mark[];          // Formatting: bold, italic, fontSize, etc.
  paragraphIndex: number; // Which paragraph this belongs to
}

function extractFormattedSpans(editor): FormattedSpan[] {
  const spans: FormattedSpan[] = [];
  let paragraphIndex = 0;
  
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'paragraph') {
      paragraphIndex++;
    }
    if (node.isText) {
      spans.push({
        text: node.text,
        pmStart: pos,
        pmEnd: pos + node.text.length,
        marks: [...node.marks], // Clone marks array
        paragraphIndex
      });
    }
  });
  
  return spans;
}
```

### 2. Text Diff (`/lib/diff/text-diff.ts`)

Using **diff-match-patch** on plain text:

```typescript
import DiffMatchPatch from 'diff-match-patch';

interface TextChange {
  type: 'INSERT' | 'DELETE';
  text: string;
  pmPosition: number;  // Where in V1 document
}

export function computeTextDiff(v1Spans: FormattedSpan[], v2Spans: FormattedSpan[]): TextChange[] {
  // Flatten to plain text for diffing
  const v1Text = v1Spans.map(s => s.text).join('');
  const v2Text = v2Spans.map(s => s.text).join('');
  
  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(v1Text, v2Text);
  dmp.diff_cleanupSemantic(diffs);
  
  // Convert to positioned operations using V1 span positions
  return mapDiffsToOperations(diffs, v1Spans);
}
```

### 3. Format Diff (`/lib/diff/format-diff.ts`)

For text that exists in BOTH versions, compare marks:

```typescript
interface FormatChange {
  from: number;         // PM position in V1
  to: number;
  text: string;
  addMarks: Mark[];     // Added in V2
  removeMarks: Mark[];  // Removed in V2
}

export function computeFormatDiff(
  v1Spans: FormattedSpan[], 
  v2Spans: FormattedSpan[],
  textDiff: TextChange[]
): FormatChange[] {
  const formatChanges: FormatChange[] = [];
  
  // For each EQUAL region (text unchanged between versions):
  // Compare marks at aligned positions
  
  // Example: V1 "Hello" (plain) vs V2 "Hello" (bold)
  // → FormatChange { addMarks: [{ type: 'bold' }] }
  
  return formatChanges;
}

function marksEqual(marks1: Mark[], marks2: Mark[]): boolean {
  // Compare mark arrays (order-independent)
  if (marks1.length !== marks2.length) return false;
  return marks1.every(m1 => 
    marks2.some(m2 => markEqual(m1, m2))
  );
}

function markEqual(m1: Mark, m2: Mark): boolean {
  // Compare mark type and attributes
  return m1.type === m2.type && 
    JSON.stringify(m1.attrs) === JSON.stringify(m2.attrs);
}
```

### 4. Change Applicator (`/lib/apply-changes.ts`)

Apply ALL change types to editor in suggesting mode:

```typescript
export async function applyAllChanges(
  superdoc: SuperDoc,
  editor: Editor,
  diff: RichTextDiff
) {
  // Enable tracked changes
  superdoc.setDocumentMode('suggesting');
  
  // 1. Apply text changes (from end to start to preserve positions)
  const textOps = [...diff.textChanges].sort((a, b) => b.pmPosition - a.pmPosition);
  for (const op of textOps) {
    if (op.type === 'DELETE') {
      editor.commands.deleteRange({
        from: op.pmPosition,
        to: op.pmPosition + op.text.length
      });
    } else if (op.type === 'INSERT') {
      editor.commands.insertContentAt(op.pmPosition, op.text);
    }
  }
  
  // 2. Apply format changes (select range, apply formatting)
  // Note: Need to recalculate positions after text changes!
  for (const fc of diff.formatChanges) {
    const adjustedFrom = adjustPosition(fc.from, textOps);
    const adjustedTo = adjustPosition(fc.to, textOps);
    
    editor.commands.setTextSelection({ from: adjustedFrom, to: adjustedTo });
    
    for (const mark of fc.addMarks) {
      applyMark(editor, mark);
    }
    for (const mark of fc.removeMarks) {
      removeMark(editor, mark);
    }
  }
}

function applyMark(editor: Editor, mark: Mark) {
  switch (mark.type.name) {
    case 'bold': editor.commands.setBold(); break;
    case 'italic': editor.commands.setItalic(); break;
    case 'underline': editor.commands.setUnderline(); break;
    case 'textStyle':
      if (mark.attrs.fontSize) editor.commands.setFontSize(mark.attrs.fontSize);
      if (mark.attrs.color) editor.commands.setColor(mark.attrs.color);
      break;
    // ... handle other mark types
  }
}
```

---

## Handling Different Change Types

### SuperDoc Track Changes Visual Indicators (Confirmed)
| Change Type | Visual Style |
|-------------|--------------|
| Insertions | Green underline |
| Deletions | Red strikethrough |
| **Format Changes** | **Yellow highlight** |

Each change includes user info, timestamp, and unique ID.

---

### Text Insertions/Deletions ✅
- Handled naturally by diff-match-patch
- Applied via `editor.commands.insertContentAt()` / `deleteRange()`
- SuperDoc tracks automatically in suggesting mode

### Formatting Changes ✅ (CONFIRMED WORKING)

**Key Finding:** SuperDoc's suggesting mode DOES track formatting changes automatically!

```javascript
superdoc.setDocumentMode('suggesting');
editor.commands.toggleBold();  // Creates a format tracked change (yellow highlight)
```

**Detection Algorithm:**
We need to compare marks (formatting) at each character position between V1 and V2:

```typescript
interface FormattedSpan {
  text: string;
  pmStart: number;
  pmEnd: number;
  marks: Mark[];  // [{ type: 'bold' }, { type: 'fontSize', attrs: { size: 14 } }]
}

interface FormatChange {
  from: number;          // PM position start
  to: number;            // PM position end
  text: string;          // Affected text
  addMarks: Mark[];      // Marks added in V2
  removeMarks: Mark[];   // Marks removed in V2
}

function detectFormatChanges(v1Spans: FormattedSpan[], v2Spans: FormattedSpan[]): FormatChange[] {
  // For text that exists in both versions (EQUAL in text diff):
  // Compare the marks arrays
  // Detect additions (mark in V2 not in V1)
  // Detect removals (mark in V1 not in V2)
}
```

**Application:**
```typescript
function applyFormatChange(editor, change: FormatChange) {
  // Select the range
  editor.commands.setTextSelection({ from: change.from, to: change.to });
  
  // Apply mark additions
  for (const mark of change.addMarks) {
    switch (mark.type) {
      case 'bold': editor.commands.toggleBold(); break;
      case 'italic': editor.commands.toggleItalic(); break;
      case 'fontSize': editor.commands.setFontSize(mark.attrs.size); break;
      // ... etc
    }
  }
  
  // Apply mark removals (same toggle commands for removable marks)
}
```

### Structural Changes (Tables, Images) ⚠️
- Very complex to diff
- **MVP approach**: Detect presence/absence, note in summary
- Don't try to track inline

### Existing Tracked Changes in Documents ⚠️
- If V1/V2 already have tracked changes
- **Option A**: Accept all changes before comparison
- **Option B**: Preserve and merge (complex)

---

## External Libraries

### Libraries We'll Use

| Library | Purpose | Why |
|---------|---------|-----|
| **`diff-match-patch`** | Text diffing | Google's battle-tested library with semantic cleanup |
| **`deep-equal`** or **`fast-deep-equal`** | Mark comparison | Simple, fast object comparison for formatting |

### Libraries That Won't Help (Despite Sounding Relevant)

| Library | Why Not |
|---------|---------|
| `prosemirror-changeset` | Tracks changes DURING editing, not comparing static documents |
| `yjs` / CRDTs | For real-time collaboration, not static document comparison |
| `quill-delta` | Quill-specific format, not ProseMirror compatible |
| `jsondiffpatch` | Too structural - gives JSON patches, not semantic text diffs |

### Key Insight

**There's no "compare two ProseMirror documents" library.** The domain-specific logic must be built:
- Off-the-shelf: Text diffing, object equality
- Custom: Document extraction, alignment, change application

---

## Modular Architecture

### Design Principles

1. **Separation of Concerns**: SuperDoc-specific code isolated from business logic
2. **Testability**: Core diff logic is pure functions with no external dependencies
3. **Maintainability**: If SuperDoc API changes, only adapters need updates
4. **Debuggability**: Clear data flow with inspectable intermediate states

### Architecture Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ARCHITECTURE LAYERS                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                    PRESENTATION LAYER                        │    │
│  │  /app, /components, /hooks                                   │    │
│  │  React components, UI state, user interactions               │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │                                        │
│                             ▼                                        │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                   ORCHESTRATION LAYER                        │    │
│  │  /lib/engine/comparison-engine.ts                            │    │
│  │  Coordinates the full comparison workflow                    │    │
│  └──────────────────────────┬──────────────────────────────────┘    │
│                             │                                        │
│           ┌─────────────────┼─────────────────┐                     │
│           ▼                 ▼                 ▼                      │
│  ┌─────────────┐   ┌─────────────┐   ┌─────────────┐               │
│  │  ADAPTERS   │   │    CORE     │   │  ADAPTERS   │               │
│  │   (Input)   │   │   (Logic)   │   │  (Output)   │               │
│  │             │   │             │   │             │               │
│  │ SuperDoc    │   │ Pure diff   │   │ SuperDoc    │               │
│  │ → Model     │   │ functions   │   │ commands    │               │
│  └─────────────┘   └─────────────┘   └─────────────┘               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
SuperDoc V1 (browser)              SuperDoc V2 (headless)
        │                                   │
        ▼                                   ▼
┌───────────────┐                  ┌───────────────┐
│    Adapter:   │                  │    Adapter:   │
│ superdoc-     │                  │ superdoc-     │
│ reader.ts     │                  │ reader.ts     │
└───────┬───────┘                  └───────┬───────┘
        │                                   │
        ▼                                   ▼
   DocumentModel                       DocumentModel
   (our types)                         (our types)
        │                                   │
        └─────────────┬─────────────────────┘
                      │
                      ▼
            ┌─────────────────┐
            │   CORE LOGIC    │  ← Pure functions, easily testable
            │                 │
            │ • text-diff.ts  │
            │ • format-diff.ts│
            │ • paragraph-    │
            │   aligner.ts    │
            │ • change-       │
            │   merger.ts     │
            └────────┬────────┘
                     │
                     ▼
               ChangeSet
            (our change types)
                     │
                     ▼
            ┌─────────────────┐
            │    Adapter:     │
            │ superdoc-       │
            │ writer.ts       │
            └────────┬────────┘
                     │
                     ▼
          SuperDoc with tracked changes
```

---

## Project Structure (Refined)

```
/app
  /page.tsx                        # Main comparison UI
  /layout.tsx                      # App layout with providers
  /api/
    /extract/route.ts              # DOCX → DocumentModel (server)
    
/components
  /upload/
    DocxUploader.tsx               # Drag-and-drop upload zone
    UploadProgress.tsx             # Upload/processing indicator
  /editor/
    DocumentViewer.tsx             # SuperDoc wrapper component
    EditorToolbar.tsx              # Minimal toolbar
  /results/
    ChangeSummary.tsx              # Summary panel (bottom)
    ChangesSidebar.tsx             # Changes list (right panel)
    ChangeItem.tsx                 # Single change display
  /layout/
    Header.tsx                     # App header
    
/lib
  /types/                          # ═══ TYPE DEFINITIONS ═══
    document.types.ts              # DocumentModel, ParagraphModel, etc.
    diff.types.ts                  # ChangeSet, TextChange, FormatChange
    superdoc.types.ts              # SuperDoc-specific types
    
  /adapters/                       # ═══ SUPERDOC ↔ OUR TYPES ═══
    superdoc-reader.ts             # Extract DocumentModel from SuperDoc
    superdoc-writer.ts             # Apply ChangeSet to SuperDoc
    superdoc-headless.ts           # Headless document loading
    
  /core/                           # ═══ PURE BUSINESS LOGIC ═══
    text-diff.ts                   # Text diffing (uses diff-match-patch)
    format-diff.ts                 # Mark/formatting comparison
    paragraph-aligner.ts           # LCS-based paragraph alignment
    change-merger.ts               # Combine and sort all changes
    position-adjuster.ts           # Adjust positions after changes
    
  /engine/                         # ═══ ORCHESTRATION ═══
    comparison-engine.ts           # Main comparison workflow
    change-summarizer.ts           # Generate human-readable summary
    
  /utils/
    lcs.ts                         # Longest Common Subsequence algorithm
    deep-equal.ts                  # Mark comparison helper
    
/hooks
  useDocumentState.ts              # V1/V2 document state management
  useComparison.ts                 # Comparison flow hook
  useSuperDoc.ts                   # SuperDoc instance management
  
/store                             # If using Zustand
  document-store.ts                # Global document state
```

---

## Type Definitions (Abstraction Layer)

### Our Document Model (SuperDoc-agnostic)

```typescript
// /lib/types/document.types.ts

/**
 * Our abstracted document representation.
 * Decouples business logic from SuperDoc internals.
 */
export interface DocumentModel {
  paragraphs: ParagraphModel[];
  metadata?: DocumentMetadata;
}

export interface ParagraphModel {
  /** Unique identifier for alignment */
  id: string;
  /** Index in document (0-based) */
  index: number;
  /** ProseMirror position (for change application) */
  position: number;
  /** Text spans with formatting */
  spans: TextSpan[];
  /** Plain text content (for quick comparison) */
  textContent: string;
  /** Hash of content for quick equality check */
  contentHash: string;
}

export interface TextSpan {
  text: string;
  position: SpanPosition;
  marks: MarkModel[];
}

export interface SpanPosition {
  /** Offset within paragraph */
  start: number;
  end: number;
  /** Absolute ProseMirror position */
  pmStart: number;
  pmEnd: number;
}

/**
 * Normalized mark representation.
 * Abstracts ProseMirror marks into comparable format.
 */
export interface MarkModel {
  type: MarkType;
  value?: string | number | boolean;
}

export type MarkType = 
  | 'bold' 
  | 'italic' 
  | 'underline' 
  | 'strike'
  | 'fontSize'
  | 'fontFamily'
  | 'color'
  | 'backgroundColor'
  | 'link'
  | 'subscript'
  | 'superscript';
```

### Change Types

```typescript
// /lib/types/diff.types.ts

/**
 * Complete set of changes between two documents.
 */
export interface ChangeSet {
  textChanges: TextChange[];
  formatChanges: FormatChange[];
  paragraphChanges: ParagraphChange[];
  summary: ChangeSummary;
}

export interface TextChange {
  type: 'insert' | 'delete';
  text: string;
  /** Position in V1 document */
  position: number;
  /** Which paragraph this belongs to */
  paragraphIndex: number;
}

export interface FormatChange {
  /** Affected text range in V1 */
  from: number;
  to: number;
  text: string;
  paragraphIndex: number;
  /** Marks to add */
  addMarks: MarkModel[];
  /** Marks to remove */
  removeMarks: MarkModel[];
}

export interface ParagraphChange {
  type: 'insert' | 'delete';
  paragraph: ParagraphModel;
  /** Position to insert at (for inserts) */
  insertAfter?: number;
}

export interface ChangeSummary {
  totalChanges: number;
  insertions: number;
  deletions: number;
  formatChanges: number;
  paragraphsAdded: number;
  paragraphsRemoved: number;
  highlights: string[];  // Human-readable key changes
}
```

---

## Module Responsibilities

### Adapters (SuperDoc-specific)

| Module | Input | Output | Responsibility |
|--------|-------|--------|----------------|
| `superdoc-reader.ts` | SuperDoc editor/JSON | `DocumentModel` | Extract our model from SuperDoc |
| `superdoc-writer.ts` | `ChangeSet` + editor | void | Apply changes via SuperDoc commands |
| `superdoc-headless.ts` | DOCX File | `DocumentModel` | Load DOCX headlessly, extract model |

### Core (Pure Functions)

| Module | Input | Output | Responsibility |
|--------|-------|--------|----------------|
| `text-diff.ts` | Two strings | `TextChange[]` | Find text insertions/deletions |
| `format-diff.ts` | Two `TextSpan[]` | `FormatChange[]` | Find formatting differences |
| `paragraph-aligner.ts` | Two `ParagraphModel[]` | `AlignmentResult[]` | Match paragraphs using LCS |
| `change-merger.ts` | All change arrays | `ChangeSet` | Combine, sort, resolve conflicts |
| `position-adjuster.ts` | Position + applied changes | Adjusted position | Recalculate positions after edits |

### Engine

| Module | Responsibility |
|--------|----------------|
| `comparison-engine.ts` | Orchestrates full comparison: read → diff → merge → write |
| `change-summarizer.ts` | Generates human-readable summary from ChangeSet |

---

## State Management

Using React Context or Zustand:

```typescript
interface DocumentState {
  // Document data
  v1Document: DocxData | null;
  v2Document: DocxData | null;
  
  // UI state
  stage: 'upload' | 'viewing' | 'comparing' | 'result';
  isProcessing: boolean;
  
  // Results
  changes: Change[];
  summary: ChangeSummary;
}

interface DocxData {
  file: File;
  json: ProseMirrorDoc;
  text: string;
  metadata: DocMetadata;
}
```

---

## UI/UX Flow (from design.png)

### Screen 1: Upload Initial Document
- Drag-and-drop zone
- "Drag-and-drop or upload DOCX"
- Single file upload

### Screen 2: Viewing V1
- Full SuperDoc editor showing document
- "Upload new version" button in header
- Basic toolbar for viewing

### Screen 3: Comparison Result
- Document with inline tracked changes
  - Deletions: strikethrough red
  - Insertions: underline green
- Right sidebar: Changes list with timestamps
- Bottom panel: Summary of changes
  - "Changes in the new version include:"
  - Bullet list of major changes

---

## Vercel Deployment Considerations

### Pro Plan Features Used
- Node.js serverless functions (for DOCX processing)
- Larger function size limits
- Higher execution time limits

### API Routes
```typescript
// /api/convert/route.ts
export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  
  // Use SuperDoc headless to convert DOCX → JSON
  const buffer = await file.arrayBuffer();
  const doc = new SuperDoc();
  await doc.loadZip(Buffer.from(buffer));
  
  const json = await doc.saveAs('json');
  const text = await doc.saveAs('text');
  
  return Response.json({ json, text });
}
```

### File Size Limits
- Vercel Serverless: 4.5MB request body (Pro)
- Document spec says <10MB files
- May need to use Edge runtime or Vercel Blob for larger files

---

## Refined Approach: Paragraph-Based Diffing

After deeper analysis, the position mapping challenge is best solved by working at the **paragraph level** rather than global document level.

### Why Paragraph-Based?

1. **Simpler Position Mapping**: Positions within a paragraph are straightforward (just text offsets)
2. **Natural Alignment**: Paragraphs are the natural unit of comparison
3. **Better Structural Handling**: Added/deleted paragraphs are easier to detect
4. **Reduced Complexity**: Each paragraph is self-contained

### Algorithm

```typescript
// Step 1: Extract paragraphs from both documents
interface Paragraph {
  id: string;              // Hash of content for matching
  text: string;            // Plain text content
  pmPosition: number;      // ProseMirror start position
  node: PMNode;            // Reference to actual node
}

// Step 2: Align paragraphs using LCS (Longest Common Subsequence)
type AlignmentResult = 
  | { type: 'match'; v1: Paragraph; v2: Paragraph }
  | { type: 'delete'; v1: Paragraph }
  | { type: 'insert'; v2: Paragraph };

// Step 3: For matched paragraphs, compute inline text diff
// Step 4: Apply changes in suggesting mode
```

### Processing Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                           COMPARISON FLOW                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐         ┌─────────────┐                            │
│  │   V1 DOCX   │         │   V2 DOCX   │                            │
│  └──────┬──────┘         └──────┬──────┘                            │
│         │                       │                                    │
│         ▼                       ▼                                    │
│  ┌─────────────┐         ┌─────────────┐                            │
│  │  SuperDoc   │         │  SuperDoc   │ (headless)                 │
│  │   Editor    │         │  Extraction │                            │
│  └──────┬──────┘         └──────┬──────┘                            │
│         │                       │                                    │
│         ▼                       ▼                                    │
│  ┌─────────────┐         ┌─────────────┐                            │
│  │ Paragraphs  │         │ Paragraphs  │                            │
│  │ + Positions │         │   + Text    │                            │
│  └──────┬──────┘         └──────┬──────┘                            │
│         │                       │                                    │
│         └───────────┬───────────┘                                    │
│                     ▼                                                │
│              ┌─────────────┐                                         │
│              │  Paragraph  │                                         │
│              │  Alignment  │ (LCS-based)                             │
│              └──────┬──────┘                                         │
│                     │                                                │
│         ┌───────────┼───────────┐                                    │
│         ▼           ▼           ▼                                    │
│    ┌─────────┐ ┌─────────┐ ┌─────────┐                              │
│    │ Matched │ │ Deleted │ │ Inserted│                              │
│    │  Pairs  │ │  Paras  │ │  Paras  │                              │
│    └────┬────┘ └────┬────┘ └────┬────┘                              │
│         │           │           │                                    │
│         ▼           │           │                                    │
│    ┌─────────┐      │           │                                    │
│    │Per-Para │      │           │                                    │
│    │Text Diff│      │           │                                    │
│    └────┬────┘      │           │                                    │
│         │           │           │                                    │
│         └───────────┴───────────┘                                    │
│                     │                                                │
│                     ▼                                                │
│              ┌─────────────┐                                         │
│              │   Apply to  │                                         │
│              │   V1 Editor │ (in suggesting mode)                    │
│              │   as Edits  │                                         │
│              └──────┬──────┘                                         │
│                     │                                                │
│                     ▼                                                │
│              ┌─────────────┐                                         │
│              │  Document   │                                         │
│              │  w/ Tracked │                                         │
│              │   Changes   │                                         │
│              └─────────────┘                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## SuperDoc API Confirmation (from docs research)

### Editor Access
```javascript
const superdoc = new SuperDoc({
  // ...config
  onEditorCreate: ({ editor }) => {
    // editor instance is available here
    // Can store in ref or state
  }
});
```

### Tracked Changes Mode
```javascript
superdoc.setDocumentMode('suggesting');  // Enable tracking
superdoc.setDocumentMode('editing');     // Normal editing
```

### Available Commands
```javascript
// Text manipulation
editor.commands.insertContentAt(pos, content, opts);
editor.commands.deleteRange({ from, to });

// Tracked changes management
editor.commands.acceptChange();
editor.commands.rejectChange();

// Comments
superdoc.activeEditor.commands.insertComment({
  commentText: "...",
  creatorName: "...",
  creatorEmail: "..."
});
```

### Text Extraction
```javascript
// Headless extraction
const text = await doc.saveAs('text');
const json = await doc.saveAs('json');

// From AI module (if available)
const context = ai.getDocumentContext();

// Direct from editor state
editor.state.doc.textContent;
```

---

## Implementation Priority

### Phase 1: Foundation (Days 1-2)
- [ ] Set up Next.js project with TypeScript
- [ ] Define type system (`/lib/types/`)
- [ ] Implement `superdoc-reader.ts` adapter
- [ ] Implement `superdoc-headless.ts` adapter
- [ ] Basic SuperDoc integration (load and display DOCX)
- [ ] **Validation**: Confirm suggesting mode tracks programmatic edits

### Phase 2: Core Diff Engine (Days 3-4)
- [ ] Implement `text-diff.ts` (using diff-match-patch)
- [ ] Implement `paragraph-aligner.ts` (LCS algorithm)
- [ ] Implement `format-diff.ts` (mark comparison)
- [ ] Implement `change-merger.ts`
- [ ] Unit tests for core modules (no SuperDoc dependency!)

### Phase 3: Change Application (Days 5-6)
- [ ] Implement `superdoc-writer.ts` adapter
- [ ] Implement `position-adjuster.ts`
- [ ] Implement `comparison-engine.ts` orchestration
- [ ] Integration test: full comparison flow

### Phase 4: UI/UX (Days 7-9)
- [ ] Upload flow (drag-and-drop)
- [ ] Document viewer with SuperDoc
- [ ] Changes sidebar
- [ ] Summary panel
- [ ] Error handling and loading states
- [ ] Polish and styling

### Phase 5: Advanced (Stretch Goals)
- [ ] LLM-powered summary (optional)
- [ ] Export compared document
- [ ] Handle tables/images (note in summary)
- [ ] Performance optimization for large docs

---

## Open Questions / Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Position mapping edge cases | Medium | Medium | Paragraph-based approach reduces complexity |
| Suggesting mode doesn't track programmatic edits | Low | High | Docs confirm it should work; early prototype validation |
| Format changes hard to detect | High | Low | Defer to Phase 2; note in summary for MVP |
| Large documents slow to process | Medium | Medium | Process in chunks, show progress |
| SuperDoc version compatibility | Low | Medium | Pin version, test thoroughly |

---

## Validation Prototype Checklist

Before full implementation, build a minimal prototype to verify:

- [ ] SuperDoc loads and displays a DOCX file
- [ ] Can access `editor` instance via `onEditorCreate`
- [ ] `setDocumentMode('suggesting')` enables tracking
- [ ] `editor.commands.insertContentAt()` works in suggesting mode
- [ ] `editor.commands.deleteRange()` works in suggesting mode
- [ ] Changes appear as tracked changes (visible strikethrough/underline)
- [ ] Can extract text via `saveAs('text')` or `editor.state.doc.textContent`
- [ ] Can traverse document nodes to get paragraph positions

---

## Alternative Approaches Considered

### Option B: Direct JSON Construction
Instead of applying edits, construct the final ProseMirror JSON with tracked change marks embedded.

**Pros**: Complete control over output
**Cons**: Requires reverse-engineering SuperDoc's mark schema; more complex

### Option C: ProseMirror Changeset Library
Use `prosemirror-changeset` to compute changes between two document states.

**Pros**: Battle-tested for this use case
**Cons**: Integration with SuperDoc's specific schema may be tricky

### Why We Chose "Suggesting Mode + Paragraph Diff"
- Leverages SuperDoc's native tracking (guaranteed compatibility)
- Paragraph-based approach simplifies position mapping
- Well-understood algorithms (LCS, diff-match-patch)
- Produces exportable DOCX with real tracked changes

---

## Next Steps

### Immediate: Validation Prototype (Day 1)

Before building the full system, validate assumptions:

```typescript
// Minimal test to run in browser console after loading SuperDoc

// 1. Verify editor access
const editor = superdocInstance.activeEditor;
console.log('Editor:', editor);

// 2. Enable suggesting mode
superdocInstance.setDocumentMode('suggesting');

// 3. Try programmatic insert
editor.commands.insertContentAt(10, 'TEST INSERT');

// 4. Try programmatic delete
editor.commands.deleteRange({ from: 5, to: 8 });

// 5. Try format change
editor.commands.setTextSelection({ from: 0, to: 5 });
editor.commands.toggleBold();

// 6. Verify changes appear as tracked changes visually
```

### Development Order

1. **Types first** → Define `DocumentModel`, `ChangeSet` (establishes contracts)
2. **Core logic** → Implement diff functions (testable without SuperDoc)
3. **Adapters** → Connect to SuperDoc (read and write)
4. **Engine** → Wire everything together
5. **UI** → Build user-facing components

### Testing Strategy

| Layer | Test Type | What to Test |
|-------|-----------|--------------|
| `/lib/core/` | Unit tests | Pure function I/O, edge cases |
| `/lib/adapters/` | Integration tests | SuperDoc interaction |
| `/lib/engine/` | Integration tests | Full flow |
| `/components/` | Component tests | UI behavior |
| E2E | Playwright | Full user journey |

### Estimated Timeline

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| Validation | 0.5 days | Confirmed SuperDoc API works |
| Types + Core | 2 days | Tested diff engine |
| Adapters | 1.5 days | SuperDoc integration |
| Engine | 1 day | Working comparison |
| UI | 2-3 days | Complete app |
| Polish | 1-2 days | Production ready |

**Total: 8-10 days for MVP**

