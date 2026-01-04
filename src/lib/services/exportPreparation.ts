/**
 * Export Preparation Service
 * 
 * Handles fixes for SuperDoc export limitations:
 * 1. Comments with empty commentJSON
 * 2. Standalone trackFormat marks not being exported
 * 
 * For trackFormat fix: SuperDoc's exporter generates w:rPrChange (format changes)
 * only when BOTH trackInsert AND trackFormat marks are present on the same node.
 * We add trackInsert to standalone trackFormat nodes to enable proper export.
 */

import { v4 as uuidv4 } from 'uuid';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProseMirrorNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SuperDocInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Comment = any;

export interface ExportPreparationResult {
  patchedDocJson: ProseMirrorNode;
  fixedComments: Comment[];
}

/**
 * Prepares a document for export by fixing SuperDoc limitations
 */
export class ExportPreparation {
  private superdoc: SuperDocInstance;

  constructor(superdoc: SuperDocInstance) {
    this.superdoc = superdoc;
  }

  /**
   * Main entry point - prepares document and comments for export
   */
  prepare(): ExportPreparationResult {
    const editor = this.superdoc.activeEditor;
    if (!editor) {
      throw new Error('No active editor available');
    }

    // Get document JSON and clone it for patching
    const docJson = editor.getJSON();
    const patchedDocJson = this.cloneDeep(docJson);

    // Transform document: fix standalone trackFormat marks
    this.transformDocument(patchedDocJson);

    // Fix comments with empty commentJSON
    const fixedComments = this.getFixedComments();

    return { patchedDocJson, fixedComments };
  }

  // ============================================
  // Document Transformation (trackFormat fix)
  // ============================================

  /**
   * Recursively transform document to fix standalone trackFormat marks
   */
  private transformDocument(node: ProseMirrorNode): void {
    if (!node.content || !Array.isArray(node.content)) {
      return;
    }

    const newContent: ProseMirrorNode[] = [];

    for (const child of node.content) {
      if (child.type === 'text' && this.hasStandaloneTrackFormat(child)) {
        // Split into delete + insert pair
        const { deleteNode, insertNode } = this.splitTrackFormat(child);
        newContent.push(deleteNode, insertNode);
      } else {
        // Recursively process children first
        this.transformDocument(child);
        newContent.push(child);
      }
    }

    node.content = newContent;
  }

  /**
   * Check if node has trackFormat but NOT trackInsert or trackDelete
   */
  private hasStandaloneTrackFormat(node: ProseMirrorNode): boolean {
    const marks = node.marks || [];
    const hasTrackFormat = marks.some((m: ProseMirrorNode) => m.type === 'trackFormat');
    const hasTrackInsert = marks.some((m: ProseMirrorNode) => m.type === 'trackInsert');
    const hasTrackDelete = marks.some((m: ProseMirrorNode) => m.type === 'trackDelete');

    return hasTrackFormat && !hasTrackInsert && !hasTrackDelete;
  }

  /**
   * Split a node with standalone trackFormat into delete + insert pair
   */
  private splitTrackFormat(node: ProseMirrorNode): { deleteNode: ProseMirrorNode; insertNode: ProseMirrorNode } {
    const marks = node.marks || [];
    const trackFormat = marks.find((m: ProseMirrorNode) => m.type === 'trackFormat');
    
    // Get non-tracking marks (preserve links, etc.)
    const otherMarks = marks.filter((m: ProseMirrorNode) => 
      !['trackFormat', 'trackInsert', 'trackDelete'].includes(m.type)
    );

    const { before = [], after = [], id, author, authorEmail, date } = trackFormat?.attrs || {};
    
    // Generate related IDs for the pair
    const baseId = id || uuidv4();
    const deleteId = `${baseId}-del`;
    const insertId = `${baseId}-ins`;

    // Deleted version: old formatting (before) + trackDelete
    const deleteNode: ProseMirrorNode = {
      type: 'text',
      text: node.text,
      marks: [
        ...this.cloneDeep(before),
        ...this.cloneDeep(otherMarks),
        {
          type: 'trackDelete',
          attrs: {
            id: deleteId,
            author: author || 'DocX Diff',
            authorEmail: authorEmail || 'docx@pabloschaffner.com',
            authorImage: '',
            date: date || new Date().toISOString(),
          },
        },
      ],
    };

    // Inserted version: new formatting (after) + trackInsert
    const insertNode: ProseMirrorNode = {
      type: 'text',
      text: node.text,
      marks: [
        ...this.cloneDeep(after),
        ...this.cloneDeep(otherMarks),
        {
          type: 'trackInsert',
          attrs: {
            id: insertId,
            author: author || 'DocX Diff',
            authorEmail: authorEmail || 'docx@pabloschaffner.com',
            authorImage: '',
            date: date || new Date().toISOString(),
          },
        },
      ],
    };

    return { deleteNode, insertNode };
  }

  // ============================================
  // Comments Fix
  // ============================================

  /**
   * Get comments with fixed commentJSON
   */
  private getFixedComments(): Comment[] {
    const commentsStore = this.superdoc.commentsStore;

    if (!commentsStore) {
      return [];
    }

    // Use SuperDoc's built-in translateCommentsForExport method
    if (typeof commentsStore.translateCommentsForExport === 'function') {
      try {
        const translatedComments = commentsStore.translateCommentsForExport();
        // Fix any comments with empty commentJSON
        return translatedComments.map((c: Comment) => this.fixCommentJson(c));
      } catch (err) {
        console.error('[ExportPrep] translateCommentsForExport failed:', err);
      }
    }

    // Fallback: get raw comments
    if (commentsStore.commentsList?.value) {
      return commentsStore.commentsList.value.map((comment: Comment) => {
        const values = typeof comment.getValues === 'function' ? comment.getValues() : comment;
        return this.fixCommentJson(values);
      });
    }

    return [];
  }

  /**
   * Fix a comment's commentJSON if it's missing content
   */
  private fixCommentJson(comment: Comment): Comment {
    const json = comment.commentJSON;
    const html = comment.commentText;

    // If no HTML text, nothing to fix
    if (!html) return comment;

    // Check if commentJSON exists and has content
    if (json && json.content && json.content.length > 0) {
      return comment;
    }

    // Extract text from HTML
    const text = this.extractTextFromHtml(html).trim();
    if (!text) return comment;

    // Create proper ProseMirror JSON with text content
    const fixedJson = {
      type: 'paragraph',
      content: [{ type: 'text', text }],
    };

    return { ...comment, commentJSON: fixedJson };
  }

  /**
   * Extract plain text from HTML string
   */
  private extractTextFromHtml(html: string): string {
    if (!html) return '';
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  // ============================================
  // Utilities
  // ============================================

  /**
   * Deep clone an object
   */
  private cloneDeep<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    return JSON.parse(JSON.stringify(obj));
  }
}

/**
 * Helper function to trigger download of a blob
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

