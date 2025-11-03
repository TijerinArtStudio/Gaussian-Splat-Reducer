import React from 'react';

interface StatsCardProps {
  title: string;
  value: number | null;
}

export const StatsCard: React.FC<StatsCardProps> = ({ title, value }) => {
  const displayValue = value === null ? '---' : value.toLocaleString();
  return (
    <div className="bg-gray-900/70 p-4 rounded-lg text-center border border-gray-700">
      <h3 className="text-sm font-medium text-gray-400">{title}</h3>
      <p className="text-2xl font-semibold text-cyan-400 mt-1">{displayValue}</p>
    </div>
  );
};