
import React, { useState, useCallback } from 'react';
import { FileInput } from './components/FileInput';
import { Button } from './components/Button';
import { Slider } from './components/Slider';
import { StatusDisplay } from './components/StatusDisplay';
import { Header } from './components/Header';
import { StatsCard } from './components/StatsCard';
import { reduceSplatsInFile } from './services/plyReducer';
import { DownloadIcon, SparklesIcon } from './components/Icons';

type ProcessStatus = 'idle' | 'loading' | 'calculating' | 'reducing' | 'saving' | 'success' | 'error';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [percentage, setPercentage] = useState<number>(30);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Upload a .ply file to get started.');
  const [originalCount, setOriginalCount] = useState<number | null>(null);
  const [reducedCount, setReducedCount] = useState<number | null>(null);

  const handleFileChange = useCallback((selectedFile: File | null) => {
    if (selectedFile) {
      setFile(selectedFile);
      setStatus('idle');
      setStatusMessage(`Selected file: ${selectedFile.name}`);
      setOriginalCount(null);
      setReducedCount(null);
    }
  }, []);

  const handleProcess = async () => {
    if (!file) {
      setStatus('error');
      setStatusMessage('Please select a file first.');
      return;
    }

    setIsProcessing(true);
    
    const statusCallback = (
        newStatus: ProcessStatus, 
        message: string, 
        counts?: { original: number, reduced: number }
    ) => {
      setStatus(newStatus);
      setStatusMessage(message);
      if (counts?.original) setOriginalCount(counts.original);
      if (counts?.reduced) setReducedCount(counts.reduced);
    };

    try {
      const reducedPlyBlob = await reduceSplatsInFile(file, percentage, statusCallback);

      const url = URL.createObjectURL(reducedPlyBlob);
      const a = document.createElement('a');
      a.href = url;
      const originalName = file.name.replace(/\.ply$/i, '');
      a.download = `${originalName}_reduced_${percentage}p.ply`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      statusCallback('error', `Error: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-2xl mx-auto">
        <Header />

        <main className="bg-gray-800/50 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-8 backdrop-blur-sm border border-gray-700">
          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-cyan-400">1. Upload File</h2>
            <FileInput onFileSelect={handleFileChange} disabled={isProcessing} />
          </div>

          <div className="space-y-4">
            <h2 className="text-xl font-semibold text-cyan-400">2. Set Reduction Percentage</h2>
            <Slider
              value={percentage}
              onChange={setPercentage}
              disabled={isProcessing}
            />
          </div>
          
          <div className="flex justify-center pt-4">
            <Button
              onClick={handleProcess}
              disabled={!file || isProcessing}
            >
              <SparklesIcon className="w-5 h-5 mr-2" />
              {isProcessing ? 'Processing...' : 'Reduce Splats'}
            </Button>
          </div>

          <div className="pt-4 space-y-4">
             <h2 className="text-xl font-semibold text-cyan-400">3. Results</h2>
             <StatusDisplay status={status} message={statusMessage} />
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <StatsCard title="Original Splats" value={originalCount} />
                <StatsCard title="Splats After Reduction" value={reducedCount} />
             </div>
          </div>
        </main>
      </div>
    </div>
  );
}
