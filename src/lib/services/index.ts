/**
 * Services Index
 * Exports all document comparison services.
 */

export { parseDocx, extractJSON, type ParsedDocument, type ProseMirrorJSON } from './documentParser';
export { diffDocuments, type DiffResult, type DiffSegment, type TextChange, type FormatChange, type ModifiedParagraph, type ParagraphDiff } from './documentDiffer';
export { createTrackInsertMark, createTrackDeleteMark, createTrackFormatMark, markAllAsDeleted, markAllAsInserted, cloneNode, createTextNode, type TrackChangeAuthor } from './trackChangeInjector';
export { mergeDocuments, createSimpleMergedDocument } from './mergeDocuments';

