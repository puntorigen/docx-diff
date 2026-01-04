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
│   ├── actions/
│   │   └── summarize.ts           # Server Action for AI summary
│   ├── services/
│   │   ├── documentParser.ts      # DOCX → JSON (hidden SuperDoc)
│   │   ├── documentDiffer.ts      # Character-level diff algorithm
│   │   ├── mergeDocuments.ts      # Apply track changes to document
│   │   ├── trackChangeInjector.ts # Create track change marks
│   │   ├── exportPreparation.ts   # Fix SuperDoc export limitations
│   │   ├── changeContextExtractor.ts  # Extract enriched changes for AI
│   │   ├── groqService.ts         # Groq LLM API wrapper
│   │   └── index.ts               # Barrel export
│   └── types/
│       ├── diff.types.ts          # Diff-related types
│       ├── document.types.ts      # Document model types
│       └── summary.types.ts       # AI summary types
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
| `summarize.ts` | Server Action for AI summary (secure, no public endpoint) |
| `changeContextExtractor.ts` | Extracts changes with semantic context for LLM |
| `groqService.ts` | Groq API wrapper with retries and fault-tolerant parsing |

## Data Flow

1. **Upload V1** → `DocxUploader` → stored in Zustand → displayed in `SuperDocViewer`
2. **Upload V2** → `parseDocx()` extracts JSON → `diffDocuments()` finds changes
3. **Merge** → `mergeDocuments()` creates JSON with track marks
4. **Display** → `SuperDocViewer` renders merged document in review mode
5. **AI Summary** → `extractEnrichedChanges()` → `summarizeChanges()` Server Action → display bullets
6. **Export** → `ExportPreparation` fixes issues → `editor.exportDocx()` → download

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
│ Notification Card (dismissible) - AI Summary                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Main changes detected:                                 [×]  │ │
│ │ • replaced company name 'Okidoki' with 'Superdoc' in Client │ │
│ │ • emphasized 'Chile' with bold in provider's address        │ │
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

## AI Summary

The AI summary transforms raw track changes into human-readable descriptions.

### How changeContextExtractor Works

```
mergedJson (with track marks)
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  traverseDocument()                                 │
│  - Walks the ProseMirror tree recursively          │
│  - Tracks current section (last heading text)      │
│  - Extracts full paragraph text for context        │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  For each text node with track mark:               │
│  - Extract changed text                            │
│  - Find surrounding sentence (splits by . ; ! ?)   │
│  - Build location info (section name, node type)   │
│  - Create EnrichedChange object                    │
└─────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  groupReplacements()                               │
│  - Combines adjacent delete+insert → replacement   │
└─────────────────────────────────────────────────────┘
         │
         ▼
EnrichedChange[] → sent to LLM for summarization
```

### EnrichedChange Structure

```typescript
{
  type: 'replacement',           // or 'insertion', 'deletion', 'format'
  oldText: 'Okidoki SpA',        // For replacements
  newText: 'Superdoc Inc',
  surroundingText: 'El cliente Okidoki SpA, RUT 12.345.678-9...',  // Context!
  location: {
    sectionTitle: 'Identificación de las partes',
    nodeType: 'paragraph',
    description: '"Identificación de las partes" section'
  }
}
```

The `surroundingText` is key - it allows the LLM to understand that "4 → 6" is part of a serial number, not just random digits.

### Security: Server Action

The AI summary uses a **Server Action** instead of an API route:

```typescript
// src/lib/actions/summarize.ts
'use server';

export async function summarizeChanges(changes: EnrichedChange[]): Promise<SummaryBullet[]> {
  // Called directly from frontend - no public /api/... endpoint
}
```

This means external callers (curl, Postman) cannot access the summarization.

## Configuration

### Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `GROQ_API_KEY` | Optional | Enables AI-powered change summaries |
| `NEXT_PUBLIC_BASE_URL` | Optional | Base URL for SEO metadata |

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

