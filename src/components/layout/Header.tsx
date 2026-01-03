'use client';

/**
 * Header Component
 * App header with title and actions.
 */

interface HeaderProps {
  onUploadNewVersion?: () => void;
  showUploadButton?: boolean;
  onReset?: () => void;
}

export function Header({
  onUploadNewVersion,
  showUploadButton = false,
  onReset,
}: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Logo and title */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xl">📝</span>
            <span className="text-xl">💬</span>
            <span className="text-xl">✏️</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">
            DOCX Comparison Engine
          </h1>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {showUploadButton && onUploadNewVersion && (
            <button
              onClick={onUploadNewVersion}
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Upload new version
            </button>
          )}

          {onReset && (
            <button
              onClick={onReset}
              className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
            >
              <svg
                className="w-4 h-4 mr-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Start over
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

