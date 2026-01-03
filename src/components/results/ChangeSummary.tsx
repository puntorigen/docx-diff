'use client';

/**
 * Change Summary Component
 * Displays a summary of detected changes.
 */

import type { ChangeSummary as ChangeSummaryType } from '@/lib/types';

interface ChangeSummaryProps {
  summary: ChangeSummaryType;
  className?: string;
}

export function ChangeSummary({ summary, className = '' }: ChangeSummaryProps) {
  return (
    <div className={`bg-blue-50 border border-blue-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-start gap-3">
        {/* Icon */}
        <div className="flex-shrink-0 mt-0.5">
          <svg
            className="w-5 h-5 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="font-medium text-gray-900 mb-2">
            Changes in the new version include:
          </h3>

          {summary.highlights.length > 0 ? (
            <ul className="space-y-1">
              {summary.highlights.map((highlight, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-sm text-gray-700"
                >
                  <span className="text-blue-500 mt-1">•</span>
                  <span>{highlight}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-gray-600">No significant changes detected</p>
          )}

          {/* Stats */}
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-blue-200">
            <StatBadge
              label="Total changes"
              value={summary.totalChanges}
              color="gray"
            />
            {summary.insertions > 0 && (
              <StatBadge
                label="Insertions"
                value={summary.insertions}
                color="green"
              />
            )}
            {summary.deletions > 0 && (
              <StatBadge
                label="Deletions"
                value={summary.deletions}
                color="red"
              />
            )}
            {summary.formatChanges > 0 && (
              <StatBadge
                label="Format changes"
                value={summary.formatChanges}
                color="yellow"
              />
            )}
          </div>
        </div>

        {/* Close button placeholder */}
        <button className="flex-shrink-0 text-gray-400 hover:text-gray-600">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

interface StatBadgeProps {
  label: string;
  value: number;
  color: 'gray' | 'green' | 'red' | 'yellow';
}

function StatBadge({ label, value, color }: StatBadgeProps) {
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    yellow: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colorClasses[color]}`}>
      {label}: {value}
    </span>
  );
}

