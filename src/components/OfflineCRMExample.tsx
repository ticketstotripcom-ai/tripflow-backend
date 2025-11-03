import React, { useState } from 'react';
import { useCRMData } from '../hooks/useCRMData';
import { useOfflineSync } from '../hooks/useOfflineSync';
import { SyncStatusIndicator } from './SyncStatusIndicator';
import { saveRecord } from '../services/dataService';

export const OfflineCRMExample: React.FC = () => {
  const { data, syncing, refreshData } = useCRMData();
  const { isSyncing, pendingCount } = useOfflineSync();
  const [newRecord, setNewRecord] = useState({ id: '', name: '', email: '' });
  const [saveStatus, setSaveStatus] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setNewRecord(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Generate a unique ID if not provided
    const recordToSave = {
      ...newRecord,
      id: newRecord.id || `temp-${Date.now()}`
    };
    
    try {
      const result = await saveRecord(recordToSave);
      if (result.offline) {
        setSaveStatus('Saved offline - will sync when back online');
      } else {
        setSaveStatus('Saved successfully');
        await refreshData();
      }
      
      // Clear form
      setNewRecord({ id: '', name: '', email: '' });
    } catch (error) {
      setSaveStatus('Error saving record');
      console.error('Save error:', error);
    }
  };

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Offline-First CRM Example</h1>
      
      <div className="mb-6 p-4 bg-blue-50 rounded-lg">
        <h2 className="text-lg font-semibold mb-2">Connection Status</h2>
        <div className="flex items-center gap-4">
          <div className="flex items-center">
            <div className={`w-3 h-3 rounded-full mr-2 ${navigator.onLine ? 'bg-green-500' : 'bg-red-500'}`}></div>
            <span>{navigator.onLine ? 'Online' : 'Offline'}</span>
          </div>
          
          {pendingCount > 0 && (
            <div className="text-amber-600 font-medium">
              {pendingCount} pending change{pendingCount !== 1 ? 's' : ''} to sync
            </div>
          )}
        </div>
      </div>
      
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">Add New Record</h2>
        <form onSubmit={handleSubmit} className="space-y-4 bg-white p-4 rounded-lg shadow">
          <div>
            <label className="block text-sm font-medium mb-1">ID (optional)</label>
            <input
              type="text"
              name="id"
              value={newRecord.id}
              onChange={handleInputChange}
              className="w-full p-2 border rounded"
              placeholder="Auto-generated if empty"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              name="name"
              value={newRecord.name}
              onChange={handleInputChange}
              className="w-full p-2 border rounded"
              required
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              name="email"
              value={newRecord.email}
              onChange={handleInputChange}
              className="w-full p-2 border rounded"
              required
            />
          </div>
          
          <button 
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
          >
            Save Record
          </button>
          
          {saveStatus && (
            <div className={`mt-2 p-2 rounded ${
              saveStatus.includes('Error') ? 'bg-red-100 text-red-800' : 
              saveStatus.includes('offline') ? 'bg-yellow-100 text-yellow-800' : 
              'bg-green-100 text-green-800'
            }`}>
              {saveStatus}
            </div>
          )}
        </form>
      </div>
      
      <div className="mb-6">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">Records ({data.length})</h2>
          <button 
            onClick={refreshData}
            className="text-sm bg-gray-200 px-3 py-1 rounded hover:bg-gray-300"
          >
            Refresh Data
          </button>
        </div>
        
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {data.length === 0 ? (
            <p className="p-4 text-gray-500">No records found. Add some records to get started.</p>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.map((record: any) => (
                  <tr key={record.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{record.id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{record.name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">{record.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
      {/* Sync status indicator */}
      <SyncStatusIndicator syncing={syncing || isSyncing} />
    </div>
  );
};