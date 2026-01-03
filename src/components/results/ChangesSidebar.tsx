'use client';

/**
 * Changes Sidebar Component
 * Displays a list of individual changes with details.
 */

import type { ChangeSet } from '@/lib/types';

interface ChangesSidebarProps {
  changeSet: ChangeSet;
  className?: string;
}

export function ChangesSidebar({ changeSet, className = '' }: ChangesSidebarProps) {
  const { textChanges, formatChanges, paragraphChanges } = changeSet;

  // Combine and sort all changes
  const allChanges: ChangeItem[] = [
    ...textChanges.map((c, i) => ({
      id: `text-${i}`,
      type: c.type as 'insert' | 'delete',
      category: 'text' as const,
      text: c.text,
      paragraphIndex: c.paragraphIndex,
    })),
    ...formatChanges.map((c, i) => ({
      id: `format-${i}`,
      type: 'format' as const,
      category: 'format' as const,
      text: c.text,
      paragraphIndex: c.paragraphIndex,
      addMarks: c.addMarks.map((m) => m.type).join(', '),
      removeMarks: c.removeMarks.map((m) => m.type).join(', '),
    })),
    ...paragraphChanges.map((c, i) => ({
      id: `para-${i}`,
      type: c.type,
      category: 'paragraph' as const,
      text: c.paragraph.textContent.slice(0, 50) + (c.paragraph.textContent.length > 50 ? '...' : ''),
      paragraphIndex: c.paragraph.index,
    })),
  ].sort((a, b) => a.paragraphIndex - b.paragraphIndex);

  return (
    <div className={`bg-white border-l border-gray-200 h-full overflow-hidden flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">Changes</h2>
        <p className="text-sm text-gray-500 mt-1">
          {allChanges.length} change{allChanges.length !== 1 ? 's' : ''} detected
        </p>
      </div>

      {/* Changes list */}
      <div className="flex-1 overflow-y-auto">
        {allChanges.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {allChanges.map((change) => (
              <ChangeItemDisplay key={change.id} change={change} />
            ))}
          </div>
        ) : (
          <div className="p-4 text-center text-gray-500">
            <p>No changes detected</p>
          </div>
        )}
      </div>
    </div>
  );
}

interface ChangeItem {
  id: string;
  type: 'insert' | 'delete' | 'format';
  category: 'text' | 'format' | 'paragraph';
  text: string;
  paragraphIndex: number;
  addMarks?: string;
  removeMarks?: string;
}

function ChangeItemDisplay({ change }: { change: ChangeItem }) {
  const getIcon = () => {
    switch (change.type) {
      case 'insert':
        return (
          <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          </div>
        );
      case 'delete':
        return (
          <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
            </svg>
          </div>
        );
      case 'format':
        return (
          <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center">
            <svg className="w-4 h-4 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </div>
        );
    }
  };

  const getLabel = () => {
    if (change.category === 'paragraph') {
      return change.type === 'insert' ? 'New paragraph' : 'Deleted paragraph';
    }
    if (change.type === 'format') {
      const parts = [];
      if (change.addMarks) parts.push(`Added: ${change.addMarks}`);
      if (change.removeMarks) parts.push(`Removed: ${change.removeMarks}`);
      return parts.join('; ') || 'Format change';
    }
    return change.type === 'insert' ? 'Inserted' : 'Deleted';
  };

  const getTextClass = () => {
    switch (change.type) {
      case 'insert':
        return 'text-green-700 bg-green-50';
      case 'delete':
        return 'text-red-700 bg-red-50 line-through';
      case 'format':
        return 'text-yellow-700 bg-yellow-50';
    }
  };

  return (
    <div className="p-3 hover:bg-gray-50 cursor-pointer">
      <div className="flex items-start gap-3">
        {getIcon()}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {getLabel()}
          </p>
          <p className={`mt-1 text-sm rounded px-1.5 py-0.5 inline-block ${getTextClass()}`}>
            {change.text.slice(0, 100)}
            {change.text.length > 100 ? '...' : ''}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Paragraph {change.paragraphIndex + 1}
          </p>
        </div>
      </div>
    </div>
  );
}

