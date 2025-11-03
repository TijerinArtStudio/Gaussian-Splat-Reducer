import React from 'react';

interface ColorPickerProps {
  color: string;
  onChange: (color: string) => void;
  disabled?: boolean;
}

export const ColorPicker: React.FC<ColorPickerProps> = ({ color, onChange, disabled }) => {
  return (
    <div className="flex items-center space-x-4 p-3 bg-gray-900/70 rounded-lg border border-gray-700">
      <label htmlFor="color-picker" className="font-medium text-gray-300">Color to delete:</label>
      <div className="relative">
        <input
          id="color-picker"
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-10 h-10 p-0 border-none rounded-md cursor-pointer disabled:cursor-not-allowed appearance-none bg-transparent [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-md [&::-webkit-color-swatch]:border-none"
          style={{ backgroundColor: color }}
        />
      </div>
      <input
        type="text"
        value={color.toUpperCase()}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-24 px-2 py-1 font-mono text-center bg-gray-800 border border-gray-600 rounded-md focus:ring-2 focus:ring-cyan-500 focus:outline-none"
      />
    </div>
  );
};