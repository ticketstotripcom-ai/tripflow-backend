import React from 'react';

interface SyncStatusIndicatorProps {
  syncing: boolean;
  className?: string;
}

export const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({ 
  syncing, 
  className = '' 
}) => {
  return (
    <div 
      className={`fixed bottom-2 right-2 p-2 rounded text-sm transition-colors duration-300 ${
        syncing ? 'bg-yellow-300' : 'bg-green-300'
      } ${className}`}
    >
      {syncing ? 'Syncing...' : 'Up to Date'}
    </div>
  );
};