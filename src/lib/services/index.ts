/**
 * Services Index
 * Exports all document comparison services.
 */

export { parseDocx, extractJSON, type ParsedDocument, type ProseMirrorJSON } from './documentParser';
export { diffDocuments, type DiffResult, type DiffSegment, type FormatChange } from './documentDiffer';
export { createTrackInsertMark, createTrackDeleteMark, createTrackFormatMark, markAllAsDeleted, markAllAsInserted, cloneNode, createTextNode, type TrackChangeAuthor } from './trackChangeInjector';
export { mergeDocuments, createSimpleMergedDocument } from './mergeDocuments';
export { ExportPreparation, downloadBlob, type ExportPreparationResult } from './exportPreparation';
export { extractEnrichedChanges } from './changeContextExtractor';
export { GroqService } from './groqService';

