# DOCX Comparison Engine

A web application that compares DOCX documents and shows changes using tracked changes, built with [SuperDoc](https://superdoc.dev).

## Features

- **Upload & Compare**: Upload two versions of a DOCX document and see the differences
- **Tracked Changes**: Changes are displayed using native tracked changes format (insertions, deletions, formatting)
- **Change Summary**: Get a summary of all changes detected between versions
- **Real-time Processing**: Documents are processed in the browser for fast comparison

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
npm run start
```

## Architecture

The application follows a modular architecture with clear separation of concerns:

```
src/
├── app/                    # Next.js App Router pages
├── components/             # React components
│   ├── upload/            # File upload components
│   ├── editor/            # Document viewer components
│   ├── results/           # Change display components
│   └── layout/            # Layout components
├── lib/
│   ├── types/             # TypeScript type definitions
│   ├── adapters/          # SuperDoc integration adapters
│   ├── core/              # Pure diff logic (no SuperDoc dependency)
│   └── engine/            # Comparison orchestration
├── hooks/                  # React hooks
└── store/                  # Zustand state management
```

### Key Design Decisions

1. **Abstraction Layer**: The `DocumentModel` and `ChangeSet` types abstract SuperDoc internals, making the core diff logic testable and maintainable.

2. **Paragraph-Based Diffing**: Documents are compared at the paragraph level first (using LCS alignment), then text within matched paragraphs is compared character-by-character.

3. **Format Change Detection**: Formatting changes (bold, italic, etc.) are detected by comparing marks on unchanged text regions.

4. **Suggesting Mode**: Changes are applied to SuperDoc in "suggesting" mode, which automatically creates tracked changes.

## How It Works

1. **Upload V1**: User uploads the original document, which is displayed in the editor
2. **Upload V2**: User uploads the new version
3. **Comparison**:
   - Both documents are converted to `DocumentModel` format
   - Paragraphs are aligned using LCS algorithm
   - Text changes (insertions/deletions) are detected using diff-match-patch
   - Format changes are detected by comparing marks on equal text
4. **Display**: Changes are applied to the editor in suggesting mode, showing tracked changes

## License

This project was created as a take-home assignment.
