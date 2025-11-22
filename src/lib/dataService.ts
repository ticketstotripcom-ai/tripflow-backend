import { SheetLead } from "@/lib/googleSheets";
import { cacheService } from "@/lib/cacheService";

/**
 * Data service for managing records with offline sync support
 * Provides methods for saving records and syncing with backend
 */

/**
 * Mock function to simulate Google Sheets sync
 * In a real implementation, this would call the Google Sheets API
 */
async function syncFromGoogleSheets(): Promise<SheetLead[]> {
  try {
    console.log('Attempting to sync from Google Sheets...');
    
    // For now, return mock data or cached data
    // In a real implementation, this would call the Google Sheets API
    const cached = cacheService.getLeads();
    
    if (cached && cached.length > 0) {
      console.log('Using cached leads data');
      return cached;
    }
    
    // Return mock data if no cache exists
    const mockLeads: SheetLead[] = [
      {
        tripId: 'TRIP001',
        dateAndTime: '2024-01-15 10:30',
        consultant: 'John Doe',
        status: 'Confirmed',
        travellerName: 'Alice Smith',
        travelDate: '2024-02-01',
        travelState: 'Goa',
        remarks: 'Honeymoon trip',
        nights: '5',
        pax: '2',
        hotelCategory: '5 Star',
        mealPlan: 'All Inclusive',
        phone: '+1234567890',
        email: 'alice@example.com',
        priority: 'High',
        notes: 'Special dietary requirements',
      },
      {
        tripId: 'TRIP002',
        dateAndTime: '2024-01-16 14:20',
        consultant: 'Jane Smith',
        status: 'Inquiry',
        travellerName: 'Bob Johnson',
        travelDate: '2024-03-15',
        travelState: 'Kerala',
        remarks: 'Family vacation',
        nights: '7',
        pax: '4',
        hotelCategory: '4 Star',
        mealPlan: 'Breakfast Only',
        phone: '+0987654321',
        email: 'bob@example.com',
        priority: 'Medium',
      }
    ];
    
    // Cache the mock data
    cacheService.setLeads(mockLeads);
    console.log('Set mock leads data in cache');
    
    return mockLeads;
  } catch (error) {
    console.error('Failed to sync from Google Sheets:', error);
    
    // Fallback to cached data
    const cached = cacheService.getLeads();
    if (cached && cached.length > 0) {
      console.log('Falling back to cached data');
      return cached;
    }
    
    // Return empty array as last resort
    return [];
  }
}

/**
 * Save a record (create/update/delete) with offline sync support
 * This method handles both online and offline scenarios
 */
async function saveRecord(
  type: 'create' | 'update' | 'delete', 
  data: any, 
  syncImmediately: boolean = true
): Promise<void> {
  try {
    console.log(`Saving record: ${type}`, data);
    
    // In a real implementation, this would:
    // 1. Validate the data
    // 2. Apply the change locally (update cache/indexedDB)
    // 3. If online, sync with backend
    // 4. If offline, queue for later sync
    
    if (typeof navigator !== 'undefined' && navigator.onLine && syncImmediately) {
      // Simulate online save - in real implementation, this would be an API call
      console.log('Saving to backend (simulated)');
      
      // For now, just update the local cache if it's lead data
      if (data && (data.tripId || data.travellerName)) {
        const currentLeads = cacheService.getLeads();
        let updatedLeads = [...currentLeads];
        
        switch (type) {
          case 'create':
            updatedLeads.push(data);
            break;
          case 'update':
            const index = updatedLeads.findIndex(lead => lead.tripId === data.tripId);
            if (index !== -1) {
              updatedLeads[index] = { ...updatedLeads[index], ...data };
            }
            break;
          case 'delete':
            updatedLeads = updatedLeads.filter(lead => lead.tripId !== data.tripId);
            break;
        }
        
        cacheService.setLeads(updatedLeads);
      }
    } else {
      // Offline or delayed sync - data should be queued by changeQueue
      console.log('Offline mode - change queued for later sync');
      
      // Update local cache even when offline for immediate feedback
      if (data && (data.tripId || data.travellerName)) {
        const currentLeads = cacheService.getLeads();
        let updatedLeads = [...currentLeads];
        
        switch (type) {
          case 'create':
            updatedLeads.push(data);
            break;
          case 'update':
            const index = updatedLeads.findIndex(lead => lead.tripId === data.tripId);
            if (index !== -1) {
              updatedLeads[index] = { ...updatedLeads[index], ...data };
            }
            break;
          case 'delete':
            updatedLeads = updatedLeads.filter(lead => lead.tripId !== data.tripId);
            break;
        }
        
        cacheService.setLeads(updatedLeads);
      }
    }
    
    console.log('Record saved successfully');
  } catch (error) {
    console.error('Failed to save record:', error);
    throw error;
  }
}

export const dataService = {
  syncFromGoogleSheets,
  saveRecord,
};