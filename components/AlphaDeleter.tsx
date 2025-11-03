import React, { useState } from 'react';
import { Button } from './Button';
import { Slider } from './Slider';
import { ColorPicker } from './ColorPicker';
import { SparklesIcon } from './Icons';

interface AlphaDeleterProps {
    onProcess: (targetColor: string, colorTolerance: number) => Promise<void>;
    disabled: boolean;
}

export const AlphaDeleter: React.FC<AlphaDeleterProps> = ({ onProcess, disabled }) => {
    const [targetColor, setTargetColor] = useState<string>('#00ff00');
    const [colorTolerance, setColorTolerance] = useState<number>(10);

    const handleProcessClick = () => {
        onProcess(targetColor, colorTolerance);
    }

    return (
        <div className="bg-gray-800/50 rounded-2xl shadow-2xl p-6 sm:p-8 space-y-8 backdrop-blur-sm border border-gray-700 h-full flex flex-col">
            <div className="flex-grow space-y-6">
                <h2 className="text-2xl font-bold text-center text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-600">
                    Gaussian Splat Alpha Delete
                </h2>
                
                <div className="space-y-6">
                    <h3 className="text-xl font-semibold text-cyan-400">2. Select Color & Tolerance</h3>
                    <ColorPicker
                        color={targetColor}
                        onChange={setTargetColor}
                        disabled={disabled}
                    />
                    <div>
                        <label className="block mb-2 font-medium text-gray-300">Color Tolerance</label>
                        <Slider
                            value={colorTolerance}
                            onChange={setColorTolerance}
                            disabled={disabled}
                        />
                        <p className="text-xs text-gray-500 mt-2">Define how similar colors must be to be removed. A higher value includes more shades.</p>
                    </div>
                </div>
            </div>

            <div className="flex justify-center pt-4">
                <Button
                    onClick={handleProcessClick}
                    disabled={disabled}
                >
                    <SparklesIcon className="w-5 h-5 mr-2" />
                    Delete Splats
                </Button>
            </div>
        </div>
    );
};