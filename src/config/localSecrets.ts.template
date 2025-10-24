// LOCAL SECRETS - DO NOT COMMIT TO GIT
// Add this file to .gitignore to keep secrets local
// Copy this template and fill with your actual values

export const localSecrets = {
  // Google Sheets API Key (read-only) OR Service Account JSON (for add/update)
  googleApiKey: "YOUR_GOOGLE_API_KEY_HERE",
  
  // Google Sheets URL
  spreadsheetUrl: "https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID_HERE/edit",
  
  // Service Account JSON for write operations (paste entire JSON as string)
  // Get from Google Cloud Console -> Service Accounts -> Create Key
  serviceAccountJson: `{
    "type": "service_account",
    "project_id": "YOUR_PROJECT",
    "private_key_id": "YOUR_KEY_ID",
    "private_key": "-----BEGIN PRIVATE KEY-----\\\\\\\\nYOUR_PRIVATE_KEY\\\\\\\\n-----END PRIVATE KEY-----\\\\\\\\n",
    "client_email": "YOUR_SERVICE_ACCOUNT@YOUR_PROJECT.iam.gserviceaccount.com",
    "client_id": "YOUR_CLIENT_ID",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "YOUR_CERT_URL"
  }`,
  
  // Worksheet names in your Google Sheet
  worksheetNames: ["MASTER DATA", "BACKEND SHEET"],
  
  // Column mappings for MASTER DATA (Column A is Trip ID, auto-generated)
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
      qrCode: "data:image/png;base64,YOUR_QR_CODE_BASE64_HERE"
    }
  ]
};

// Helper to check if secrets are configured
export const areSecretsConfigured = () => {
  return localSecrets.spreadsheetUrl.includes("YOUR_") === false &&
         (localSecrets.googleApiKey.includes("YOUR_") === false || 
          localSecrets.serviceAccountJson.includes("YOUR_") === false);
};
