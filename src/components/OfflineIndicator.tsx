import { Wifi, WifiOff, RefreshCw, Clock, Cloud, CloudOff } from 'lucide-react';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { cn } from '@/lib/utils';

interface OfflineIndicatorProps {
  className?: string;
  showDetails?: boolean;
  webSocketStatus?: 'connecting' | 'connected' | 'disconnected';
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({
  className,
  showDetails = false,
  webSocketStatus = 'disconnected',
}) => {
  const { isSyncing, pendingCount, lastSyncTime } = useOfflineSync();
  const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  const formatLastSync = (date: Date | null) => {
    if (!date) return 'Never';
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  const isHealthy = isOnline && !isSyncing && pendingCount === 0 && webSocketStatus === 'connected';

  // Hide indicator when everything is healthy
  if (isHealthy) return null;

  const getWebSocketStatus = () => {
    switch (webSocketStatus) {
      case 'connected':
        return { icon: <Cloud className="h-4 w-4" />, text: 'Live', color: 'bg-blue-500 border-blue-600' };
      case 'connecting':
        return { icon: <RefreshCw className="h-4 w-4 animate-spin" />, text: 'Live connecting...', color: 'bg-yellow-500 border-yellow-600' };
      default:
        return { icon: <CloudOff className="h-4 w-4" />, text: 'Live disconnected', color: 'bg-gray-500 border-gray-600' };
    }
  };

  const wsStatus = getWebSocketStatus();

  // Minimal floating dot with tooltip; optional details expand inline
  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col gap-2">
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1 rounded-full shadow-soft border text-white',
          isOnline ? 'bg-green-500 border-green-600' : 'bg-red-500 border-red-600',
          showDetails ? 'w-auto' : 'w-8 h-8 justify-center',
          className,
        )}
        title={!isOnline ? 'Offline Mode' : isSyncing ? 'Syncing…' : pendingCount > 0 ? `${pendingCount} pending` : 'Connected'}
        aria-live="polite"
        aria-label={!isOnline ? 'Offline mode' : isSyncing ? 'Syncing' : pendingCount > 0 ? `${pendingCount} pending` : 'Connected'}
      >
        {isOnline ? (
          isSyncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />
        ) : (
          <WifiOff className="h-4 w-4" />
        )}

        {showDetails && (
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium">
              {!isOnline ? 'Offline' : isSyncing ? 'Syncing…' : pendingCount > 0 ? `${pendingCount} pending` : 'Connected'}
            </span>
            {(lastSyncTime || pendingCount > 0) && (
              <span className="flex items-center gap-1 opacity-90">
                <Clock className="h-3 w-3" />
                <span>Last sync: {formatLastSync(lastSyncTime)}</span>
              </span>
            )}
          </div>
        )}
      </div>
      <div
        className={cn(
          'flex items-center gap-2 px-2 py-1 rounded-full shadow-soft border text-white',
          wsStatus.color,
          showDetails ? 'w-auto' : 'w-8 h-8 justify-center',
          className,
        )}
        title={`WebSocket: ${wsStatus.text}`}
        aria-live="polite"
        aria-label={`WebSocket: ${wsStatus.text}`}
      >
        {wsStatus.icon}
        {showDetails && <span className="text-xs font-medium">{wsStatus.text}</span>}
      </div>
    </div>
  );
};

