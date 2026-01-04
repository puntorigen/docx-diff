'use client';

/**
 * Footer Component
 * App footer with copyright notice.
 */

export function Footer() {
  const currentYear = new Date().getFullYear();
  
  return (
    <footer className="bg-white border-t border-gray-200 py-4 px-6 flex-shrink-0">
      <div className="flex items-center justify-center gap-1 text-sm text-gray-500">
        <span>©</span>
        <span>{currentYear}</span>
        <a
          href="https://www.pabloschaffner.com"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium transition-colors hover:underline"
          style={{ color: '#007ACC' }}
        >
          pabloschaffner.com
        </a>
        <span>–</span>
        <span>All rights reserved</span>
      </div>
    </footer>
  );
}

