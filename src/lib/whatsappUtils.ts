/**
 * ============================================================
 *  UNIVERSAL WHATSAPP UTILITIES (Web + Android + iOS + WebView)
 * ============================================================
 */

import { whatsappTemplates } from "./whatsappTemplates";

// -------------------------------------------
// Phone Number Formatting
// -------------------------------------------
export function formatPhoneForWhatsApp(phone: string, countryCode = "91"): string {
  if (!phone) return "";

  // Keep digits only
  let clean = phone.replace(/\D/g, "");

  // Remove leading zero (e.g. 09876 → 9876)
  if (clean.startsWith("0")) clean = clean.slice(1);

  // Remove country code if already present and add it back properly
  if (clean.startsWith(countryCode)) {
    clean = clean.slice(countryCode.length);
  }

  // Indian 10-digit number → add country code
  if (clean.length === 10) clean = countryCode + clean;

  // Ensure we have proper international format without + or 00 prefix
  // WhatsApp web format should be: countryCode + number without + prefix
  if (clean.startsWith("+")) clean = clean.slice(1);
  if (clean.startsWith("00")) clean = clean.slice(2);

  // WhatsApp supports 10–15 digits total (including country code)
  if (clean.length < 10 || clean.length > 15) return "";

  return clean;
}

// -------------------------------------------
// WhatsApp-safe encoding
// -------------------------------------------
export function encodeWhatsAppMessage(message: string): string {
  if (!message) return "";

  return encodeURIComponent(message)
    .replace(/%20/g, "+") // Preferred for WhatsApp
    .replace(/%0A/g, "%0A"); // Keep line breaks safe
}

// -------------------------------------------
// Template Formatter with Missing Variable Detection
// -------------------------------------------
export function formatWhatsAppTemplate(
  templateId: string,
  variables: Record<string, string>
): string {
  const template = whatsappTemplates.find((t) => t.id === templateId);

  if (!template) {
    throw new Error(`Template '${templateId}' not found`);
  }

  let message = template.message;

  const missingKeys: string[] = [];

  // Replace each variable
  message = message.replace(/\$\{(.*?)\}/g, (_, key) => {
    if (variables[key] === undefined) {
      missingKeys.push(key);
      return "";
    }
    return variables[key];
  });

  if (missingKeys.length) {
    console.warn(
      "⚠️ Missing template variables:",
      missingKeys.join(", ")
    );
  }

  return message.trim();
}

// -------------------------------------------
// WhatsApp URL Generator
// -------------------------------------------
export function createWhatsAppUrl(
  phoneNumber: string,
  message: string,
  countryCode: string = "91"
) {
  const phone = formatPhoneForWhatsApp(phoneNumber, countryCode);
  if (!phone) throw new Error("Invalid phone number");

  const encoded = encodeWhatsAppMessage(message);
  
  // Ensure proper international format for WhatsApp Web
  // Format should be: https://wa.me/91XXXXXXXXXX
  const formattedPhone = phone.startsWith('+') ? phone.slice(1) : phone;

  return {
    webUrl: `https://api.whatsapp.com/send/?phone=%2B${formattedPhone}${encoded ? `&text=${encoded}` : ''}&type=phone_number&app_absent=0`,
    phone: formattedPhone,
  };
}

// -------------------------------------------
// Auto-detect device and open WhatsApp safely
// -------------------------------------------
export function openWhatsAppWithTemplate(
  phoneNumber: string,
  templateId: string,
  variables: Record<string, string>,
  countryCode: string = "91"
) {
  const message = formatWhatsAppTemplate(templateId, variables);
  return openWhatsApp(phoneNumber, message, countryCode);
}

export function openWhatsApp(
  phoneNumber: string,
  message: string = "",
  countryCode: string = "91"
) {
  try {
    const { webUrl } = createWhatsAppUrl(phoneNumber, message, countryCode);

    // Always use web URL for better compatibility
    window.open(webUrl, "_blank");
  } catch (err) {
    console.error("WhatsApp open failed:", err);
    alert("Unable to open WhatsApp. Please check phone number.");
  }
}

// -------------------------------------------
// Preview for UI (no encoding)
// -------------------------------------------
export function generatePreview(templateId: string, variables: Record<string, string>) {
  return formatWhatsAppTemplate(templateId, variables);
}


// -------------------------------------------
// Phone Validation
// -------------------------------------------
export function isValidWhatsAppNumber(phone: string): boolean {
  const clean = phone.replace(/\D/g, "");
  // Remove country code for validation
  let numberOnly = clean;
  if (clean.startsWith("91") && clean.length > 10) {
    numberOnly = clean.slice(2);
  }
  // Must be 10 digits after removing country code
  return numberOnly.length === 10;
}
