# Tickets To Trip CRM

A mobile-first CRM application for travel consultants to manage leads, track conversions, and communicate with customers. Built with React, TypeScript, and Capacitor for Android deployment.

### 3. Google Apps Script Setup

1. Open your Google Sheet.
2. Go to `Extensions > Apps Script`.
3. Copy the code from `Code.gs` in this repository and paste it into the Apps Script editor.
4. Save the script.
5. In the Apps Script editor, go to `Triggers` (the clock icon on the left).
6. Click `+ Add Trigger`.
7. Configure the trigger as follows:
   - Choose which function to run: `notifyCRMAppOnEdit`
   - Choose which deployment should run: `Head`
   - Select event source: `From spreadsheet`
   - Select event type: `On edit`
8. Click `Save`.
9. Add another trigger for the follow-up reminders:
   - Choose which function to run: `createDailyTrigger`
   - Choose which deployment should run: `Head`
   - Select event source: `Time-driven`
   - Select type of time based trigger: `Day timer`
   - Select time of day: `9am - 10am` (or your preferred time)
10. Click `Save`.

### 4. Running the Application

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Start the backend server:
   ```bash
   npm run start
   ```

## 🚀 Features

- **Lead Management**: Track leads through different pipeline stages
- **Google Sheets Integration**: Direct sync with Google Sheets for data storage
- **Smart Notifications**: Push notifications for new leads, reminders, and broadcasts
- **WhatsApp Integration**: Send templates, payment links, and brochures
- **Mobile-First**: Built with Capacitor for Android deployment
- **Secure Local Storage**: Credentials stored securely on device using encryption
- **Multi-User Support**: Admin and Consultant roles with different permissions
- **Offline-First**: Works without Lovable Cloud or Supabase dependencies

## 📋 Setup Instructions

### 1. Configure Local Secrets

⚠️ **IMPORTANT**: This app uses a local secrets file for Google Sheets credentials. This keeps sensitive data out of the repository and works independently of any cloud backend.

1. Copy the template file:
   ```bash
   cp src/config/localSecrets.ts.template src/config/localSecrets.ts
   ```

2. Edit `src/config/localSecrets.ts` and fill in your actual credentials:

```typescript
export const localSecrets = {
  // Option 1: Google API Key (for read-only access)
  googleApiKey: "AIza_YOUR_ACTUAL_KEY_HERE",
  
  // Option 2: Service Account JSON (REQUIRED for add/update operations)
  serviceAccountJson: `{
    "type": "service_account",
    "project_id": "your-project",
    "private_key_id": "...",
    "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",
    "client_email": "your-service-account@your-project.iam.gserviceaccount.com",
    // ... rest of your service account JSON
  }`,
  
  // Your Google Sheets URL
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/YOUR_ACTUAL_SHEET_ID/edit",
  
  // Worksheet names in your Google Sheet
  worksheetNames: ["MASTER DATA", "BACKEND SHEET"],
  
  // Column mappings for MASTER DATA sheet
  columnMappings: {
    date: "B",
    consultant: "C",
    status: "D",
    traveller_name: "E",
    travel_date: "G",
    travel_state: "H",
    remarks: "K",
    nights: "L",
    pax: "M",
    hotel_category: "N",
    meal_plan: "O",
    phone: "P",
    email: "Q",
    priority: "R"
  },
  
  // Payment links and QR codes
  paymentLinks: [
    {
      name: "Primary Payment",
      url: "https://your-payment-link.com",
      qrCode: "data:image/png;base64,YOUR_BASE64_ENCODED_QR_HERE"
    }
  ]
};
```

3. **NEVER commit** `src/config/localSecrets.ts` - it's already in `.gitignore`

### 2. Google Sheets Setup

Your Google Sheet must have two worksheets with specific columns:

#### BACKEND SHEET (Users/Authentication)
| Column | Field | Description |
|--------|-------|-------------|
| C | Name | User's full name |
| D | Email | Login email |
| E | Phone | Contact number |
| M | Role | `admin` or `consultant` |
| N | Password | Plain text password |

#### MASTER DATA (Leads)
| Column | Field | Description |
|--------|-------|-------------|
| A | Trip ID | Auto-generated, leave empty for new leads |
| B | Date | Lead creation date |
| C | Consultant | Assigned consultant name |
| D | Status | Lead pipeline status |
| E | Traveller Name | Customer name |
| G | Travel Date | Planned travel date |
| H | Travel State | Destination state |
| K | Remarks | Notes and comments |
| L | Nights | Number of nights |
| M | Pax | Number of passengers |
| N | Hotel Category | Hotel star rating |
| O | Meal Plan | Meal plan type |
| P | Phone | Customer phone |
| Q | Email | Customer email |
| R | Priority | Lead priority |

### 3. Google Cloud Setup

You need either an API Key (read-only) OR Service Account JSON (full access). For a fully functional app with add/update capabilities, **use Service Account**.

#### Option A: API Key (Read-Only) ⚠️ Limited functionality
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Google Sheets API**
4. Go to Credentials → Create Credentials → API Key
5. Restrict the key to Google Sheets API only
6. Make your sheet **"Anyone with link can view"**
7. Copy API key to `localSecrets.ts`

**Limitations**: Can only read data, cannot add or update leads

#### Option B: Service Account (Full Access) ✅ Recommended
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Google Sheets API**
4. Go to IAM & Admin → Service Accounts
5. Click "Create Service Account"
6. Give it a name and Editor role
7. Click on the created service account
8. Go to Keys → Add Key → Create New Key → JSON
9. Download the JSON file
10. Open the JSON file and copy its entire contents
11. Paste into `serviceAccountJson` field in `localSecrets.ts`
12. **Important**: Share your Google Sheet with the service account email (found in JSON as `client_email`) with Editor permissions

### 4. Default Login Credentials

For first-time setup, use the default admin account:

- **Email**: `ticketstotrip.com@gmail.com`
- **Password**: `123456`

After logging in, you can:
- Configure Google Sheets settings in the Admin Settings page
- Add more users to the BACKEND SHEET in your Google Sheet

### 5. Install Dependencies

```bash
npm install
```

### 6. Run Development Server

```bash
npm run dev
```

The app will open at `http://localhost:5173`. If you have configured `localSecrets.ts` correctly, you should be able to log in and see your Google Sheets data.

### 7. Build for Production

```bash
npm run build
```

### 8. Deploy to Mobile (Android)

```bash
# Sync web build to native platform
npx cap sync android

# Open in Android Studio
npx cap open android

# Then build and run from Android Studio
```

## 🔐 Security & Architecture

### No Cloud Dependencies
- **No Supabase**: This app does NOT use Supabase or Lovable Cloud
- **No External Backend**: All data is stored in Google Sheets
- **Local Auth**: Authentication uses the BACKEND SHEET in Google Sheets
- **Secure Storage**: Credentials encrypted locally using Capacitor Preferences

### Local Secrets File
- All sensitive credentials live in `src/config/localSecrets.ts`
- This file is gitignored and must be manually created on each installation
- Template provided at `src/config/localSecrets.ts.template`
- For production deployments, consider using environment-specific build configs

### Authentication Flow
1. App checks for local session on startup
2. If session exists, redirects to dashboard immediately (no Chrome/external auth)
3. If no session, shows login screen
4. Login validates against users in BACKEND SHEET of Google Sheets
5. Session stored encrypted locally

## 📱 Mobile Features

- **Push Notifications**: Real-time alerts for new leads, reminders, and broadcasts
- **Local Reminders**: Schedule follow-up reminders using device notifications
- **Contact Integration**: Save lead contacts directly to phone contacts
- **Call Tracking**: Log call duration and timing (platform-dependent)
- **WhatsApp Integration**: Open WhatsApp chats directly from app
- **Offline Support**: Works offline with local cache, syncs when online

## 🛠️ Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: Tailwind CSS + shadcn/ui components
- **Mobile**: Capacitor 7 (Android & iOS support)
- **Backend**: Google Sheets API (direct integration, no middleware)
- **Auth**: Custom authentication using BACKEND SHEET
- **Storage**: Capacitor Preferences with encryption
- **Notifications**: Capacitor Push Notifications + Local Notifications

## 🏗️ Project Structure

```
src/
├── components/        # React components
│   ├── dashboard/    # Dashboard-specific components
│   └── ui/           # Reusable UI components (shadcn)
├── config/           # Configuration files
│   └── localSecrets.ts    # Your Google credentials (gitignored)
├── lib/              # Core services and utilities
│   ├── authService.ts     # Authentication logic
│   ├── googleSheets.ts    # Google Sheets API integration
│   ├── notificationService.ts  # Push notifications
│   ├── secureStorage.ts   # Encrypted local storage
│   └── themeService.ts    # Dark/light theme
├── pages/            # Page components
└── main.tsx          # App entry point
```

## 🔧 Troubleshooting

### App redirects to Chrome/Lovable after install
✅ Fixed: Removed all Supabase/Lovable auth. App now checks local session first.

### "API keys are not supported" error when adding leads
❌ You're using API Key only. Switch to Service Account JSON for write operations.

### Lead updates not syncing to Google Sheets
1. Verify Service Account JSON is configured in `localSecrets.ts`
2. Check that service account email has Editor access to your sheet
3. Check browser console for detailed error messages

### Login fails with valid credentials
1. Verify BACKEND SHEET exists in your Google Sheet
2. Check column mappings are correct (C=Name, D=Email, M=Role, N=Password)
3. Ensure sheet is shared with service account (if using Service Account)

## 📄 Files You Must Configure

1. `src/config/localSecrets.ts` - **Create from template** and fill with your credentials
2. Google Sheet - **Create** with BACKEND SHEET and MASTER DATA worksheets
3. Google Cloud - **Setup** Service Account and enable Sheets API

## 🚫 What NOT to Commit

- `src/config/localSecrets.ts` (your actual credentials)
- Any files containing API keys, passwords, or private keys
- Service Account JSON files
- `.env` files (if you create any)

## 📞 Support

For issues or questions, contact: ticketstotrip.com@gmail.com

## 🔒 License

Proprietary - Tickets To Trip
#   t r i p f l o w - b a c k e n d 
 
 #   t r i p f l o w - b a c k e n d 
 
 #   t r i p f l o w - b a c k e n d 
 
 
## Performance Optimizations (2025-11)

This release optimizes startup time, adds robust offline support, and improves runtime smoothness.

### What changed
- Route-based code splitting with React.lazy + Suspense
- Manual chunking via Vite (react/router/db/icons/sound split)
- Idle-time prefetch for common routes
- Workbox service worker updated:
  - Stale-While-Revalidate for static assets
  - Network-First for API (Google Sheets/backend) with short timeout
  - Full offline shell for previously visited pages
- Instant UI from IndexedDB/Dexie cache, silent background refresh (useCRMData)
- Visual polish and GPU-friendly animations (no blocking scripts)

### How to test performance
1. Build production: `npm run build && npm run preview`
2. In Chrome DevTools → Lighthouse:
   - Simulate Mobile / Slow 4G
   - Categories: Performance, PWA, Best Practices
   - Expect 90+ when assets are warm; first run depends on network.
3. WebPageTest (optional): run a test with 3G and record TTI/FCP/LCP/CLS.

### Expected metrics (targets)
- FCP: < 1.0s (repeat view on 3G)
- LCP: < 2.5s
- TTI: < 2.0s
- CLS: < 0.1

### Offline testing
- Start preview: `npm run preview`
- Open the app, navigate Home → Dashboard → Notifications.
- Go offline (DevTools → Network → Offline) and refresh:
  - UI should load instantly from cache.
  - Leads and notifications show last saved data.
  - When back online, background sync refreshes data.

### Notes
- SW is registered in `src/main.tsx` and generated by Workbox (see `workbox-config.cjs`).
- Vite manualChunks splits large libs to speed first paint.
- If you deploy on Vercel/Node, no server changes required.

## Google Apps Script Notifications (Hybrid)

## Background Prefetch System

This app includes a lightweight background prefetch mechanism that refreshes main app data every ~2 minutes.

How it works
- The Workbox-generated service worker imports `public/sw-extra.js`, which listens for Background Sync and Periodic Background Sync events.
- The page registers a periodic task if supported; otherwise it falls back to sending a message every 2 minutes while the app is open.
- The SW fetches `VITE_APP_DATA_URL` (or uses `VITE_SHEET_API_URL` as a fallback), caches it into `app-data-v1` via the Cache API.
- On next app open, UI hydrates from cache first for instant load, then silently refreshes in the background.

Setup
1. Create and deploy a Google Apps Script for app data (see `scripts/googleappcode.gs3`).
2. Set the endpoint in `.env`:
   - `VITE_APP_DATA_URL="https://script.google.com/macros/s/DEPLOYMENT_ID/exec"`
   - (Optional) `VITE_SHEET_API_URL` is still used for notifications.
3. Build the app: `npm run build`.

Supported environments
- Chrome/Edge Desktop & Android (Periodic Background Sync availability varies by device/OS/policy)
- Android WebView with SW enabled (prefetch falls back to runtime messaging when PBS not available)

Testing steps
1. Load the app once (ensure SW is registered).
2. If your browser supports Periodic Background Sync, close the tab for >2 minutes; otherwise leave it in background.
3. Reopen: the app should show updated cached data instantly; a background refresh continues.

Notes
- This system does not use push notifications. It’s pure background fetch + cache.
- Periodic Background Sync is controlled by the browser; some devices may throttle or require user engagement.

This app now supports a hybrid notification system that combines a Google Apps Script Web App endpoint (as a lightweight backend) with background polling and the existing Google Sheets client.

### Setup (Google Apps Script)
1. Open your Google Sheet → Extensions → Apps Script.
2. Create two script files with these contents (also included in this repo under `scripts/`):
   - `googleappcode.gs1` (GET notifications)
   - `googleappcode.gs2` (POST new notification)
3. Deploy → New deployment → Web app → Anyone with the link → Deploy.
4. Copy the web app URL and set it in your environment:
   - Vite: `VITE_SHEET_API_URL="https://script.google.com/macros/s/DEPLOYMENT_ID/exec"`
5. Rebuild the app: `npm run build` (or restart dev server).

### How it works
- A new hook `useNotifications()` polls the Apps Script endpoint every 10s.
- If the endpoint isn’t set or fails, it falls back to reading notifications via Google Sheets (existing logic).
- Results are cached locally (localStorage) and updated incrementally without duplicates.
- UI (`NotificationBell`, `Notifications` page) renders instantly from cache and updates live.

### Verify locally
1. Set `VITE_SHEET_API_URL` in `.env` (or `.env.local`).
2. Run `npm run dev`.
3. Open app, click the bell → View all → confirm new items arrive within ~10s.
4. Disable internet → cached notifications remain visible; re-enable → auto-refresh resumes.
## Notification Icons Setup

This project uses a React PWA (Vite) with a Service Worker. To enable visible notification indicators (status bar + app icon badge):

Folders and placeholders
- Web (PWA):
  - `public/icons/notification-icon.png` (96×96)
  - `public/icons/notification-badge.png` (72×72)
  - `public/icons/app-icon-192.png` (192×192)
  - `public/icons/app-icon-512.png` (512×512)
  - Replace placeholders with real PNGs at the sizes shown.
- React Native (not used here): If you later migrate to React Native, add icon assets under `android/app/src/main/res/` and update `AndroidManifest.xml` to reference `ic_stat_notification`.

Manifest updates (PWA)
- `public/manifest.json` now references the app icons and a badge:
  - `icons`: `/icons/app-icon-192.png`, `/icons/app-icon-512.png`
  - `badge`: `/icons/notification-badge.png`
  - Test in Chrome DevTools → Application → Manifest.

Service worker notifications (PWA)
- The Workbox SW imports `public/sw-extra.js`, which can display notifications with the correct small icon and badge.
- The app sends a `SHOW_NOTIFICATION` message to the SW on new items; the SW calls `registration.showNotification` with:
  - `icon: /icons/notification-icon.png`
  - `badge: /icons/notification-badge.png`

App launcher badge (PWA)
- The client attempts to set a badge count using the experimental `navigator.setAppBadge(count)` API where supported.
- Badge count is updated when unread notifications change.

Verification
1. Replace placeholder PNGs with your real icons at the sizes listed.
2. Build and run (`npm run build && npm run preview`).
3. Trigger a new notification (e.g., via Apps Script or sheet change):
   - The in-app bell updates and plays sound.
   - The system notification appears with small icon and badge.
   - The app icon may show a badge count (browser/device support varies).
