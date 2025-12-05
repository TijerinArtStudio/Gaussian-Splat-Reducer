
import React, { useState, useCallback } from 'react';
import { FileInput } from './components/FileInput';
import { Button } from './components/Button';
import { Slider } from './components/Slider';
import { StatusDisplay } from './components/StatusDisplay';
import { Header } from './components/Header';
import { StatsCard } from './components/StatsCard';
import { PlyViewer } from './components/PlyViewer';
import { reduceSplatsInFile } from './services/plyReducer';
import { SparklesIcon, DownloadIcon, ArrowPathIcon, EyedropperIcon } from './components/Icons';
import { ColorWheel } from './components/ColorWheel';

type ProcessStatus = 'idle' | 'loading' | 'calculating' | 'reducing' | 'saving' | 'success' | 'error';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [originalFileBuffer, setOriginalFileBuffer] = useState<ArrayBuffer | null>(null);
  const [reducedFileBuffer, setReducedFileBuffer] = useState<ArrayBuffer | null>(null);
  const [reducedBlob, setReducedBlob] = useState<Blob | null>(null);
  
  // Keys to force remounts
  const [originalKey, setOriginalKey] = useState<number>(0);
  const [reducedKey, setReducedKey] = useState<number>(0);
  
  // Settings
  const [opacityRemoval, setOpacityRemoval] = useState<number>(10);
  const [sizeRemoval, setSizeRemoval] = useState<number>(10);
  const [targetColor, setTargetColor] = useState<string>("#ffffff");
  const [colorThreshold, setColorThreshold] = useState<number>(0); // Default 0 means disabled

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

  const handleEyeDropper = async () => {
    if ('EyeDropper' in window) {
      try {
        // @ts-ignore - EyeDropper API is not yet in all TS definitions
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        setTargetColor(result.sRGBHex);
        if (colorThreshold === 0) setColorThreshold(10); // Auto-enable if it was off
      } catch (e) {
        console.log("EyeDropper closed", e);
      }
    } else {
      alert("Your browser does not support the Eyedropper tool. Please use the color wheel manually.");
    }
  };

  const handleReduce = async () => {
    if (!file) {
      setStatus('error');
      setStatusMessage('Please select a file first.');
      return;
    }

    setIsProcessing(true);
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
        opacityRemoval,
        sizeRemoval,
        targetColor,
        colorThreshold
      };

      const resultBlob = await reduceSplatsInFile(file, options, statusCallback);

      try {
          const buffer = await resultBlob.arrayBuffer();
          setReducedFileBuffer(buffer);
          setReducedBlob(resultBlob);
          setReducedKey(prev => prev + 1);
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
      const originalName = file.name.replace(/\.ply$/i, '');
      a.download = `${originalName}_reduced.ply`;
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
            <div className="lg:col-span-4 space-y-6 flex flex-col h-full">
                
                {/* 1. Upload */}
                <div className="space-y-3">
                  <h2 className="text-lg font-semibold text-cyan-400">1. Upload File</h2>
                  <FileInput onFileSelect={handleFileChange} disabled={isProcessing} />
                </div>

                {/* 2. Reduction Settings */}
                <div className="space-y-4">
                  <h2 className="text-lg font-semibold text-cyan-400">2. Reduction Settings</h2>
                  
                  {/* Smart Reduce Section */}
                  <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-5">
                      <div className="flex items-center space-x-2">
                        <SparklesIcon className="w-4 h-4 text-cyan-400" />
                        <span className="text-sm font-bold text-gray-200">Smart Reduce</span>
                      </div>
                      
                      {/* Opacity Slider */}
                      <div className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                              <span className="text-gray-300">Remove Transparent</span>
                              <span className="text-cyan-400 font-mono">{opacityRemoval}%</span>
                          </div>
                          <Slider
                              value={opacityRemoval}
                              onChange={setOpacityRemoval}
                              disabled={isProcessing}
                          />
                          <p className="text-[10px] text-gray-500">Removes the most transparent splats.</p>
                      </div>

                      {/* Size Slider */}
                      <div className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                              <span className="text-gray-300">Remove Smallest</span>
                              <span className="text-cyan-400 font-mono">{sizeRemoval}%</span>
                          </div>
                          <Slider
                              value={sizeRemoval}
                              onChange={setSizeRemoval}
                              disabled={isProcessing}
                          />
                          <p className="text-[10px] text-gray-500">Removes the tiniest splats.</p>
                      </div>
                  </div>

                  {/* Color Filter Section */}
                  <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-700 space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1">
                           <span className="text-sm font-bold text-gray-200 block">Color Filter</span>
                           <p className="text-[10px] text-gray-500">Remove specific colors.</p>
                        </div>
                        <button 
                            onClick={handleEyeDropper}
                            disabled={isProcessing}
                            className="p-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-md text-cyan-400 transition-colors"
                            title="Pick color from screen"
                        >
                            <EyedropperIcon className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex flex-col items-center">
                          <ColorWheel 
                              color={targetColor}
                              onChange={setTargetColor}
                              tolerance={colorThreshold}
                              disabled={isProcessing}
                          />
                      </div>

                      <div className="space-y-1">
                          <div className="flex justify-between items-center text-xs">
                              <span className="text-gray-300">Tolerance</span>
                              <span className="text-cyan-400 font-mono">{colorThreshold}%</span>
                          </div>
                          <Slider
                              value={colorThreshold}
                              onChange={setColorThreshold}
                              disabled={isProcessing}
                          />
                          <p className="text-[10px] text-gray-500 text-center">
                              {colorThreshold === 0 ? "Filter Disabled" : "Increase to remove more shades"}
                          </p>
                      </div>
                  </div>
                </div>

                {/* 3. Status */}
                <div className="space-y-3">
                   <h2 className="text-lg font-semibold text-cyan-400">3. Status</h2>
                   <StatusDisplay status={status} message={statusMessage} />
                   {(originalCount !== null || reducedCount !== null) && (
                       <div className="grid grid-cols-2 gap-2 mt-2">
                          <StatsCard title="Original" value={originalCount} />
                          <StatsCard title="Reduced" value={reducedCount} />
                       </div>
                   )}
                </div>
                
                {/* Action Buttons Row */}
                <div className="pt-2 mt-auto grid grid-cols-3 gap-2">
                  <Button
                    onClick={handleReduce}
                    disabled={!file || isProcessing}
                    className="w-full px-2"
                    variant="primary"
                    title="Start Reduction"
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
               <div className="flex-1 min-h-[350px] flex flex-col">
                 <h2 className="text-md font-semibold text-gray-400 mb-2">Original Scene</h2>
                 <div className="flex-1 bg-black rounded-xl overflow-hidden shadow-inner border border-gray-700 relative">
                    <PlyViewer key={`orig-${originalKey}`} fileBuffer={originalFileBuffer} />
                 </div>
               </div>

               {/* Reduced Viewer */}
               <div className="flex-1 min-h-[350px] flex flex-col">
                  <h2 className="text-md font-semibold text-cyan-400 mb-2">
                      Reduced Scene {reducedCount ? `(${Math.round((reducedCount/ (originalCount || 1)) * 100)}% splats remaining)` : '(Preview)'}
                  </h2>
                  <div className="flex-1 bg-black rounded-xl overflow-hidden shadow-inner border border-gray-700 relative">
                     {reducedFileBuffer ? (
                         <PlyViewer key={`red-${reducedKey}`} fileBuffer={reducedFileBuffer} />
                     ) : (
                         <div className="w-full h-full flex items-center justify-center text-gray-500 bg-gray-900/20">
                             {isProcessing ? (
                                 <span className="animate-pulse">Processing...</span>
                             ) : (
                                 <span>Result will appear here</span>
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
