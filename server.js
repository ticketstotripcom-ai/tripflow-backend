// server.js
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import admin from 'firebase-admin'; // ✅ NEW import for Firebase Admin SDK

const app = express();
app.use(cors());
app.use(express.json());

// --- Firebase Admin SDK Initialization ---
let firebaseInitialized = false;
const firebaseServiceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if (firebaseServiceAccountJson) {
  try {
    const serviceAccount = JSON.parse(firebaseServiceAccountJson);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
    firebaseInitialized = true;
    console.log('✅ Firebase Admin SDK initialized for FCM.');
  } catch (error) {
    console.error('❌ Failed to initialize Firebase Admin SDK. Check FIREBASE_SERVICE_ACCOUNT_JSON:', error);
  }
} else {
  console.warn('⚠️ FIREBASE_SERVICE_ACCOUNT_JSON not found. FCM push notifications will be disabled.');
}

// --- FCM Token Storage ---
const fcmTokens = new Set(); // Stores unique FCM registration tokens


// --- WebSocket Setup ---
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

async function broadcast(data) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  // 1. WebSocket broadcast
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      try {
        client.send(payload);
      } catch (e) {
        console.warn('WS send failed:', e);
      }
    }
  });
  console.log('Broadcasted to all WebSocket clients:', payload);

  // 2. FCM Push Notification (if Firebase initialized and tokens available)
  if (firebaseInitialized && fcmTokens.size > 0) {
    const notificationPayload = {
      title: data.title || 'Notification',
      body: data.message || '',
    };
    
    // FCM data payload must be string key-value pairs
    const dataPayload = {};
    for (const key in data) {
      dataPayload[key] = String(data[key]);
    }

    const message = {
      notification: notificationPayload,
      data: dataPayload,
      tokens: Array.from(fcmTokens), // send to all registered tokens
    };

    try {
      const response = await admin.messaging().sendEachForMulticast(message);
      console.log('FCM messages sent:', response.successCount, 'succeeded,', response.failureCount, 'failed.');

      if (response.failureCount > 0) {
        const failedTokens: string[] = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(message.tokens[idx]);
            // Remove tokens that are no longer valid
            if (resp.error?.code === 'messaging/invalid-registration-token' ||
                resp.error?.code === 'messaging/registration-token-not-registered') {
              fcmTokens.delete(message.tokens[idx]);
              console.log('Removed invalid FCM token:', message.tokens[idx]);
            }
          }
        });
      }
    } catch (error) {
      console.error('Error sending FCM multicast message:', error);
    }
  }
}

wss.on('connection', (ws) => {
  console.log('🔔 WebSocket client connected');
  ws.on('close', () => console.log('🔕 WebSocket client disconnected'));
});

// --- Middleware for Secret Validation ---
const NOTIFY_SECRET = process.env.NOTIFY_SECRET || 'YOUR_SECRET'; // Use environment variable

function validateSecret(req, res, next) {
  const secret = req.headers['x-tripflow-secret'];
  if (!secret || secret !== NOTIFY_SECRET) {
    console.warn('Unauthorized attempt to access a protected endpoint.');
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}


// --- Core Notification Logic (The "Brain") ---
function processSheetEdit(eventData) {
  const { sheetName, row, col, value, allRowData } = eventData;
  if (!sheetName || !allRowData) {
    return null; // Not enough data to process
  }

  let notification = null;

  if (sheetName === 'MASTER DATA') {
    notification = handleMasterDataChanges(col, value, allRowData);
  } else if (sheetName.toLowerCase() === 'blackboard') {
    notification = handleBlackboardChanges(allRowData);
  }

  if (notification) {
    // Add common fields
    notification.createdAt = new Date().toISOString();
    console.log('Generated notification:', notification);
    broadcast(notification);
  }

  return notification;
}

function handleMasterDataChanges(col, value, data) {
  const travellerName = data[4] || 'Unknown Traveller';
  const consultant = data[2] || 'Unassigned';
  const baseNotification = {
    type: '',
    title: '',
    message: '',
    role: '',
    priority: 'medium',
    actions: [],
  };

  // Rule 1: New trip added (column 1 - Trip ID)
  if (col === 1 && value) {
    return {
      ...baseNotification,
      type: 'new_trip',
      title: 'New Trip Added',
      message: `New trip for "${travellerName}" has been added.`,
      role: 'admin',
      priority: 'high',
      actions: [{ action: 'view', title: 'View Trip' }, { action: 'assign', title: 'Assign' }],
    };
  }

  // Rule 2: Trip assigned (column 3 - Consultant)
  if (col === 3 && value) {
    return {
      ...baseNotification,
      type: 'trip_assigned',
      title: 'Trip Assigned',
      message: `Trip for "${travellerName}" assigned to ${consultant}.`,
      role: consultant, // Target the specific consultant
      priority: 'high',
      actions: [{ action: 'view', title: 'View Trip' }, { action: 'contact', title: 'Contact' }],
    };
  }

  // Rule 3: Trip booked (column 4 - Status)
  if (col === 4 && value === 'Booked') {
    return {
      ...baseNotification,
      type: 'trip_booked',
      title: '🎉 Trip Booked!',
      message: `${consultant} just booked a trip for "${travellerName}".`,
      role: 'all',
      priority: 'high',
      actions: [{ action: 'celebrate', title: 'Celebrate!' }],
    };
  }

  // Rule 4: Follow-up reminder (column 8 - Follow Up Date)
  if (col === 8 && value) {
    return {
      ...baseNotification,
      type: 'follow_up',
      title: 'Follow-up Reminder',
      message: `Follow-up scheduled for "${travellerName}" on ${value}.`,
      role: consultant,
      priority: 'medium',
      actions: [{ action: 'remind', title: 'Set Reminder' }],
    };
  }

  return null;
}

function handleBlackboardChanges(data) {
    const author = data[2] || 'Unknown Author';
    const postType = data[3] || 'general';
    const content = data[4] || '';
    const urgency = data[5] || 'normal';

    const notification = {
        type: 'blackboard_post',
        title: 'New Blackboard Post',
        message: `New post by ${author}: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`,
        role: 'all',
        priority: urgency === 'urgent' ? 'high' : 'medium',
        actions: [{ action: 'view', title: 'View Post' }],
    };

    if (postType === 'announcement') notification.title = 'New Announcement';
    else if (postType === 'update') notification.title = 'System Update';
    else if (postType === 'alert') notification.title = 'Important Alert';
    
    return notification;
}


// --- API Endpoints ---

// Test route
app.get('/', (req, res) => {
  res.send('✅ Tripflow Backend is running!');
});

// Endpoint to register/unregister FCM tokens
app.post('/api/fcm-token', validateSecret, (req, res) => {
  const { token, action } = req.body; // action: 'register' or 'unregister'
  if (!token) {
    return res.status(400).json({ error: 'FCM token required' });
  }

  if (action === 'unregister') {
    fcmTokens.delete(token);
    console.log('FCM Token unregistered:', token);
  } else { // default to register
    fcmTokens.add(token);
    console.log('FCM Token registered:', token);
  }
  res.json({ success: true, registeredTokens: fcmTokens.size });
});


// NEW Endpoint for Google Sheet `onEdit` trigger
app.post('/api/sheet-edit', validateSecret, (req, res) => {
  const eventData = req.body;
  console.log('Received sheet edit event:', eventData);

  if (!eventData || !eventData.sheetName) {
    return res.status(400).json({ error: 'Invalid event data' });
  }

  // Process the event asynchronously
  processSheetEdit(eventData);

  // Immediately respond to Google Apps Script to avoid timeouts
  res.status(202).json({ success: true, message: 'Event accepted' });
});


// LEGACY Endpoint for direct notifications
app.post('/api/notify', validateSecret, (req, res) => {
  const body = req.body || {};
  console.log('Received direct notification:', body);
  const message = {
    title: body.title || 'Notification',
    message: body.message || '',
    type: body.type || 'general',
    createdAt: new Date().toISOString(),
    // Forward any other properties
    ...body,
  };
  broadcast(message);
  res.json({ success: true });
});

// Health endpoint
app.get('/health', (_req, res) => res.json({ ok: true }));


// --- Server Start ---
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => console.log(`🚀 Server running (HTTP + WS) on port ${PORT}`));
