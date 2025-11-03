import React from 'react';
import { CheckCircleIcon, XCircleIcon } from './Icons';

type ProcessStatus = 'idle' | 'loading' | 'calculating' | 'reducing' | 'saving' | 'success' | 'error';

interface StatusDisplayProps {
  status: ProcessStatus;
  message: string;
}

const Spinner: React.FC = () => (
    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-cyan-400"></div>
);

export const StatusDisplay: React.FC<StatusDisplayProps> = ({ status, message }) => {
  const isProcessing = ['loading', 'calculating', 'reducing', 'saving'].includes(status);
  
  const getIcon = () => {
    if (isProcessing) {
        return <Spinner />;
    }
    switch (status) {
      case 'success':
        return <CheckCircleIcon className="w-6 h-6 text-green-400" />;
      case 'error':
        return <XCircleIcon className="w-6 h-6 text-red-400" />;
      default:
        return null;
    }
  };

  const getTextColor = () => {
     switch (status) {
      case 'success':
        return 'text-green-300';
      case 'error':
        return 'text-red-300';
      default:
        return 'text-gray-400';
    }
  }

  return (
    <div className={`flex items-center space-x-3 p-4 rounded-lg bg-gray-900/70 border border-gray-700 min-h-[60px] ${getTextColor()}`}>
      <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center">
        {getIcon()}
      </div>
      <p className="text-sm font-medium">{message}</p>
    </div>
  );
};