/**
 * SuperDoc Writer Adapter
 * Applies ChangeSet to a SuperDoc editor instance.
 */

import type { ChangeSet, TextChange, MarkModel } from '@/lib/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuperDocInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorInstance = any;

/**
 * Apply a single mark to the current selection.
 */
function applyMark(editor: EditorInstance, mark: MarkModel): void {
  const commands = editor.commands;

  switch (mark.type) {
    case 'bold':
      if (commands.setBold) commands.setBold();
      else if (commands.toggleBold) commands.toggleBold();
      break;
    case 'italic':
      if (commands.setItalic) commands.setItalic();
      else if (commands.toggleItalic) commands.toggleItalic();
      break;
    case 'underline':
      if (commands.setUnderline) commands.setUnderline();
      else if (commands.toggleUnderline) commands.toggleUnderline();
      break;
    case 'strike':
      if (commands.setStrike) commands.setStrike();
      else if (commands.toggleStrike) commands.toggleStrike();
      break;
    case 'fontSize':
      if (mark.value && commands.setFontSize) {
        commands.setFontSize(mark.value);
      }
      break;
    case 'fontFamily':
      if (mark.value && commands.setFontFamily) {
        commands.setFontFamily(mark.value);
      }
      break;
    case 'color':
      if (mark.value && commands.setColor) {
        commands.setColor(mark.value);
      }
      break;
    case 'backgroundColor':
      if (mark.value && commands.setBackgroundColor) {
        commands.setBackgroundColor(mark.value);
      }
      break;
    case 'link':
      if (mark.value && commands.setLink) {
        commands.setLink({ href: mark.value });
      }
      break;
    case 'subscript':
      if (commands.setSubscript) commands.setSubscript();
      else if (commands.toggleSubscript) commands.toggleSubscript();
      break;
    case 'superscript':
      if (commands.setSuperscript) commands.setSuperscript();
      else if (commands.toggleSuperscript) commands.toggleSuperscript();
      break;
  }
}

/**
 * Remove a mark from the current selection.
 */
function removeMark(editor: EditorInstance, mark: MarkModel): void {
  const commands = editor.commands;

  switch (mark.type) {
    case 'bold':
      if (commands.unsetBold) commands.unsetBold();
      else if (commands.toggleBold) commands.toggleBold();
      break;
    case 'italic':
      if (commands.unsetItalic) commands.unsetItalic();
      else if (commands.toggleItalic) commands.toggleItalic();
      break;
    case 'underline':
      if (commands.unsetUnderline) commands.unsetUnderline();
      else if (commands.toggleUnderline) commands.toggleUnderline();
      break;
    case 'strike':
      if (commands.unsetStrike) commands.unsetStrike();
      else if (commands.toggleStrike) commands.toggleStrike();
      break;
    case 'fontSize':
      commands.unsetFontSize?.();
      break;
    case 'fontFamily':
      commands.unsetFontFamily?.();
      break;
    case 'color':
      commands.unsetColor?.();
      break;
    case 'backgroundColor':
      commands.unsetBackgroundColor?.();
      break;
    case 'link':
      commands.unsetLink?.();
      break;
    case 'subscript':
      if (commands.unsetSubscript) commands.unsetSubscript();
      else if (commands.toggleSubscript) commands.toggleSubscript();
      break;
    case 'superscript':
      if (commands.unsetSuperscript) commands.unsetSuperscript();
      else if (commands.toggleSuperscript) commands.toggleSuperscript();
      break;
  }
}

/**
 * Calculate position adjustment based on prior changes.
 * When we apply changes from end to start, earlier positions stay valid.
 * But when applying format changes after text changes, we need to adjust.
 */
function adjustPosition(
  position: number,
  textChanges: TextChange[]
): number {
  let adjustment = 0;

  for (const change of textChanges) {
    if (change.position < position) {
      if (change.type === 'insert') {
        adjustment += change.text.length;
      } else if (change.type === 'delete') {
        adjustment -= change.text.length;
      }
    }
  }

  return position + adjustment;
}

/**
 * Apply all changes from a ChangeSet to the editor.
 * Must be called with editor in "suggesting" mode.
 */
export async function applyChangeSet(
  superdoc: SuperDocInstance,
  editor: EditorInstance,
  changeSet: ChangeSet
): Promise<void> {
  console.log('Applying changes:', {
    textChanges: changeSet.textChanges.length,
    formatChanges: changeSet.formatChanges.length,
    paragraphChanges: changeSet.paragraphChanges.length,
    summary: changeSet.summary,
  });

  // If no changes, nothing to do
  if (
    changeSet.textChanges.length === 0 &&
    changeSet.formatChanges.length === 0 &&
    changeSet.paragraphChanges.length === 0
  ) {
    console.log('No changes to apply');
    return;
  }

  // Ensure we're in suggesting mode for tracked changes
  if (superdoc.setDocumentMode) {
    superdoc.setDocumentMode('suggesting');
    // Small delay to let mode change propagate
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Verify editor is still valid after delay
  if (!editor?.state?.doc) {
    console.warn('Editor became invalid after mode change');
    return;
  }

  const commands = editor.commands;
  const docSize = editor.state?.doc?.content?.size || 0;
  console.log('Current document size:', docSize);

  // 1. Apply text changes from END to START (preserves positions)
  // For same position, deletes must come before inserts (so they're applied first when iterating)
  const sortedTextChanges = [...changeSet.textChanges].sort((a, b) => {
    if (b.position !== a.position) {
      return b.position - a.position; // Higher positions first
    }
    // Same position: deletes before inserts (delete = 0, insert = 1)
    const typeOrder = (type: string) => (type === 'delete' ? 0 : 1);
    return typeOrder(a.type) - typeOrder(b.type);
  });

  console.log('Sorted text changes to apply:');
  sortedTextChanges.forEach((c, i) => {
    console.log(`  ${i}: ${c.type} "${c.text.slice(0, 30)}..." at ${c.position}`);
  });

  for (const change of sortedTextChanges) {
    // Validate position is within document
    if (change.position < 0 || change.position > docSize) {
      console.warn('Skipping invalid text change position:', change.position);
      continue;
    }

    try {
      if (change.type === 'delete') {
        const endPos = Math.min(change.position + change.text.length, docSize);
        commands.deleteRange?.({
          from: change.position,
          to: endPos,
        });
      } else if (change.type === 'insert') {
        commands.insertContentAt?.(change.position, change.text, {
          updateSelection: false,
        });
      }
    } catch (err) {
      console.warn('Error applying text change:', err);
    }
  }

  // 2. Apply format changes - skip for now as they're causing issues
  // Format changes require precise position mapping which is complex
  if (changeSet.formatChanges.length > 0) {
    console.log('Skipping format changes for now (complex position mapping)');
  }

  // 3. Apply paragraph changes (full paragraph insert/delete)
  // Sort by position, apply from end to start
  const sortedParagraphChanges = [...changeSet.paragraphChanges].sort(
    (a, b) => {
      const posA = a.type === 'insert' ? (a.insertAfterIndex ?? -1) : a.paragraph.position;
      const posB = b.type === 'insert' ? (b.insertAfterIndex ?? -1) : b.paragraph.position;
      return posB - posA;
    }
  );

  for (const paraChange of sortedParagraphChanges) {
    try {
      if (paraChange.type === 'delete') {
        const start = paraChange.paragraph.position;
        if (start < 0 || start >= docSize) {
          console.warn('Skipping invalid paragraph delete position:', start);
          continue;
        }
        const end = Math.min(start + paraChange.paragraph.textContent.length + 2, docSize);
        commands.deleteRange?.({ from: start, to: end });
      } else if (paraChange.type === 'insert') {
        const insertPosition = paraChange.insertAfterIndex ?? 0;
        commands.insertContentAt?.(
          insertPosition,
          `<p>${paraChange.paragraph.textContent}</p>`,
          { updateSelection: false }
        );
      }
    } catch (err) {
      console.warn('Error applying paragraph change:', err);
    }
  }

  // Clear selection at the end
  commands.blur?.();
}

/**
 * Apply changes and return to editing mode.
 */
export async function applyAndFinalize(
  superdoc: SuperDocInstance,
  editor: EditorInstance,
  changeSet: ChangeSet
): Promise<void> {
  await applyChangeSet(superdoc, editor, changeSet);

  // Stay in suggesting mode to show changes
  // User can accept/reject changes later
}

