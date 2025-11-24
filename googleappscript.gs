/**
 * Google Apps Script for Tripflow CRM - Simplified Trigger
 *
 * This script's only job is to capture sheet edit events and forward them
 * to the backend, which now contains all the notification logic.
 *
 * HOW TO USE:
 * 1. Replace the old script content with this entire script.
 * 2. Set up the onEdit trigger in your Google Sheet project:
 *    - Go to Triggers (alarm clock icon).
 *    - Click "+ Add Trigger".
 *    - Choose function: `forwardEditEventToBackend`.
 *    - Select event source: `From spreadsheet`.
 *    - Select event type: `On edit`.
 *    - Save.
 * 3. **IMPORTANT**: Make sure the `BACKEND_SECRET` here matches the `NOTIFY_SECRET`
 *    environment variable in your backend deployment.
 */

// Configuration
const CONFIG = {
  // IMPORTANT: Update this to your backend's URL
  BACKEND_URL: 'https://tripflow-backend-6xzr.onrender.com/api/sheet-edit',
  
  // IMPORTANT: This secret MUST match the `NOTIFY_SECRET` on your backend server.
  BACKEND_SECRET: 'YOUR_SECRET',
};

/**
 * The main trigger function to be called by Google Sheets `onEdit` event.
 * It captures the event data and forwards it to the backend.
 * @param {Object} e The event object from the `onEdit` trigger.
 */
function forwardEditEventToBackend(e) {
  try {
    if (!e || !e.range) {
      Logger.log('Event object or range is missing. Exiting.');
      return;
    }

    const sheet = e.source.getActiveSheet();
    const sheetName = sheet.getName();
    const row = e.range.getRow();
    const col = e.range.getColumn();
    
    // Only process edits in MASTER DATA or blackboard, and ignore header rows.
    if ((sheetName !== 'MASTER DATA' && sheetName.toLowerCase() !== 'blackboard') || row <= 1) {
      // Logger.log('Edit in ignored sheet or header row. Skipping.');
      return;
    }

    // Get all data from the edited row to provide full context to the backend.
    const allRowData = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Construct the payload to send to the backend.
    const payload = {
      sheetName: sheetName,
      row: row,
      col: col,
      value: e.value,          // The new value of the cell
      oldValue: e.oldValue,    // The old value of the cell
      allRowData: allRowData,    // The complete data of the edited row
    };

    // Define the options for the HTTP request.
    const options = {
      method: 'post',
      contentType: 'application/json',
      headers: {
        'x-tripflow-secret': CONFIG.BACKEND_SECRET
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true, // Prevents script from stopping on HTTP errors
    };

    // Send the data to the backend.
    const response = UrlFetchApp.fetch(CONFIG.BACKEND_URL, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode !== 202) {
      Logger.log('Backend responded with error: ' + responseCode + ' - ' + response.getContentText());
    } else {
      // Logger.log('Event successfully sent to backend. Response: ' + response.getContentText());
    }

  } catch (err) {
    Logger.log('FATAL: Error in forwardEditEventToBackend: ' + err.toString());
  }
}
