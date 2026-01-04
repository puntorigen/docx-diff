'use client';

/**
 * Header Component
 * App header with title, file info, and actions.
 */

interface HeaderProps {
  onUploadNewVersion?: () => void;
  showUploadButton?: boolean;
  onDownload?: () => void;
  showDownloadButton?: boolean;
  onReset?: () => void;
  v1FileName?: string;
  v2FileName?: string;
  changeCount?: number;
}

export function Header({
  onUploadNewVersion,
  showUploadButton = false,
  onDownload,
  showDownloadButton = false,
  onReset,
  v1FileName,
  v2FileName,
  changeCount,
}: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 flex-shrink-0">
      {/* Main header row */}
      <div className="px-6 py-3 flex items-center justify-between">
        {/* Logo and title - clickable to reset */}
        <button
          onClick={onReset}
          className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity"
          title="Start over"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="DocX Diff"
            width={36}
            height={36}
            className="w-9 h-9 rounded"
          />
          <h1 className="text-xl font-bold" style={{ color: '#005B9C' }}>
            Doc<span style={{ color: '#007ACC' }}>X</span> Diff
          </h1>
        </button>

        {/* Actions */}
        <div className="flex items-center gap-3">
          {onReset && (
            <button
              onClick={onReset}
              className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors cursor-pointer"
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

          {showUploadButton && onUploadNewVersion && (
            <button
              onClick={onUploadNewVersion}
              className="inline-flex items-center px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors cursor-pointer"
              style={{ backgroundColor: '#007ACC' }}
              onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#005B9C'}
              onMouseLeave={(e) => e.currentTarget.style.backgroundColor = '#007ACC'}
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
              Compare with...
            </button>
          )}

          {showDownloadButton && onDownload && (
            <button
              onClick={onDownload}
              className="inline-flex items-center px-4 py-2 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors cursor-pointer"
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
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Download DOCX
            </button>
          )}
        </div>
      </div>

      {/* File info row - only shown when we have a file */}
      {v1FileName && (
        <div className="px-6 py-2 border-t border-gray-100" style={{ backgroundColor: '#F8FAFC' }}>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-gray-400">📄</span>
            <span className="font-medium" style={{ color: '#005B9C' }}>Original:</span>
            <span style={{ color: '#007ACC' }}>{v1FileName}</span>
            
            {v2FileName && (
              <>
                <span className="text-gray-300 mx-2">→</span>
                <span className="font-medium" style={{ color: '#005B9C' }}>Compared with:</span>
                <span style={{ color: '#007ACC' }}>{v2FileName}</span>
                {changeCount !== undefined && changeCount > 0 && (
                  <span className="text-gray-500 ml-2">
                    • {changeCount} change{changeCount !== 1 ? 's' : ''} found
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

