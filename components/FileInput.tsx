import React, { useState, useRef, useCallback } from 'react';
import { UploadIcon } from './Icons';

interface FileInputProps {
  onFileSelect: (file: File | null) => void;
  disabled?: boolean;
}

export const FileInput: React.FC<FileInputProps> = ({ onFileSelect, disabled }) => {
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((file: File | null) => {
    if (file && file.name.toLowerCase().endsWith('.ply')) {
      setFileName(file.name);
      onFileSelect(file);
    } else {
      setFileName('Invalid file type. Please select a .ply file.');
      onFileSelect(null);
    }
  }, [onFileSelect]);

  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
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
          {fileName ? (
             <p className="font-semibold text-gray-300">{fileName}</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-gray-400">
                <span className="font-semibold text-cyan-400">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500">Gaussian Splatting .PLY file</p>
            </>
          )}
        </div>
        <input ref={fileInputRef} id="file-upload" type="file" className="hidden" onChange={handleChange} accept=".ply" disabled={disabled} />
      </label>
    </div>
  );
};