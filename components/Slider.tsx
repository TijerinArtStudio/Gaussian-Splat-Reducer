import React from 'react';

interface SliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export const Slider: React.FC<SliderProps> = ({ value, onChange, disabled }) => {
  return (
    <div className="flex items-center space-x-4">
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:bg-cyan-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:transition-all [&::-webkit-slider-thumb]:duration-150 [&::-webkit-slider-thumb]:ease-in-out [&::-webkit-slider-thumb]:hover:bg-cyan-300 [&::-webkit-slider-thumb]:active:scale-110"
      />
      <div className="flex-shrink-0 w-20 text-center">
        <span className="text-lg font-bold text-cyan-400 bg-gray-700/50 px-3 py-1 rounded-md">
          {value}%
        </span>
      </div>
    </div>
  );
};