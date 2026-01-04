# DocX Diff

![DocX Diff Logo](public/logo.png)

**Compare Word Documents Online** – A web application that compares two versions of a DOCX document and displays the differences using tracked changes, built with [SuperDoc](https://superdoc.dev).

🔗 **Live Demo**: [docxdiff.com](https://docxdiff.com) *(coming soon)*

## Features

- **Upload & Compare**: Upload an original DOCX document, then upload a new version to see all differences instantly
- **Track Changes**: Changes are displayed using SuperDoc's native tracked changes (insertions, deletions, format changes)
- **Accept/Reject**: Review individual changes and accept or reject them via SuperDoc's bubble UI
- **Format Change Detection**: Detects formatting changes even when text content is identical (e.g., bold, italic)
- **Change Summary**: Dismissible notification card showing total changes with breakdown
- **Download**: Export the document with tracked changes as DOCX (100% MS Word compatible)
- **Editor Toolbar**: Full SuperDoc toolbar for additional document editing
- **Preserved Formatting**: Original document structure and formatting are maintained

## Tech Stack

- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **State Management**: Zustand
- **Document Editor**: [SuperDoc](https://superdoc.dev)
- **Diff Algorithm**: diff-match-patch
- **Fonts**: Roboto (headings), Open Sans (body)

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

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_BASE_URL` | Base URL for SEO metadata | `https://docxdiff.com` |

## Architecture

```
src/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout with SEO metadata
│   ├── page.tsx           # Main page with comparison logic
│   └── globals.css        # Global styles + track change CSS
├── components/
│   ├── layout/            # Header component
│   ├── results/           # ChangeSummary component
│   └── upload/            # DocxUploader component
├── lib/
│   ├── services/          # Core comparison services
│   │   ├── documentParser.ts      # DOCX → ProseMirror JSON
│   │   ├── documentDiffer.ts      # Character-level + format diffing
│   │   ├── mergeDocuments.ts      # Applies track changes to document
│   │   └── trackChangeInjector.ts # Creates trackInsert/Delete/Format marks
│   └── types/             # TypeScript definitions
├── store/                 # Zustand state management
└── superdoc.d.ts         # SuperDoc type declarations

public/
├── logo.png              # App logo
├── brand-info.txt        # Brand guidelines
└── favicon/              # Favicons and web manifest
```

## How It Works

The application uses a **"Merge and Mark"** approach:

1. **Parse Documents**: Both DOCX files are loaded into hidden SuperDoc editors and converted to ProseMirror JSON

2. **Character-Level Diff**: Full text is extracted and compared using diff-match-patch, producing segments of `equal`, `insert`, and `delete` operations

3. **Format Change Detection**: For `equal` text segments, marks (bold, italic, etc.) are compared to detect formatting-only changes

4. **Merge with Track Changes**: The original document structure is preserved while injecting `trackInsert`, `trackDelete`, and `trackFormat` marks at appropriate positions

5. **Display**: The merged document is loaded into SuperDoc in "review" mode, showing:
   - **Deletions**: Red strikethrough
   - **Insertions**: Green highlight
   - **Format changes**: Yellow background with amber dashed underline

6. **Review**: Users can accept or reject individual changes via SuperDoc's native bubble UI

## Key Implementation Details

### SuperDoc Configuration

```typescript
new SuperDoc({
  documentMode: 'editing',  // Enables accept/reject
  role: 'editor',          // Permission to modify
  
  // CRITICAL: Must include REJECT_OWN and REJECT_OTHER for reject to work!
  permissionResolver: ({ permission }) => {
    if (
      permission === 'RESOLVE_OWN' ||    // Accept own changes
      permission === 'RESOLVE_OTHER' ||  // Accept others' changes
      permission === 'REJECT_OWN' ||     // Reject own changes  
      permission === 'REJECT_OTHER'      // Reject others' changes
    ) {
      return true;
    }
    return undefined;
  },
});

// Enable visual track changes
superdoc.setTrackedChangesPreferences({
  mode: 'review',
  enabled: true
});
```

### Track Change Marks

```typescript
// Insertion mark (new text)
{ type: 'trackInsert', attrs: { id, author, authorEmail, authorImage, date } }

// Deletion mark (removed text)
{ type: 'trackDelete', attrs: { id, author, authorEmail, authorImage, date } }

// Format mark (formatting change)
{ type: 'trackFormat', attrs: { id, author, authorEmail, authorImage, date, before, after } }
```

### Author Configuration

Track changes are attributed to:
- **Author**: DocX Diff
- **Email**: docx@pabloschaffner.com

## Brand Guidelines

| Property | Value |
|----------|-------|
| Primary Color | `#007ACC` |
| Secondary Color | `#005B9C` |
| Accent Color | `#E8F0F8` |
| Heading Font | Roboto (700) |
| Body Font | Open Sans (400) |

## Documentation

See `PLANS/final-approach.md` for a detailed technical guide that can be used to rebuild this solution in other projects.

## License

MIT

## Author

**Pablo Schaffner** – [docx@pabloschaffner.com](mailto:docx@pabloschaffner.com)
