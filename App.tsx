
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { FileInput } from './components/FileInput';
import { Button } from './components/Button';
import { Slider } from './components/Slider';
import { StatusDisplay } from './components/StatusDisplay';
import { Header } from './components/Header';
import { StatsCard } from './components/StatsCard';
import { PlyViewer } from './components/PlyViewer';
import { reduceSplatsInFile, analyzeFile } from './services/plyReducer';
import { SparklesIcon, DownloadIcon, ArrowPathIcon, EyedropperIcon } from './components/Icons';
import { ColorWheel } from './components/ColorWheel';

type ProcessStatus = 'idle' | 'loading' | 'calculating' | 'reducing' | 'saving' | 'success' | 'error';

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  
  // Buffers
  const [originalFileBuffer, setOriginalFileBuffer] = useState<ArrayBuffer | null>(null);
  // resultViewBuffer controls what shows in the "Optimized Result" window.
  // Initially = Original Buffer. After processing = Reduced Buffer.
  const [resultViewBuffer, setResultViewBuffer] = useState<ArrayBuffer | null>(null);
  
  const [reducedBlob, setReducedBlob] = useState<Blob | null>(null);
  
  // Data Analysis for Percentiles
  const [analysisData, setAnalysisData] = useState<{ opacities: Float32Array, volumes: Float32Array } | null>(null);

  // Logger (console only now)
  const addLog = useCallback((msg: string) => {
      console.log(`[App] ${msg}`);
  }, []);
  
  // Keys to force remounts
  const [originalKey, setOriginalKey] = useState<number>(0);
  const [reducedKey, setReducedKey] = useState<number>(0);
  
  // Settings
  const [opacityRemoval, setOpacityRemoval] = useState<number>(10);
  const [sizeRemoval, setSizeRemoval] = useState<number>(10);
  const [targetColor, setTargetColor] = useState<string>("#ffffff");
  const [colorThreshold, setColorThreshold] = useState<number>(0); // Default 0 means disabled

  // State for manually protected splats (indices)
  const [protectedIndices, setProtectedIndices] = useState<Set<number>>(new Set());

  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [status, setStatus] = useState<ProcessStatus>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('Upload a .ply file to get started.');
  const [originalCount, setOriginalCount] = useState<number | null>(null);
  const [reducedCount, setReducedCount] = useState<number | null>(null);

  // Calculate ACTUAL thresholds based on distribution to send to the Live Viewer
  const reductionSettings = useMemo(() => {
    let opacityThreshold = -1.0; // Default matches nothing
    let sizeThreshold = -1.0;

    if (analysisData) {
        if (opacityRemoval > 0) {
            const idx = Math.floor(analysisData.opacities.length * (opacityRemoval / 100));
            // Clamp index
            const safeIdx = Math.min(Math.max(idx, 0), analysisData.opacities.length - 1);
            opacityThreshold = analysisData.opacities[safeIdx];
        }
        if (sizeRemoval > 0) {
            const idx = Math.floor(analysisData.volumes.length * (sizeRemoval / 100));
            const safeIdx = Math.min(Math.max(idx, 0), analysisData.volumes.length - 1);
            sizeThreshold = analysisData.volumes[safeIdx];
        }
    }

    return {
        opacityThreshold,
        sizeThreshold,
        targetColor,
        colorThreshold
    };
  }, [opacityRemoval, sizeRemoval, targetColor, colorThreshold, analysisData]);

  const handleFileChange = useCallback(async (selectedFile: File | null) => {
    setFile(selectedFile);
    // Reset buffers
    setOriginalFileBuffer(null);
    setResultViewBuffer(null);
    setReducedBlob(null);
    setAnalysisData(null);
    
    setOriginalCount(null);
    setReducedCount(null);
    setProtectedIndices(new Set()); // Reset protections on new file
    setOriginalKey(prev => prev + 1);

    if (selectedFile) {
      addLog(`File selected: ${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`);
      setStatus('idle');
      setStatusMessage(`Selected file: ${selectedFile.name}. Loading...`);
      try {
        const buffer = await selectedFile.arrayBuffer();
        addLog(`File loaded into buffer. Bytes: ${buffer.byteLength}`);
        
        // Show original immediately in both views
        setOriginalFileBuffer(buffer);
        setResultViewBuffer(buffer); 
        
        setOriginalKey(prev => prev + 1);
        setReducedKey(prev => prev + 1);
        setStatusMessage(`Analyzing file statistics...`);

        // Trigger Analysis
        analyzeFile(selectedFile).then(data => {
            setAnalysisData(data);
            setOriginalCount(data.opacities.length);
            setStatusMessage(`Ready. Found ${data.opacities.length.toLocaleString()} splats.`);
            addLog(`Analysis complete. Opacity/Volume data available.`);
        }).catch(e => {
            console.error(e);
            setStatusMessage(`Error analyzing file statistics.`);
        });

      } catch (error) {
        console.error("Error reading file:", error);
        addLog(`Error reading file: ${error}`);
        setStatus('error');
        setStatusMessage('Error: Could not read the selected file.');
        setOriginalFileBuffer(null);
      }
    } else {
        setStatus('idle');
        setStatusMessage('Upload a .ply file to get started.');
    }
  }, [addLog]);

  const handleReset = () => {
      addLog("App reset triggered");
      setFile(null);
      setOriginalFileBuffer(null);
      setResultViewBuffer(null);
      setReducedBlob(null);
      setAnalysisData(null);
      setOriginalCount(null);
      setReducedCount(null);
      setStatus('idle');
      setStatusMessage('Upload a .ply file to get started.');
      setIsProcessing(false);
      setProtectedIndices(new Set());
      setOriginalKey(prev => prev + 1);
      setReducedKey(prev => prev + 1);
      setOpacityRemoval(10);
      setSizeRemoval(10);
      setColorThreshold(0);
  };

  const handleSplatClick = useCallback((index: number) => {
      setProtectedIndices(prev => {
          const next = new Set(prev);
          if (next.has(index)) {
              next.delete(index); 
              addLog(`Splat #${index} un-protected`);
          } else {
              next.add(index);
              addLog(`Splat #${index} protected`);
          }
          return next;
      });
  }, [addLog]);

  const handleEyeDropper = async () => {
    if ('EyeDropper' in window) {
      try {
        // @ts-ignore - EyeDropper API is not yet in all TS definitions
        const eyeDropper = new window.EyeDropper();
        const result = await eyeDropper.open();
        setTargetColor(result.sRGBHex);
        if (colorThreshold === 0) setColorThreshold(10); // Auto-enable if it was off
        addLog(`Color picked: ${result.sRGBHex}`);
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

    addLog("Starting reduction process...");
    setIsProcessing(true);
    
    // Clear the result viewer to show we are working
    setResultViewBuffer(null);
    setReducedBlob(null);
    
    const statusCallback = (
        newStatus: ProcessStatus, 
        message: string, 
        counts?: { original: number, reduced: number }
    ) => {
      setStatus(newStatus);
      setStatusMessage(message);
      addLog(`[Processor] ${message}`);
      if (counts?.original) setOriginalCount(counts.original);
      if (counts?.reduced) setReducedCount(counts.reduced);
    };

    try {
      const options = {
        opacityRemoval,
        sizeRemoval,
        targetColor,
        colorThreshold,
        protectedIndices // Pass the protected set
      };

      const resultBlob = await reduceSplatsInFile(file, options, statusCallback);

      try {
          const buffer = await resultBlob.arrayBuffer();
          // Update the result viewer with the NEW buffer
          setResultViewBuffer(buffer);
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
      addLog("File downloaded");
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-200 flex flex-col items-center pt-28 p-4 sm:p-6 lg:p-8 font-sans">
      
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
            
            {/* Right Column: Two Viewers */}
            <div className="lg:col-span-8 flex flex-col gap-6">

               {/* 1. RESULT VIEWER (MOVED TO TOP) */}
               <div className="flex-1 min-h-[400px] flex flex-col">
                  <h2 className="text-lg font-semibold text-green-400 mb-2">
                      Optimized Result
                      {reducedCount && <span className="text-sm text-gray-400 ml-2 font-normal">({Math.round((reducedCount/ (originalCount || 1)) * 100)}% splats kept)</span>}
                  </h2>
                  <div className="flex-1 bg-gray-900 rounded-xl overflow-hidden shadow-inner border border-gray-700 relative">
                     {resultViewBuffer ? (
                         <PlyViewer 
                            key={`red-${reducedKey}`} 
                            fileBuffer={resultViewBuffer} 
                            onLog={addLog}
                            mode="static" 
                        />
                     ) : (
                         <div className="w-full h-full flex flex-col items-center justify-center text-gray-500 bg-gray-900/40">
                             {isProcessing ? (
                                 <>
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400 mb-2"></div>
                                    <span className="animate-pulse">Processing Splats...</span>
                                 </>
                             ) : (
                                 <>
                                    <SparklesIcon className="w-12 h-12 mb-2 opacity-20" />
                                    <span>Processed result will appear here</span>
                                 </>
                             )}
                         </div>
                     )}
                  </div>
               </div>
               
               {/* 2. LIVE PREVIEW (MOVED TO BOTTOM) */}
               <div className="flex-1 min-h-[400px] flex flex-col">
                 <div className="flex justify-between items-end mb-2">
                    <h2 className="text-lg font-semibold text-cyan-300 flex items-center gap-2">
                        <span className="relative flex h-3 w-3">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
                        </span>
                        Live Preview
                    </h2>
                    <span className="text-xs text-gray-400">Red splats = Will be removed</span>
                 </div>
                 <div className="flex-1 bg-gray-900 rounded-xl overflow-hidden shadow-inner border border-gray-700 relative">
                    
                    {/* Construction Banner */}
                    <div className="absolute top-0 inset-x-0 z-20 pointer-events-none bg-yellow-500/30 border-b border-yellow-500/20 backdrop-blur-[2px] flex items-center justify-center py-1">
                        <span className="text-yellow-100 text-xs font-bold uppercase tracking-widest shadow-sm">
                            Under Construction
                        </span>
                    </div>

                    <PlyViewer 
                        key={`orig-${originalKey}`} 
                        fileBuffer={originalFileBuffer} 
                        reductionSettings={reductionSettings}
                        protectedIndices={protectedIndices}
                        onSplatClick={handleSplatClick}
                        onLog={addLog}
                        mode="live" // Tells viewer to apply red shader
                    />
                 </div>
               </div>

            </div>

          </div>

        </main>
      </div>
    </div>
  );
}
