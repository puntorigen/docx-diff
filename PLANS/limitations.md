# Known Limitations & Workarounds

## 1. User Comments Export ✅ RESOLVED

**Issue**: User-added comments were exporting to DOCX with markers but **without text content**.

**Root Cause**: SuperDoc's internal `convertHtmlToSchema()` creates empty paragraph JSON structures without the `content` array.

**Solution**: The `ExportPreparation` class extracts text from `commentText` HTML and creates proper `commentJSON`.

**Status**: ✅ Fixed

---

## 2. Format-Only Changes Export ⚠️ PARTIAL

**Issue**: Standalone `trackFormat` marks (format changes without text changes) were **not being exported** to DOCX.

**Root Cause**: SuperDoc's DOCX exporter only generates format change XML (`w:rPrChange`) when `trackFormat` co-exists with `trackInsert` or `trackDelete`. Standalone `trackFormat` marks are silently ignored.

### Workaround Implemented

We transform standalone `trackFormat` into **delete + insert pairs**:

```
Before: { text: "Chile", marks: [bold, trackFormat] }

After:  { text: "Chile", marks: [trackDelete] }  // old formatting
        { text: "Chile", marks: [bold, trackInsert] }  // new formatting
```

### ⚠️ Known Limitation: Reject in MS Word

**When rejecting a format change in MS Word, the text becomes empty.**

This happens because:
1. Word generates `<w:del><w:delText>Chile</w:delText></w:del>` + `<w:ins><w:t>Chile</w:t></w:ins>`
2. When rejecting: Word removes `<w:ins>` but `<w:delText>` stays as deleted/hidden text
3. Result: No visible text

**Why this can't be fixed easily:**
- Word expects format-only changes to use `<w:rPrChange>` inside a normal run (not `w:ins`/`w:del`)
- SuperDoc doesn't support generating this structure for standalone `trackFormat`
- Implementing proper XML handling is **out of scope** for this project

**Accept works correctly** - accepting a format change keeps the new formatting as expected.

**Status**: ⚠️ Partial (export works, accept works, reject doesn't work correctly)

---

## 3. Editor Visual Flicker During Export

**Issue**: The export process temporarily modifies the editor content.

**Workaround**: We save the original state, apply patches, export, then immediately restore. The flicker is minimal and usually imperceptible.

**Status**: ✅ Acceptable

---

## Summary Table

| Feature | Status | Notes |
|---------|--------|-------|
| Track insertions | ✅ Working | Full support |
| Track deletions | ✅ Working | Full support |
| Track format changes (in editor) | ✅ Working | Full support |
| Track format changes (export) | ⚠️ Partial | Accept works, **reject empties text** |
| Accept/reject in editor | ✅ Working | Full support |
| User comments (in editor) | ✅ Working | Full support |
| User comments (export) | ✅ Fixed | Via ExportPreparation |
| Download DOCX | ✅ Working | Full support |

---

## Out of Scope

The following would require significant changes to SuperDoc's internal DOCX export logic:

1. **Proper `w:rPrChange` XML generation** for standalone format changes
2. **Linked delete/insert pairs** that Word recognizes as a single replacement operation

These are documented here for future reference but are not planned for this project.
