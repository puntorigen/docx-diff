'use client';

/**
 * DOCX Uploader Component
 * Drag-and-drop file upload zone.
 */

import { useCallback, useState } from 'react';
import Image from 'next/image';

// Brand colors
const BRAND = {
  primary: '#007ACC',
  secondary: '#005B9C',
  accent: '#E8F0F8',
};

interface DocxUploaderProps {
  onFileSelect: (file: File) => void;
  label?: string;
  disabled?: boolean;
}

export function DocxUploader({
  onFileSelect,
  label = 'Drag and drop or upload DOCX',
  disabled = false,
}: DocxUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (disabled) return;

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (
          file.type ===
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          file.name.endsWith('.docx')
        ) {
          onFileSelect(file);
        } else {
          alert('Please upload a DOCX file');
        }
      }
    },
    [onFileSelect, disabled]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;

      const files = e.target.files;
      if (files && files.length > 0) {
        onFileSelect(files[0]);
      }
    },
    [onFileSelect, disabled]
  );

  return (
    <div
      className={`
        relative flex flex-col items-center justify-center
        w-full max-w-2xl h-64
        border-2 border-dashed rounded-xl
        transition-all duration-200
        ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
      `}
      style={{
        borderColor: isDragging ? BRAND.primary : '#d1d5db',
        backgroundColor: isDragging ? BRAND.accent : '#f9fafb',
      }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => {
        if (!disabled) {
          document.getElementById('docx-file-input')?.click();
        }
      }}
      onMouseEnter={(e) => {
        if (!disabled && !isDragging) {
          e.currentTarget.style.borderColor = BRAND.primary;
          e.currentTarget.style.backgroundColor = BRAND.accent;
        }
      }}
      onMouseLeave={(e) => {
        if (!isDragging) {
          e.currentTarget.style.borderColor = '#d1d5db';
          e.currentTarget.style.backgroundColor = '#f9fafb';
        }
      }}
    >
      {/* Logo Icon */}
      <div className="mb-4">
        <Image
          src="/logo.png"
          alt="Upload"
          width={64}
          height={64}
          className="w-16 h-16 rounded-lg"
        />
      </div>

      {/* Label */}
      <p className="text-lg font-medium mb-2" style={{ color: BRAND.secondary }}>{label}</p>
      <p className="text-sm text-gray-500">DOCX files only</p>

      {/* Hidden file input */}
      <input
        id="docx-file-input"
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={handleFileInput}
        disabled={disabled}
      />
    </div>
  );
}

