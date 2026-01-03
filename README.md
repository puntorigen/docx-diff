# DOCX Comparison Engine

A web application that compares two versions of a DOCX document and displays the differences using tracked changes, built with [SuperDoc](https://superdoc.dev).

## Features

- **Upload & Compare**: Upload an original DOCX document, then upload a new version to see differences
- **Track Changes**: Changes are displayed using SuperDoc's native tracked changes (insertions, deletions)
- **Accept/Reject**: Review individual changes and accept or reject them
- **Change Summary**: Get a summary of all changes with counts and highlights
- **Preserved Formatting**: Original document structure and formatting are maintained

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Document Editor**: SuperDoc
- **Diff Algorithm**: diff-match-patch

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Build for Production

```bash
npm run build
npm start
```

## Architecture

```
src/
├── app/                    # Next.js App Router
│   └── page.tsx           # Main page with comparison logic
├── components/
│   ├── layout/            # Header component
│   ├── results/           # ChangeSummary, ChangesSidebar
│   └── upload/            # DocxUploader
├── lib/
│   ├── services/          # Core comparison services
│   │   ├── documentParser.ts      # DOCX → ProseMirror JSON
│   │   ├── documentDiffer.ts      # Character-level diffing
│   │   ├── mergeDocuments.ts      # Applies track changes
│   │   └── trackChangeInjector.ts # Creates track marks
│   └── types/             # TypeScript definitions
└── store/                 # Zustand state management
```

## How It Works

The application uses a **"Merge and Mark"** approach:

1. **Parse Documents**: Both DOCX files are loaded into hidden SuperDoc editors and converted to ProseMirror JSON

2. **Character-Level Diff**: Full text is extracted and compared using diff-match-patch, producing segments of `equal`, `insert`, and `delete` operations

3. **Merge with Track Changes**: The original document structure is preserved while injecting `trackInsert` and `trackDelete` marks at the appropriate positions

4. **Display**: The merged document is loaded into SuperDoc in "review" mode, showing:
   - Deletions: Red strikethrough
   - Insertions: Green underline

5. **Review**: Users can accept or reject individual changes via the sidebar

## Key Implementation Details

### SuperDoc Configuration

```typescript
new SuperDoc({
  documentMode: 'editing',  // Enables accept/reject
  role: 'editor',          // Permission to modify
  permissionResolver: () => true,  // Allow all operations
});

// Enable visual track changes
superdoc.setTrackedChangesPreferences({
  mode: 'review',  // Shows both insertions and deletions
  enabled: true
});
```

### Track Change Marks

```typescript
// Insertion mark
{
  type: 'trackInsert',
  attrs: { id, author, authorEmail, date }
}

// Deletion mark
{
  type: 'trackDelete',
  attrs: { id, author, authorEmail, date }
}
```

## Documentation

See `PLANS/final-approach.md` for a detailed technical guide that can be used to rebuild this solution in other projects.

## License

This project was created as a take-home assignment for SuperDoc.
