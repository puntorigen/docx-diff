# SuperDoc Export Fixes

## Overview

This document describes workarounds for two SuperDoc DOCX export limitations.

---

## Issue 1: Comments Export with Empty Text ✅ FIXED

### Problem
SuperDoc's `convertHtmlToSchema()` creates empty paragraph JSON without `content` array.

### Solution
Extract text from `commentText` HTML and build proper `commentJSON`:

```typescript
const fixCommentJson = (comment) => {
  if (!comment.commentText) return comment;
  if (comment.commentJSON?.content?.length > 0) return comment;
  
  const text = extractTextFromHtml(comment.commentText);
  return {
    ...comment,
    commentJSON: {
      type: 'paragraph',
      content: [{ type: 'text', text }]
    }
  };
};
```

---

## Issue 2: Format-Only Changes Not Exported ⚠️ PARTIAL FIX

### Problem
SuperDoc only generates `w:rPrChange` when `trackFormat` co-exists with `trackInsert` or `trackDelete`. Standalone `trackFormat` marks are ignored during export.

### Workaround
Transform standalone `trackFormat` into delete + insert pairs:

```typescript
function splitTrackFormat(node) {
  const trackFormat = node.marks.find(m => m.type === 'trackFormat');
  const { before, after, id, author, date } = trackFormat.attrs;
  
  const deleteNode = {
    type: 'text',
    text: node.text,
    marks: [...before, { type: 'trackDelete', attrs: { id: `${id}-del`, author, date } }]
  };
  
  const insertNode = {
    type: 'text',
    text: node.text,
    marks: [...after, { type: 'trackInsert', attrs: { id: `${id}-ins`, author, date } }]
  };
  
  return { deleteNode, insertNode };
}
```

### ⚠️ Limitation: Reject Empties Text in MS Word

**Accepting** a format change works correctly.

**Rejecting** a format change in MS Word results in **empty text**. This is because:

1. Our workaround generates: `<w:del><w:delText>text</w:delText></w:del>` + `<w:ins><w:t>text</w:t></w:ins>`
2. When rejecting: Word removes `<w:ins>` but `<w:delText>` stays hidden
3. Result: No visible text

**Root cause**: Word expects format-only changes to use `<w:rPrChange>` inside a normal run, not separate `w:del`/`w:ins` blocks. SuperDoc doesn't support generating this structure.

**This is out of scope** - fixing it would require modifying SuperDoc's internal DOCX export logic.

---

## Export Flow

```
handleDownload()
    │
    ▼
Save original: editor.getJSON()
    │
    ▼
ExportPreparation.prepare()
  ├── Clone document JSON
  ├── Transform trackFormat → delete + insert
  └── Fix empty commentJSON
    │
    ▼
Apply patched content to editor
    │
    ▼
editor.exportDocx({ comments })
    │
    ▼
Restore original content
    │
    ▼
downloadBlob()
```

---

## Files

- `src/lib/services/exportPreparation.ts` - ExportPreparation class
- `src/app/page.tsx` - handleDownload function

---

## Summary

| Issue | Status | Accept | Reject |
|-------|--------|--------|--------|
| Comments export | ✅ Fixed | N/A | N/A |
| Format changes export | ⚠️ Partial | ✅ Works | ❌ Empties text |
| Text insertions | ✅ Working | ✅ Works | ✅ Works |
| Text deletions | ✅ Working | ✅ Works | ✅ Works |
