# Tickets To Trip CRM

A mobile-first CRM application for travel consultants to manage leads, track conversions, and communicate with customers. Built with React, TypeScript, and Capacitor for Android deployment.

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
#   t r i p f l o w - b a c k e n d  
 #   t r i p f l o w - b a c k e n d  
 #   t r i p f l o w - b a c k e n d  
 