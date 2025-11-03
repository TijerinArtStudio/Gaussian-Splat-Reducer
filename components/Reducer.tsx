import React, { useState } from 'react';
import { Button } from './Button';
import { Slider } from './Slider';
import { SparklesIcon } from './Icons';

interface ReducerProps {
    onProcess: (opacityThreshold: number, scaleThreshold: number) => Promise<void>;
    disabled: boolean;
}

export const Reducer: React.FC<ReducerProps> = ({ onProcess, disabled }) => {
    const [opacityThreshold, setOpacityThreshold] = useState<number>(5);
    const [scaleThreshold, setScaleThreshold] = useState<number>(5);

    const handleProcessClick = () => {
        onProcess(opacityThreshold, scaleThreshold);
    }

    return (
        <div className="bg-gray-800/50 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-8 backdrop-blur-sm border border-gray-700 h-full flex flex-col">
            <div className="flex-grow space-y-6">
                 <h2 className="text-2xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
                    Gaussian Splat Reducer
                </h2>

                <div className="space-y-6">
                    <h3 className="text-xl font-semibold text-cyan-400">2. Set Thresholds</h3>
                     <div>
                        <label className="block mb-2 font-medium text-gray-300">Opacity Threshold</label>
                        <Slider
                            value={opacityThreshold}
                            onChange={setOpacityThreshold}
                            disabled={disabled}
                        />
                        <p className="text-xs text-gray-500 mt-2">Splats with opacity below this value will be removed.</p>
                    </div>
                     <div>
                        <label className="block mb-2 font-medium text-gray-300">Scale Threshold</label>
                        <Slider
                            value={scaleThreshold}
                            onChange={setScaleThreshold}
                            disabled={disabled}
                        />
                        <p className="text-xs text-gray-500 mt-2">Removes splats where all scale axes are below a percentage of the scene's maximum scale.</p>
                    </div>
                </div>
            </div>

            <div className="flex justify-center pt-4">
                <Button
                    onClick={handleProcessClick}
                    disabled={disabled}
                >
                    <SparklesIcon className="w-5 h-5 mr-2" />
                    Reduce Splats
                </Button>
            </div>
        </div>
    );
};