import React, { useState } from 'react';
import { Header } from './components/Header';
import { StatsCard } from './components/StatsCard';
import { StatusDisplay } from './components/StatusDisplay';
import { AlphaDeleter } from './components/AlphaDeleter';
import { Reducer } from './components/Reducer';
import { reduceSplatsInFile, reduceSplatsByProperties, getVertexCount } from './services/plyReducer';
import { FileInput } from './components/FileInput';
import { Button } from './components/Button';
import { DownloadIcon } from './components/Icons';

type ProcessStatus = 'idle' | 'loading' | 'calculating' | 'reducing' | 'saving' | 'success' | 'error';

export default function App() {
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Upload a .ply file to get started.');
  const [originalCount, setOriginalCount] = useState<number | null>(null);
  const [reducedCount, setReducedCount] = useState<number | null>(null);

  const [currentFile, setCurrentFile] = useState<File | Blob | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);

  const statusCallback = (
      newStatus: ProcessStatus, 
      message: string, 
      counts?: { original: number, reduced: number }
  ) => {
    setStatus(newStatus);
    setStatusMessage(message);
    if (counts?.original !== undefined) setOriginalCount(counts.original);
    if (counts?.reduced !== undefined) setReducedCount(counts.reduced);
  };

  const handleFileSelect = (file: File) => {
      setCurrentFile(file);
      setCurrentFileName(file.name);
      setStatus('idle');
      setStatusMessage('File loaded. Choose an operation below.');
      setOriginalCount(null);
      setReducedCount(null);
  }

  const handleReset = () => {
      setCurrentFile(null);
      setCurrentFileName(null);
      setStatus('idle');
      setStatusMessage('Upload a .ply file to get started.');
      setOriginalCount(null);
      setReducedCount(null);
      setIsProcessing(false);
  }
  
  const generateNewFileName = (baseName: string, suffix: string): string => {
      const nameWithoutExt = baseName.replace(/\.ply$/i, '');
      return `${nameWithoutExt}${suffix}.ply`;
  };

  const handleAlphaDelete = async (targetColor: string, colorTolerance: number) => {
    if (!currentFile || !currentFileName) {
      statusCallback('error', 'No file selected.');
      return;
    }
    setIsProcessing(true);
    
    try {
      const initialCount = await getVertexCount(currentFile);
      setOriginalCount(initialCount);
      setReducedCount(null);

      const reducedPlyBlob = await reduceSplatsInFile(currentFile, targetColor, colorTolerance, statusCallback);
      
      const newName = generateNewFileName(currentFileName, '_color_deleted');
      // downloadFile(reducedPlyBlob, newName); // <-- REMOVED AUTOMATIC DOWNLOAD
      setCurrentFile(reducedPlyBlob);
      setCurrentFileName(newName);
      
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      statusCallback('error', `Error: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReduce = async (opacityThreshold: number, scaleThreshold: number) => {
    if (!currentFile || !currentFileName) {
      statusCallback('error', 'No file selected.');
      return;
    }
    setIsProcessing(true);

    try {
      const initialCount = await getVertexCount(currentFile);
      setOriginalCount(initialCount);
      setReducedCount(null);

      const reducedPlyBlob = await reduceSplatsByProperties(currentFile, opacityThreshold, scaleThreshold, statusCallback);
      
      const newName = generateNewFileName(currentFileName, '_reduced');
      // downloadFile(reducedPlyBlob, newName); // <-- REMOVED AUTOMATIC DOWNLOAD
      setCurrentFile(reducedPlyBlob);
      setCurrentFileName(newName);

    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      statusCallback('error', `Error: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };
  
  const downloadFile = (blob: Blob, fileName: string) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  }

  const handleDownload = () => {
    if (currentFile && currentFileName && status === 'success') {
      downloadFile(currentFile, currentFileName);
    }
  }

  const toolsDisabled = isProcessing || !currentFile;

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-7xl mx-auto">
        <Header />

        <div className="bg-gray-800/50 rounded-2xl shadow-2xl p-6 sm:p-8 mb-8 backdrop-blur-sm border border-gray-700 max-w-3xl mx-auto">
          <h2 className="text-xl font-semibold text-cyan-400 mb-4">1. Upload Your File</h2>
          <FileInput 
            onFileSelect={handleFileSelect} 
            onClear={handleReset}
            fileName={currentFileName}
            disabled={isProcessing}
           />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <Reducer onProcess={handleReduce} disabled={toolsDisabled} />
            <AlphaDeleter onProcess={handleAlphaDelete} disabled={toolsDisabled} />
        </div>

        <div className="mt-8">
            <div className="bg-gray-800/50 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 backdrop-blur-sm border border-gray-700 max-w-3xl mx-auto">
              <h2 className="text-xl font-semibold text-cyan-400 text-center">3. Results</h2>
              <StatusDisplay status={status} message={statusMessage} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <StatsCard title="Original Splats (Current Step)" value={originalCount} />
                  <StatsCard title="Remaining Splats" value={reducedCount} />
              </div>
              {status === 'success' && (
                <div className="flex justify-center pt-4">
                  <Button onClick={handleDownload} disabled={isProcessing}>
                    <DownloadIcon className="w-5 h-5 mr-2" />
                    Download Result
                  </Button>
                </div>
              )}
            </div>
        </div>
      </div>
    </div>
  );
}