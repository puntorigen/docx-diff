# DOCX Comparison Tool - Implementation Plan

> **Project Goal:** Build a React application that compares two DOCX files, detects text and style/formatting changes, and displays differences as tracked changes using SuperDoc.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Implementation Phases](#3-implementation-phases)
4. [Diff Scenarios & Handling](#4-diff-scenarios--handling)
5. [React Component Structure](#5-react-component-structure)
6. [Key Challenges & Solutions](#6-key-challenges--solutions)
7. [Recommended Libraries](#7-recommended-libraries)
8. [Alternative Approaches](#8-alternative-approaches)

---

## 1. Overview

### Approach: "Merge and Mark"

Rather than building a custom diff viewer, this plan leverages SuperDoc's existing track changes system:

1. **Parse both DOCX files** into ProseMirror JSON documents using SuperDoc's `SuperConverter`
2. **Diff the two documents** at the text and node level using a diff algorithm
3. **Generate a merged document** with track change marks applied to differences
4. **Render the merged document** in SuperDoc's editor in "viewing" mode

This approach uses SuperDoc's existing track changes UI:
- ~~Strikethrough~~ for deletions
- <u>Underline/highlighting</u> for insertions
- Format change indicators for style modifications

### Track Change Mark Types (from SuperDoc)

| Mark Name | Purpose | Key Attributes |
|-----------|---------|----------------|
| `trackInsert` | Content added in version B | `id`, `author`, `authorEmail`, `date` |
| `trackDelete` | Content removed from version A | `id`, `author`, `authorEmail`, `date` |
| `trackFormat` | Formatting changed | `id`, `author`, `date`, `before[]`, `after[]` |

---

## 2. Architecture

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    React Application                            │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐                       │
│  │ File Input A    │  │ File Input B    │  (Original & Modified)│
│  └────────┬────────┘  └────────┬────────┘                       │
│           │                    │                                │
│           ▼                    ▼                                │
│  ┌────────────────────────────────────────┐                     │
│  │        Document Parsing Service         │                    │
│  │  (SuperConverter + Editor.loadXmlData)  │                    │
│  └────────────────────┬───────────────────┘                     │
│                       │                                         │
│                       ▼                                         │
│  ┌────────────────────────────────────────┐                     │
│  │         Document Diff Engine            │                    │
│  │  (Text diff + Style diff + Structure)   │                    │
│  └────────────────────┬───────────────────┘                     │
│                       │                                         │
│                       ▼                                         │
│  ┌────────────────────────────────────────┐                     │
│  │      Track Changes Mark Injector        │                    │
│  │  (Creates trackInsert/Delete/Format)    │                    │
│  └────────────────────┬───────────────────┘                     │
│                       │                                         │
│                       ▼                                         │
│  ┌────────────────────────────────────────┐                     │
│  │           SuperDoc Viewer               │                    │
│  │  (documentMode: 'viewing' + CSS)        │                    │
│  └────────────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────────┘
```

### Service Layer Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Services Layer                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  DocumentParser                          │    │
│  │  ─────────────────────────────────────────────────────   │    │
│  │  • parseDocx(file: File) → ProseMirrorJSON               │    │
│  │  • Uses Editor.loadXmlData() internally                  │    │
│  │  • Extracts styles, media, fonts                         │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  DocumentDiffer                          │    │
│  │  ─────────────────────────────────────────────────────   │    │
│  │  • diffDocuments(docA, docB) → DiffResult                │    │
│  │  • Paragraph-level matching (LCS algorithm)              │    │
│  │  • Text-level diffing within paragraphs                  │    │
│  │  • Mark/style comparison                                 │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │               TrackChangeInjector                        │    │
│  │  ─────────────────────────────────────────────────────   │    │
│  │  • injectChanges(diffResult) → MergedDocument            │    │
│  │  • Creates trackInsert marks for additions               │    │
│  │  • Creates trackDelete marks for removals                │    │
│  │  • Creates trackFormat marks for style changes           │    │
│  └─────────────────────────────────────────────────────────┘    │
│                            │                                    │
│                            ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                 MergeDocuments                           │    │
│  │  ─────────────────────────────────────────────────────   │    │
│  │  • merge(docA, docB, diffs) → FinalDocument              │    │
│  │  • Combines all content with track change marks          │    │
│  │  • Preserves document structure                          │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 3. Implementation Phases

### Phase 1: Document Parsing

**Goal:** Convert DOCX files to ProseMirror JSON documents.

**Implementation:**

```javascript
import { Editor } from '@harbour-enterprises/super-editor';
import { getStarterExtensions } from '@harbour-enterprises/super-editor/extensions';

async function parseDocx(file) {
  // Load DOCX and get XML content
  const [xmlContent, converter, mediaFiles, fonts] = await Editor.loadXmlData(file, true);
  
  // Create headless editor to process content
  const editor = new Editor({
    content: xmlContent,
    isHeadless: true,
    extensions: getStarterExtensions(),
    mediaFiles,
    fonts,
  });
  
  // Get ProseMirror JSON representation
  const pmJson = editor.getJSON();
  
  // Cleanup
  editor.destroy();
  
  return {
    json: pmJson,
    converter,
    mediaFiles,
    fonts,
  };
}
```

**Key Files in SuperDoc:**
- `packages/super-editor/src/core/Editor.ts` - `loadXmlData()` static method
- `packages/super-editor/src/core/super-converter/SuperConverter.js` - DOCX parsing

---

### Phase 2: Document Diffing

**Goal:** Identify all differences between two ProseMirror documents.

**Diff Levels:**

1. **Structure Level** - Paragraphs added/removed/reordered
2. **Text Level** - Text content changes within paragraphs
3. **Mark Level** - Formatting/style changes on text

**Algorithm Overview:**

```
Input: docA (original), docB (modified)
Output: DiffResult { additions, deletions, modifications }

1. Extract all paragraphs from both documents
2. Match paragraphs using LCS (Longest Common Subsequence)
3. For unmatched paragraphs:
   - In A only → Deletion
   - In B only → Insertion
4. For matched paragraphs:
   - Diff text content (character-level)
   - Compare marks on each text segment
   - Identify format changes
5. Return structured diff result
```

**Diff Result Structure:**

```typescript
interface DiffResult {
  // Structural changes
  insertedParagraphs: ParagraphDiff[];
  deletedParagraphs: ParagraphDiff[];
  
  // Content changes within matching paragraphs
  modifiedParagraphs: {
    paragraphIndex: number;
    textChanges: TextChange[];
    formatChanges: FormatChange[];
  }[];
}

interface TextChange {
  type: 'insert' | 'delete';
  from: number;  // Position in paragraph
  to: number;
  text: string;
}

interface FormatChange {
  from: number;
  to: number;
  before: Mark[];  // Marks in version A
  after: Mark[];   // Marks in version B
}
```

**Recommended Diff Libraries:**

| Library | Use Case |
|---------|----------|
| `diff` | Text-level diffing (diff-match-patch style) |
| `fast-diff` | Fast character-level diffs |
| Custom LCS | Paragraph matching |

---

### Phase 3: Style/Formatting Change Detection

**Goal:** Detect when text has the same content but different formatting.

**Marks to Compare:**

| Mark Type | Properties to Compare |
|-----------|----------------------|
| `bold` | `value` |
| `italic` | `value` |
| `underline` | `underlineType` |
| `strike` | `value` |
| `textStyle` | `fontSize`, `fontFamily`, `color` |
| `highlight` | `color` |
| `link` | `href` |

**Paragraph Properties to Compare:**

| Property | Location |
|----------|----------|
| Alignment | `paragraphProperties.jc` |
| Indentation | `paragraphProperties.ind` |
| Spacing | `paragraphProperties.spacing` |
| Numbering | `paragraphProperties.numPr` |

**Comparison Logic:**

```javascript
function compareMarks(marksA, marksB) {
  const changes = { before: [], after: [] };
  
  // Find marks in A but not in B (removed)
  for (const markA of marksA) {
    const matchingMark = marksB.find(m => m.type === markA.type);
    if (!matchingMark) {
      changes.before.push({ type: markA.type, attrs: markA.attrs });
    } else if (!deepEqual(markA.attrs, matchingMark.attrs)) {
      changes.before.push({ type: markA.type, attrs: markA.attrs });
      changes.after.push({ type: matchingMark.type, attrs: matchingMark.attrs });
    }
  }
  
  // Find marks in B but not in A (added)
  for (const markB of marksB) {
    const matchingMark = marksA.find(m => m.type === markB.type);
    if (!matchingMark) {
      changes.after.push({ type: markB.type, attrs: markB.attrs });
    }
  }
  
  return changes;
}
```

---

### Phase 4: Track Change Mark Injection

**Goal:** Create a merged document with track change marks applied.

**Mark Structures:**

```javascript
// Insertion mark
const trackInsertMark = {
  type: 'trackInsert',
  attrs: {
    id: crypto.randomUUID(),
    author: 'Comparison Tool',
    authorEmail: 'comparison@tool.local',
    authorImage: '',
    date: new Date().toISOString(),
  }
};

// Deletion mark
const trackDeleteMark = {
  type: 'trackDelete',
  attrs: {
    id: crypto.randomUUID(),
    author: 'Comparison Tool',
    authorEmail: 'comparison@tool.local',
    authorImage: '',
    date: new Date().toISOString(),
  }
};

// Format change mark
const trackFormatMark = {
  type: 'trackFormat',
  attrs: {
    id: crypto.randomUUID(),
    author: 'Comparison Tool',
    authorEmail: 'comparison@tool.local',
    date: new Date().toISOString(),
    before: [{ type: 'bold', attrs: { value: true } }],
    after: [],  // Bold was removed
  }
};
```

**Injection Process:**

```javascript
function injectTrackChanges(document, diffResult) {
  const merged = JSON.parse(JSON.stringify(document));
  
  // Process each paragraph
  for (const mod of diffResult.modifiedParagraphs) {
    const paragraph = merged.content[mod.paragraphIndex];
    
    // Apply text changes
    for (const change of mod.textChanges) {
      if (change.type === 'delete') {
        // Add trackDelete mark to deleted text
        addMarkToRange(paragraph, change.from, change.to, trackDeleteMark);
      } else if (change.type === 'insert') {
        // Add trackInsert mark to inserted text
        addMarkToRange(paragraph, change.from, change.to, trackInsertMark);
      }
    }
    
    // Apply format changes
    for (const formatChange of mod.formatChanges) {
      addMarkToRange(paragraph, formatChange.from, formatChange.to, {
        type: 'trackFormat',
        attrs: {
          ...baseAttrs,
          before: formatChange.before,
          after: formatChange.after,
        }
      });
    }
  }
  
  return merged;
}
```

---

### Phase 5: Rendering in SuperDoc

**Goal:** Display the merged document with track changes visible.

**Integration:**

```javascript
import { SuperDoc } from 'superdoc';
import 'superdoc/style.css';

function ComparisonViewer({ mergedDocument, mediaFiles, fonts }) {
  useEffect(() => {
    const superdoc = new SuperDoc({
      selector: '#comparison-viewer',
      documentMode: 'viewing',  // Read-only with track changes visible
      documents: [{
        id: 'comparison-result',
        type: 'docx',
      }],
      user: {
        name: 'Comparison Tool',
        email: 'comparison@tool.local',
      },
    });
    
    // Load the merged document JSON
    superdoc.on('ready', () => {
      superdoc.activeEditor.commands.setContent(mergedDocument);
    });
    
    return () => superdoc.destroy();
  }, [mergedDocument]);
  
  return <div id="comparison-viewer" />;
}
```

---

## 4. Diff Scenarios & Handling

| Scenario | Detection Method | Track Change Mark |
|----------|-----------------|-------------------|
| Text added | Text in B not in A | `trackInsert` |
| Text removed | Text in A not in B | `trackDelete` |
| Text replaced | Text differs at same position | `trackDelete` + `trackInsert` |
| Bold added | Mark in B not in A | `trackFormat` (before: [], after: [bold]) |
| Bold removed | Mark in A not in B | `trackFormat` (before: [bold], after: []) |
| Font size changed | textStyle.fontSize differs | `trackFormat` (before/after with old/new size) |
| Color changed | textStyle.color differs | `trackFormat` |
| Paragraph added | Entire paragraph in B only | `trackInsert` on paragraph content |
| Paragraph removed | Entire paragraph in A only | `trackDelete` on paragraph content |
| Paragraph moved | Same content, different position | Custom handling (optional) |
| Table cell modified | Cell content differs | Diff cell content recursively |
| Image changed | Media file hash differs | Mark entire image node |

---

## 5. React Component Structure

```
src/
├── components/
│   ├── ComparisonTool.tsx           # Main container component
│   ├── FileUploader.tsx             # Drag & drop for 2 files
│   ├── ComparisonViewer.tsx         # SuperDoc wrapper component
│   ├── ChangesSidebar.tsx           # List of all changes (optional)
│   ├── ChangeItem.tsx               # Individual change display
│   └── ComparisonControls.tsx       # Accept all / Reject all / Export
│
├── services/
│   ├── documentParser.ts            # DOCX → ProseMirror JSON
│   ├── documentDiffer.ts            # Core diff algorithm
│   ├── trackChangeInjector.ts       # Creates track change marks
│   ├── mergeDocuments.ts            # Combines diffs into final doc
│   └── paragraphMatcher.ts          # LCS algorithm for paragraphs
│
├── hooks/
│   ├── useDocumentComparison.ts     # Main comparison orchestration
│   ├── useSuperDoc.ts               # SuperDoc React integration
│   └── useFileUpload.ts             # File handling hook
│
├── utils/
│   ├── markComparison.ts            # Compare ProseMirror marks
│   ├── nodeMatching.ts              # LCS for paragraph matching
│   ├── textDiff.ts                  # Character-level text diffing
│   └── documentWalker.ts            # Traverse PM document tree
│
├── types/
│   ├── diff.ts                      # Diff result types
│   ├── comparison.ts                # Comparison state types
│   └── prosemirror.ts               # PM JSON type definitions
│
└── App.tsx                          # Main app entry
```

### Component Responsibilities

| Component | Responsibility |
|-----------|---------------|
| `ComparisonTool` | Orchestrates the entire comparison flow |
| `FileUploader` | Handles file selection/drag-drop for both documents |
| `ComparisonViewer` | Renders SuperDoc with merged document |
| `ChangesSidebar` | Displays list of changes for navigation |
| `ComparisonControls` | Export, accept/reject all controls |

---

## 6. Key Challenges & Solutions

| Challenge | Solution |
|-----------|----------|
| **Paragraph reordering** | Use paragraph fingerprinting (content hash) to detect moved vs. new paragraphs |
| **Partial paragraph changes** | Split text nodes at diff boundaries, apply marks to ranges |
| **Table structure changes** | Handle as special case - compare cell-by-cell, row-by-row |
| **Image changes** | Compare media file hashes, mark entire image node as changed |
| **Style inheritance** | Resolve effective styles before comparing (use SuperDoc's style resolver) |
| **Large documents** | Use Web Workers for diffing, virtualize the viewer |
| **Nested structures** | Recursive diffing for lists, tables, nested content |
| **Whitespace sensitivity** | Normalize whitespace before text comparison |
| **Performance** | Cache parsed documents, use efficient diff algorithms |

---

## 7. Recommended Libraries

| Library | Purpose | Install |
|---------|---------|---------|
| `diff` | Text-level diffing | `npm install diff` |
| `fast-diff` | Fast character-level diffs | `npm install fast-diff` |
| `uuid` | Generate unique IDs for track changes | `npm install uuid` |
| `lodash.isequal` | Deep object comparison | `npm install lodash.isequal` |
| `superdoc` | Document rendering | (workspace dependency) |

---

## 8. Alternative Approaches

### Alternative A: Side-by-Side View

If the merged track changes approach proves too complex, consider a side-by-side view:

```
┌─────────────────────┬─────────────────────┐
│   Original (A)      │   Modified (B)      │
├─────────────────────┼─────────────────────┤
│ SuperDoc instance 1 │ SuperDoc instance 2 │
│ (read-only)         │ (read-only)         │
└─────────────────────┴─────────────────────┘
```

**Pros:**
- Simpler implementation
- No document merging required
- Clear separation of versions

**Cons:**
- Less like Word's "Compare Documents"
- Requires synchronized scrolling
- Takes more screen space

### Alternative B: Inline Highlighting Only

Instead of using track change marks, use simple CSS highlighting:

```css
.diff-inserted { background-color: #d4edda; }
.diff-deleted { background-color: #f8d7da; text-decoration: line-through; }
.diff-format-changed { background-color: #fff3cd; }
```

**Pros:**
- Simpler mark structure
- No dependency on track changes extension

**Cons:**
- Loses accept/reject functionality
- No author/date metadata
- Non-standard approach

---

## Next Steps

1. [ ] Set up React project with SuperDoc dependencies
2. [ ] Implement `documentParser.ts` using `Editor.loadXmlData`
3. [ ] Implement basic text diffing with `diff` library
4. [ ] Implement paragraph matching with LCS algorithm
5. [ ] Implement mark/style comparison
6. [ ] Implement track change mark injection
7. [ ] Build `ComparisonViewer` with SuperDoc
8. [ ] Add file upload UI
9. [ ] Add changes sidebar (optional)
10. [ ] Add export functionality
11. [ ] Performance optimization for large documents
12. [ ] Testing with various DOCX files

---

## References

- SuperDoc Track Changes Extension: `packages/super-editor/src/extensions/track-changes/`
- SuperConverter (DOCX parsing): `packages/super-editor/src/core/super-converter/`
- Editor headless mode: `packages/super-editor/src/core/Editor.ts`
- ProseMirror documentation: https://prosemirror.net/docs/
- diff library: https://github.com/kpdecker/jsdiff

---

*Document created: January 2026*

