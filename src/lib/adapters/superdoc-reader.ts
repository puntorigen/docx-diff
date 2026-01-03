/**
 * SuperDoc Reader Adapter
 * Extracts DocumentModel from a SuperDoc editor instance.
 */

import type {
  DocumentModel,
  ParagraphModel,
  TextSpan,
  MarkModel,
  MarkType,
} from '@/lib/types';
import { hashString } from '@/lib/utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type EditorInstance = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PMNode = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PMMark = any;

/**
 * Convert a ProseMirror mark to our normalized MarkModel.
 */
function convertMark(mark: PMMark): MarkModel | null {
  const typeName = mark.type?.name || mark.type;

  // Map ProseMirror mark types to our normalized types
  const markTypeMap: Record<string, MarkType> = {
    bold: 'bold',
    strong: 'bold',
    italic: 'italic',
    em: 'italic',
    underline: 'underline',
    strike: 'strike',
    strikethrough: 'strike',
    link: 'link',
    subscript: 'subscript',
    superscript: 'superscript',
  };

  if (markTypeMap[typeName]) {
    const result: MarkModel = { type: markTypeMap[typeName] };

    // Handle link href
    if (typeName === 'link' && mark.attrs?.href) {
      result.value = mark.attrs.href;
    }

    return result;
  }

  // Handle textStyle marks (fontSize, fontFamily, color)
  if (typeName === 'textStyle' && mark.attrs) {
    const results: MarkModel[] = [];

    if (mark.attrs.fontSize) {
      results.push({ type: 'fontSize', value: mark.attrs.fontSize });
    }
    if (mark.attrs.fontFamily) {
      results.push({ type: 'fontFamily', value: mark.attrs.fontFamily });
    }
    if (mark.attrs.color) {
      results.push({ type: 'color', value: mark.attrs.color });
    }
    if (mark.attrs.backgroundColor) {
      results.push({
        type: 'backgroundColor',
        value: mark.attrs.backgroundColor,
      });
    }

    // Return first mark (caller handles multiple)
    return results[0] || null;
  }

  return null;
}

/**
 * Convert all marks from a ProseMirror node.
 */
function convertMarks(marks: PMMark[]): MarkModel[] {
  if (!marks || !Array.isArray(marks)) return [];

  const result: MarkModel[] = [];

  for (const mark of marks) {
    // Handle textStyle which can contain multiple marks
    const typeName = mark.type?.name || mark.type;

    if (typeName === 'textStyle' && mark.attrs) {
      if (mark.attrs.fontSize) {
        result.push({ type: 'fontSize', value: mark.attrs.fontSize });
      }
      if (mark.attrs.fontFamily) {
        result.push({ type: 'fontFamily', value: mark.attrs.fontFamily });
      }
      if (mark.attrs.color) {
        result.push({ type: 'color', value: mark.attrs.color });
      }
      if (mark.attrs.backgroundColor) {
        result.push({
          type: 'backgroundColor',
          value: mark.attrs.backgroundColor,
        });
      }
    } else {
      const converted = convertMark(mark);
      if (converted) {
        result.push(converted);
      }
    }
  }

  return result;
}

/**
 * Extract all text from a paragraph node, handling nested run/text structure.
 * DOCX structure is: paragraph → run → text
 */
function extractTextFromParagraph(node: PMNode, basePos: number): { spans: TextSpan[]; textContent: string } {
  const spans: TextSpan[] = [];
  let textContent = '';
  let textOffset = 0;

  // Use descendants to find all text nodes within this paragraph
  node.descendants((child: PMNode, childPos: number) => {
    if (child.isText && child.text) {
      const text = child.text;
      const marks = convertMarks(child.marks || []);

      spans.push({
        text,
        position: {
          start: textOffset,
          end: textOffset + text.length,
          pmStart: basePos + childPos,
          pmEnd: basePos + childPos + text.length,
        },
        marks,
      });

      textContent += text;
      textOffset += text.length;
    }
    return true; // Continue descending to find text nodes
  });

  return { spans, textContent };
}

/**
 * Extract paragraphs from a ProseMirror document.
 * Recursively walks the document tree to find all paragraph-like nodes.
 */
function extractParagraphs(doc: PMNode): ParagraphModel[] {
  const paragraphs: ParagraphModel[] = [];
  let paragraphIndex = 0;

  // Debug: log all node types in the document
  const nodeTypes = new Set<string>();
  doc.descendants((node: PMNode) => {
    nodeTypes.add(node.type?.name || 'unknown');
    return true;
  });
  console.log('All node types in document:', Array.from(nodeTypes));

  // Recursively walk the document tree using descendants
  doc.descendants((node: PMNode, pos: number) => {
    const typeName = node.type?.name;
    
    // Handle paragraph-like nodes
    if (
      typeName === 'paragraph' ||
      typeName === 'heading' ||
      typeName === 'listItem'
    ) {
      // Extract text from paragraph, handling nested run/text structure
      const { spans, textContent } = extractTextFromParagraph(node, pos + 1);

      // Only add non-empty paragraphs
      if (textContent.length > 0) {
        paragraphs.push({
          id: `para-${paragraphIndex}`,
          index: paragraphIndex,
          position: pos,
          spans,
          textContent,
          contentHash: hashString(textContent),
        });

        paragraphIndex++;
      }

      // Return false to NOT descend into this node (we've already processed it)
      return false;
    }
    
    // Return true to continue descending into child nodes
    return true;
  });

  console.log('Paragraphs extracted:', paragraphs.length);
  if (paragraphs.length > 0) {
    console.log('First paragraph text:', paragraphs[0].textContent.substring(0, 100));
  }

  return paragraphs;
}

/**
 * Extract a DocumentModel from a SuperDoc editor instance.
 */
export function extractDocumentModel(editor: EditorInstance): DocumentModel {
  if (!editor?.state?.doc) {
    throw new Error('Invalid editor instance: missing state.doc');
  }

  const doc = editor.state.doc;
  const paragraphs = extractParagraphs(doc);

  return {
    paragraphs,
    metadata: {
      modifiedAt: new Date(),
    },
  };
}

/**
 * Extract a DocumentModel from ProseMirror JSON.
 */
export function extractDocumentModelFromJson(json: {
  type: string;
  content?: PMNode[];
}): DocumentModel {
  if (!json || json.type !== 'doc') {
    throw new Error('Invalid ProseMirror JSON: expected doc node');
  }

  const paragraphs: ParagraphModel[] = [];
  let paragraphIndex = 0;
  let currentOffset = 0;

  // Process content array
  const content = json.content || [];

  for (const node of content) {
    if (
      node.type === 'paragraph' ||
      node.type === 'heading' ||
      node.type === 'listItem'
    ) {
      const spans: TextSpan[] = [];
      let textContent = '';
      let spanOffset = 0;
      let childOffset = 0;

      const nodeContent = node.content || [];

      for (const child of nodeContent) {
        if (child.type === 'text' && child.text) {
          const text = child.text;
          const marks = convertMarks(child.marks || []);

          spans.push({
            text,
            position: {
              start: spanOffset,
              end: spanOffset + text.length,
              pmStart: currentOffset + 1 + childOffset,
              pmEnd: currentOffset + 1 + childOffset + text.length,
            },
            marks,
          });

          textContent += text;
          spanOffset += text.length;
          childOffset += text.length;
        }
      }

      paragraphs.push({
        id: `para-${paragraphIndex}`,
        index: paragraphIndex,
        position: currentOffset,
        spans,
        textContent,
        contentHash: hashString(textContent),
      });

      paragraphIndex++;
      // Advance offset: +1 for paragraph open, +content, +1 for paragraph close
      currentOffset += 2 + childOffset;
    } else {
      // Skip unknown nodes but account for their size
      currentOffset += 2; // Rough estimate
    }
  }

  return {
    paragraphs,
    metadata: {
      modifiedAt: new Date(),
    },
  };
}

