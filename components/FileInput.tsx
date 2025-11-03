import React, { useState, useRef, useCallback } from 'react';
import { UploadIcon } from './Icons';
import { Button } from './Button';

interface FileInputProps {
  onFileSelect: (file: File) => void;
  onClear: () => void;
  fileName: string | null;
  disabled?: boolean;
}

export const FileInput: React.FC<FileInputProps> = ({ onFileSelect, onClear, fileName, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File | null) => {
    if (file && file.name.toLowerCase().endsWith('.ply')) {
      onFileSelect(file);
    } else {
      // Simple alert for now, could be a more elegant notification
      alert('Invalid file type. Please select a .ply file.');
    }
  }, [onFileSelect]);

  const handleDragEnter = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFile(e.target.files[0]);
    }
  };

  if (fileName) {
    return (
      <div className="flex flex-col sm:flex-row items-center justify-between w-full h-auto sm:h-20 px-4 py-3 bg-gray-900 rounded-lg border border-gray-600">
        <div className="text-center sm:text-left mb-3 sm:mb-0">
          <p className="text-sm text-gray-400">Current File:</p>
          <p className="font-semibold text-gray-200 truncate" title={fileName}>{fileName}</p>
        </div>
        <Button onClick={onClear} disabled={disabled} >
            Start Over
        </Button>
      </div>
    );
  }

  return (
    <div>
      <label
        htmlFor="file-upload"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center w-full h-32 px-4 transition-all duration-300 bg-gray-900 border-2 border-dashed rounded-lg cursor-pointer  hover:border-cyan-400
        ${isDragging ? 'border-cyan-400 scale-105' : 'border-gray-600'}
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
          <UploadIcon className="w-8 h-8 mb-2 text-gray-400"/>
          <p className="mb-2 text-sm text-gray-400">
            <span className="font-semibold text-cyan-400">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-500">Gaussian Splatting .PLY file</p>
        </div>
        <input ref={fileInputRef} id="file-upload" type="file" className="hidden" onChange={handleChange} accept=".ply" disabled={disabled} />
      </label>
    </div>
  );
};