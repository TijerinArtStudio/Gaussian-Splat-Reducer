
import React, { useState, useCallback } from 'react';
import { FileInput } from './components/FileInput';
import { Button } from './components/Button';
import { Slider } from './components/Slider';
import { StatusDisplay } from './components/StatusDisplay';
import { Header } from './components/Header';
import { StatsCard } from './components/StatsCard';
import { PlyViewer } from './components/PlyViewer';
import { reduceSplatsInFile } from './services/plyReducer';
import { SparklesIcon, DownloadIcon, ArrowPathIcon } from './components/Icons';
import { ColorWheel } from './components/ColorWheel';

type ProcessStatus = 'idle' | 'loading' | 'calculating' | 'reducing' | 'saving' | 'success' | 'error';
type ReductionMode = 'standard' | 'color';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [originalFileBuffer, setOriginalFileBuffer] = useState<ArrayBuffer | null>(null);
  const [reducedFileBuffer, setReducedFileBuffer] = useState<ArrayBuffer | null>(null);
  const [reducedBlob, setReducedBlob] = useState<Blob | null>(null);
  
  // Keys to force remounts
  const [originalKey, setOriginalKey] = useState<number>(0);
  const [reducedKey, setReducedKey] = useState<number>(0);
  
  // Settings
  const [mode, setMode] = useState<ReductionMode>('standard');
  const [percentage, setPercentage] = useState<number>(30);
  const [targetColor, setTargetColor] = useState<string>("#ffffff");
  const [colorThreshold, setColorThreshold] = useState<number>(20);

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Upload a .ply file to get started.');
  const [originalCount, setOriginalCount] = useState<number | null>(null);
  const [reducedCount, setReducedCount] = useState<number | null>(null);

  const handleFileChange = useCallback(async (selectedFile: File | null) => {
    setFile(selectedFile);
    setReducedFileBuffer(null);
    setReducedBlob(null);
    setOriginalCount(null);
    setReducedCount(null);
    setOriginalFileBuffer(null);
    setOriginalKey(prev => prev + 1);

    if (selectedFile) {
      setStatus('idle');
      setStatusMessage(`Selected file: ${selectedFile.name}. Ready to process.`);
      try {
        const buffer = await selectedFile.arrayBuffer();
        setOriginalFileBuffer(buffer);
        setOriginalKey(prev => prev + 1);
      } catch (error) {
        console.error("Error reading file:", error);
        setStatus('error');
        setStatusMessage('Error: Could not read the selected file.');
        setOriginalFileBuffer(null);
      }
    } else {
        setStatus('idle');
        setStatusMessage('Upload a .ply file to get started.');
    }
  }, []);

  const handleReset = () => {
      setFile(null);
      setOriginalFileBuffer(null);
      setReducedFileBuffer(null);
      setReducedBlob(null);
      setOriginalCount(null);
      setReducedCount(null);
      setStatus('idle');
      setStatusMessage('Upload a .ply file to get started.');
      setIsProcessing(false);
      setOriginalKey(prev => prev + 1);
      setReducedKey(prev => prev + 1);
  };

  const handleReduce = async () => {
    if (!file) {
      setStatus('error');
      setStatusMessage('Please select a file first.');
      return;
    }

    setIsProcessing(true);
    // Do not clear the original viewer
    setReducedFileBuffer(null);
    setReducedBlob(null);
    
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
      const options = {
        mode,
        percentage,
        targetColor,
        colorThreshold
      };

      const resultBlob = await reduceSplatsInFile(file, options, statusCallback);

      try {
          const buffer = await resultBlob.arrayBuffer();
          setReducedFileBuffer(buffer);
          setReducedBlob(resultBlob);
          setReducedKey(prev => prev + 1); // Force mount of reduced viewer
          statusCallback('success', 'Reduction complete! Ready to download.');
      } catch (e) {
          statusCallback('error', 'Could not display the reduced file preview.');
      }
      
    } catch (error) {
      console.error(error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
      statusCallback('error', `Error: ${errorMessage}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = () => {
      if (!reducedBlob || !file) return;
      const url = URL.createObjectURL(reducedBlob);
      const a = document.createElement('a');
      a.href = url;
      const modeSuffix = mode === 'standard' ? `_${percentage}p` : `_color`;
      const originalName = file.name.replace(/\.ply$/i, '');
      a.download = `${originalName}_reduced${modeSuffix}.ply`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="w-full max-w-7xl mx-auto">
        <Header />

        <main className="bg-gray-800/50 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-8 backdrop-blur-sm border border-gray-700">
          
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* Left Column: Controls (4 columns) */}
            <div className="lg:col-span-4 space-y-8 flex flex-col h-full">
                <div className="space-y-4">
                  <h2 className="text-xl font-semibold text-cyan-400">1. Upload File</h2>
                  <FileInput onFileSelect={handleFileChange} disabled={isProcessing} />
                </div>

                <div className="space-y-4">
                  <h2 className="text-xl font-semibold text-cyan-400">2. Reduction Settings</h2>
                  
                  {/* Mode Toggles */}
                  <div className="flex p-1 bg-gray-900 rounded-lg">
                      <button 
                        onClick={() => setMode('standard')}
                        disabled={isProcessing}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'standard' ? 'bg-cyan-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                      >
                        Smart Reduce
                      </button>
                      <button 
                        onClick={() => setMode('color')}
                        disabled={isProcessing}
                        className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${mode === 'color' ? 'bg-cyan-600 text-white shadow' : 'text-gray-400 hover:text-white'}`}
                      >
                        Color Filter
                      </button>
                  </div>

                  {mode === 'standard' ? (
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-4">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-300">Reduction Percentage</span>
                        </div>
                        <Slider
                            value={percentage}
                            onChange={setPercentage}
                            disabled={isProcessing}
                        />
                        <p className="text-xs text-gray-500">
                            Higher % = smaller file size, lower quality.
                        </p>
                    </div>
                  ) : (
                    <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-6">
                        <div className="flex flex-col items-center space-y-2">
                            <label className="text-sm font-medium text-gray-300">Target Color to Remove</label>
                            <ColorWheel 
                                color={targetColor}
                                onChange={setTargetColor}
                                tolerance={colorThreshold}
                                disabled={isProcessing}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm text-gray-300">Tolerance Range ({colorThreshold}%)</label>
                            <Slider
                                value={colorThreshold}
                                onChange={setColorThreshold}
                                disabled={isProcessing}
                            />
                            <p className="text-xs text-center text-gray-500">
                                Adjust circle size to include more shades.
                            </p>
                        </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                   <h2 className="text-xl font-semibold text-cyan-400">3. Status</h2>
                   <StatusDisplay status={status} message={statusMessage} />
                   {(originalCount !== null || reducedCount !== null) && (
                       <div className="grid grid-cols-2 gap-2 mt-2">
                          <StatsCard title="Original" value={originalCount} />
                          <StatsCard title="Reduced" value={reducedCount} />
                       </div>
                   )}
                </div>
                
                {/* Action Buttons Row */}
                <div className="pt-4 mt-auto grid grid-cols-3 gap-2">
                  <Button
                    onClick={handleReduce}
                    disabled={!file || isProcessing}
                    className="w-full px-2"
                    variant="primary"
                    title="Preview Reduction"
                  >
                    <SparklesIcon className="w-5 h-5" />
                  </Button>
                  
                  <Button
                    onClick={handleDownload}
                    disabled={!reducedBlob || isProcessing}
                    className="w-full px-2"
                    variant="secondary"
                    title="Download Result"
                  >
                    <DownloadIcon className="w-5 h-5" />
                  </Button>

                  <Button
                    onClick={handleReset}
                    disabled={isProcessing}
                    className="w-full px-2"
                    variant="danger"
                    title="Reset App"
                  >
                    <ArrowPathIcon className="w-5 h-5" />
                  </Button>
                </div>
            </div>
            
            {/* Right Column: Two Viewers (Original Top, Reduced Bottom) */}
            <div className="lg:col-span-8 flex flex-col gap-6">
               
               {/* Original Viewer */}
               <div className="flex-1 min-h-[400px] flex flex-col">
                 <h2 className="text-lg font-semibold text-gray-300 mb-2">Original Scene</h2>
                 <div className="flex-1 bg-black rounded-xl overflow-hidden shadow-inner border border-gray-700 relative">
                    <PlyViewer key={`orig-${originalKey}`} fileBuffer={originalFileBuffer} />
                 </div>
               </div>

               {/* Reduced Viewer (Only visible if processing done) */}
               <div className="flex-1 min-h-[400px] flex flex-col">
                  <h2 className="text-lg font-semibold text-cyan-400 mb-2">
                      Reduced Scene {reducedCount ? `(${Math.round((reducedCount/ (originalCount || 1)) * 100)}% splats)` : '(Preview)'}
                  </h2>
                  <div className="flex-1 bg-black rounded-xl overflow-hidden shadow-inner border border-gray-700 relative">
                     {reducedFileBuffer ? (
                         <PlyViewer key={`red-${reducedKey}`} fileBuffer={reducedFileBuffer} />
                     ) : (
                         <div className="w-full h-full flex items-center justify-center text-gray-500">
                             {isProcessing ? (
                                 <span className="animate-pulse">Processing...</span>
                             ) : (
                                 <span>Result will appear here after reduction</span>
                             )}
                         </div>
                     )}
                  </div>
               </div>

            </div>

          </div>

        </main>
      </div>
    </div>
  );
}
