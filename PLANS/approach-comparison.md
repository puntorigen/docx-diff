# Why We Should Switch to the "Merge and Mark" Approach

> **Date:** January 3, 2026  
> **Context:** Analysis of current implementation issues and recommendation to adopt approach2.md

---

## Executive Summary

Our current implementation attempts to apply document changes by programmatically executing editor commands (`deleteRange`, `insertContentAt`) on a live SuperDoc instance. This approach has proven **fundamentally flawed** due to position mapping issues that cause text duplication and incorrect change application.

The **"Merge and Mark"** approach outlined in `approach2.md` builds a merged document with track change marks embedded directly in the ProseMirror JSON structure. This is how SuperDoc's track changes system is designed to work, and eliminates the position mapping problems entirely.

**Recommendation:** Switch to the "Merge and Mark" approach immediately.

---

## Current Approach: "Command-Based Application"

### How It Works

```
1. Load V1 document into visible SuperDoc editor
2. Load V2 document into hidden SuperDoc editor  
3. Extract simplified document models from both
4. Compute text diff (deletions, insertions)
5. Apply changes via editor commands:
   - editor.commands.deleteRange({ from, to })
   - editor.commands.insertContentAt(position, text)
6. Enable "suggesting" mode to show track changes
```

### Issues Encountered

#### Issue 1: Position Shift During Application

When applying multiple changes, positions shift as the document is modified:

```
Original text at position 1002: "Okidoki SpA"
- Delete "Okidoki SpA" at position 1002 ✓
- Insert "Superdoc Inc" at position 1002... 
  But the document has changed! Position 1002 now points elsewhere.
```

**Result:** Text duplication ("Superdoc IncSuperdoc Inc") or misplaced changes.

#### Issue 2: Order Dependency

Changes must be applied in a specific order (end-to-start) to preserve positions. Even with correct sorting, replacements (delete + insert at same position) are fragile:

```javascript
// Console output showing the problem:
"  0: insert 'Superdoc Inc...' at 1013"  // Wrong! Should be 1002
"  1: delete 'Okidoki SpA...' at 1002"
```

The diff algorithm was computing insert positions incorrectly (after the deleted text instead of at the same position).

#### Issue 3: React/Vue Lifecycle Conflicts

SuperDoc uses Vue internally, embedded in our React app. Changing `documentMode` props caused the editor to remount, losing all applied changes:

```
[superdoc] Unmounting app  ← Editor destroyed with our changes!
```

#### Issue 4: Editor State Timing

The `setDocumentMode('suggesting')` call must propagate before applying changes, but async timing is unreliable:

```javascript
superdoc.setDocumentMode('suggesting');
await new Promise(resolve => setTimeout(resolve, 100)); // Fragile!
// Editor might still not be ready...
```

---

## New Approach: "Merge and Mark"

### How It Works

```
1. Parse V1 DOCX → ProseMirror JSON A
2. Parse V2 DOCX → ProseMirror JSON B
3. Diff the two JSON documents (paragraph + text level)
4. BUILD a new merged JSON document:
   - Deleted text → Include with `trackDelete` mark
   - Inserted text → Include with `trackInsert` mark
   - Format changes → Include with `trackFormat` mark
5. Load merged JSON into SuperDoc viewer
```

### Key Insight: Both Texts Exist in the Merged Document

For a replacement like "Okidoki SpA" → "Superdoc Inc":

```json
{
  "type": "paragraph",
  "content": [
    {
      "type": "text",
      "text": "Okidoki SpA",
      "marks": [{ "type": "trackDelete", "attrs": { "author": "Comparison Tool", "date": "..." }}]
    },
    {
      "type": "text", 
      "text": "Superdoc Inc",
      "marks": [{ "type": "trackInsert", "attrs": { "author": "Comparison Tool", "date": "..." }}]
    }
  ]
}
```

SuperDoc renders this as:
- ~~Okidoki SpA~~ (strikethrough, red)
- <u>Superdoc Inc</u> (underline, green)

**This is exactly how Microsoft Word's "Compare Documents" feature works.**

---

## Comparison Table

| Aspect | Current Approach | Merge and Mark |
|--------|-----------------|----------------|
| **Core Strategy** | Mutate live editor via commands | Build final JSON structure |
| **Position Mapping** | Complex, error-prone | Not needed |
| **State Timing** | Depends on async editor state | Deterministic |
| **Lifecycle Issues** | Conflicts with React/Vue | None (JSON-only until render) |
| **Debugging** | Hard (live mutations) | Easy (inspect JSON) |
| **SuperDoc Alignment** | Fighting the framework | Using as designed |
| **Robustness** | Fragile | Solid |

---

## Why "Merge and Mark" Aligns with SuperDoc

### Track Changes Are ProseMirror Marks

From SuperDoc's codebase, track changes are implemented as marks:

```javascript
// From SuperDoc's track-changes extension
trackInsert: {
  attrs: { id, author, authorEmail, authorImage, date }
}
trackDelete: {
  attrs: { id, author, authorEmail, authorImage, date }  
}
trackFormat: {
  attrs: { id, author, date, before: [], after: [] }
}
```

The "Merge and Mark" approach creates documents with these marks already present—exactly what SuperDoc expects.

### SuperDoc Can Load Pre-Built JSON

SuperDoc supports loading ProseMirror JSON content:

```javascript
superdoc.activeEditor.commands.setContent(mergedJsonDocument);
```

This is a supported operation, unlike our current approach of trying to simulate user edits programmatically.

---

## What We Keep vs. Replace

### Keep (Working Components)

| Component | Status |
|-----------|--------|
| File upload UI | ✅ Works well |
| SuperDoc initialization | ✅ Works (with lifecycle fixes) |
| Paragraph extraction | ✅ 220 paragraphs extracted correctly |
| Text diff algorithm | ✅ Changes detected correctly (4 text, 1 format) |
| Change sidebar/summary | ✅ Displays correctly |
| Zustand state management | ✅ Works well |

### Replace (Broken Components)

| Component | Current | New |
|-----------|---------|-----|
| Document model | Simplified (`textContent`, `position`) | Full ProseMirror JSON |
| Change application | `applyChangeSet()` via commands | `buildMergedDocument()` JSON builder |
| Rendering | Apply to V1 editor | Load merged JSON into viewer |

---

## Implementation Path

### Phase 1: Extract Full JSON
- Modify readers to capture complete ProseMirror JSON (not simplified model)
- Preserve all node types, attributes, and marks

### Phase 2: Build Document Merger
- Create `buildMergedDocument(jsonA, jsonB, diffResult)` function
- Generate proper `trackInsert`, `trackDelete`, `trackFormat` marks
- Handle paragraph-level and text-level merging

### Phase 3: Render Merged Document
- Load merged JSON into SuperDoc using `setContent()`
- Set `documentMode: 'viewing'` to show track changes read-only

### Phase 4: Polish
- Ensure styles and formatting are preserved
- Handle edge cases (tables, images, lists)
- Performance optimization if needed

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Schema mismatch | Validate against SuperDoc's actual schema before building |
| Complex node structures | Handle recursively (tables, lists have nested content) |
| Media/fonts | Preserve mediaFiles and fonts from original document |
| Large documents | Build incrementally, consider streaming |

---

## Conclusion

The current "command-based" approach is fundamentally flawed because it tries to mutate a live document where positions shift unpredictably. Despite multiple fixes for position calculation and ordering, the approach remains fragile.

The "Merge and Mark" approach builds the final document state directly as JSON, eliminating position mapping entirely. This aligns with how SuperDoc's track changes system is designed—marks embedded in the document structure.

**The path forward is clear: adopt the "Merge and Mark" approach from `approach2.md`.**

---

## References

- `PLANS/approach2.md` - Full implementation plan
- `PLANS/architecture-analysis.md` - Original analysis (deprecated)
- SuperDoc track changes: `packages/super-editor/src/extensions/track-changes/`
- ProseMirror documentation: https://prosemirror.net/docs/

