# DocX Diff - Architecture Overview

A DOCX comparison tool built with Next.js and SuperDoc that detects changes between document versions and displays them with tracked changes.

## Quick Start

```bash
npm install
npm run dev
```

## How It Works

```
┌─────────────┐     ┌─────────────┐
│   V1.docx   │     │   V2.docx   │
└──────┬──────┘     └──────┬──────┘
       │                   │
       ▼                   ▼
┌──────────────────────────────────┐
│     parseDocx() - Hidden         │  Convert DOCX → ProseMirror JSON
│     SuperDoc instances           │  (lib/services/documentParser.ts)
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│     diffDocuments()              │  Character-level diff
│     diff-match-patch             │  (lib/services/documentDiffer.ts)
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│     mergeDocuments()             │  Clone V1, inject track marks
│     trackInsert/trackDelete/     │  (lib/services/mergeDocuments.ts)
│     trackFormat marks            │
└──────────────┬───────────────────┘
               │
               ▼
┌──────────────────────────────────┐
│     SuperDocViewer               │  Display with track changes UI
│     (review mode)                │  (components/editor/SuperDocViewer.tsx)
└──────────────────────────────────┘
```

## Project Structure

```
src/
├── app/
│   ├── page.tsx           # Main page - orchestrates the comparison flow
│   ├── layout.tsx         # Root layout with SEO metadata
│   └── globals.css        # Global styles + track change CSS
│
├── components/
│   ├── editor/
│   │   └── SuperDocViewer.tsx   # Unified SuperDoc wrapper
│   ├── layout/
│   │   ├── Header.tsx           # App header with actions
│   │   └── Footer.tsx           # Copyright footer
│   └── upload/
│       └── DocxUploader.tsx     # Drag-and-drop file upload
│
├── lib/
│   ├── services/
│   │   ├── documentParser.ts      # DOCX → JSON (hidden SuperDoc)
│   │   ├── documentDiffer.ts      # Character-level diff algorithm
│   │   ├── mergeDocuments.ts      # Apply track changes to document
│   │   ├── trackChangeInjector.ts # Create track change marks
│   │   ├── exportPreparation.ts   # Fix SuperDoc export limitations
│   │   └── index.ts               # Barrel export
│   └── types/
│       ├── diff.types.ts          # Diff-related types
│       └── document.types.ts      # Document model types
│
└── store/
    └── document-store.ts    # Zustand state management
```

## Key Files

| File | Purpose |
|------|---------|
| `page.tsx` | Main orchestration - handles uploads, comparison flow, UI states |
| `Header.tsx` | App header with file info row showing compared files |
| `SuperDocViewer.tsx` | Unified component for viewing/editing documents with SuperDoc |
| `documentParser.ts` | Converts DOCX files to ProseMirror JSON using hidden editors |
| `documentDiffer.ts` | Performs character-level diff using diff-match-patch |
| `mergeDocuments.ts` | Clones V1 and injects track change marks based on diff |
| `exportPreparation.ts` | Fixes SuperDoc export issues (comments, format changes) |

## Data Flow

1. **Upload V1** → `DocxUploader` → stored in Zustand → displayed in `SuperDocViewer`
2. **Upload V2** → `parseDocx()` extracts JSON → `diffDocuments()` finds changes
3. **Merge** → `mergeDocuments()` creates JSON with track marks
4. **Display** → `SuperDocViewer` renders merged document in review mode
5. **Export** → `ExportPreparation` fixes issues → `editor.exportDocx()` → download

## UI Components

```
┌─────────────────────────────────────────────────────────────────┐
│ Header                                                          │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [Logo] DocX Diff         [Start over] [Compare with...] [↓] │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │ 📄 Original: file.docx → Compared with: file-v2.docx        │ │  ← File info row
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ Notification Card (dismissible)                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ ✓ Changes detected: 3 insertions, 2 deletions          [×]  │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ SuperDocViewer (with toolbar)                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [Toolbar: B I U | Align | Lists | ...]                      │ │
│ ├─────────────────────────────────────────────────────────────┤ │
│ │                                                             │ │
│ │   Document content with track changes...                    │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ Footer                                                          │
└─────────────────────────────────────────────────────────────────┘
```

## Track Change Marks

SuperDoc uses ProseMirror marks for track changes:

```typescript
// Insertion (green underline)
{ type: 'trackInsert', attrs: { id, author, date, ... } }

// Deletion (red strikethrough)
{ type: 'trackDelete', attrs: { id, author, date, ... } }

// Format change (yellow highlight)
{ type: 'trackFormat', attrs: { id, author, date, before, after } }
```

## Configuration

### Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_BASE_URL` | Base URL for SEO metadata |

### Author Settings

Track changes are attributed to:
- **Tool changes**: `DocX Diff Tool` / `tool@docxdiff.com`
- **User changes**: `DocX Diff User` / `tool@docxdiff.com`

## Known Limitations

See [PLANS/limitations.md](./PLANS/limitations.md) for details:

1. **Format change rejection in Word**: Rejecting format-only changes in MS Word erases the text (Word XML limitation)
2. **Comments**: Fixed via `ExportPreparation` class

## Detailed Documentation

For implementation details, code examples, and troubleshooting:

→ **[PLANS/final-approach.md](./PLANS/final-approach.md)**

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Editor**: SuperDoc (ProseMirror-based)
- **Diff**: diff-match-patch
- **State**: Zustand
- **Styling**: Tailwind CSS

