export type ServiceAccountJson = Record<string, any> | null;

const DOUBLE_QUOTE = '"';

function isWrappedInQuotes(value: string): boolean {
  if (!value) return false;
  const first = value[0];
  const last = value[value.length - 1];
  return (first === DOUBLE_QUOTE && last === DOUBLE_QUOTE) || (first === "'" && last === "'");
}

function normalizePrivateKey(input: unknown): string {
  return String(input ?? '')
    .replace(/\r/g, '')
    .replace(/\\n/g, '\n');
}

/**
 * Parse and normalize a Google Service Account JSON string/object.
 * Ensures the payload is parsed exactly once and private key newlines are handled safely.
 */
export function parseServiceAccountJson(raw: unknown): ServiceAccountJson {
  if (raw === null || raw === undefined) return null;

  let working: unknown = raw;

  try {
    if (typeof working === 'string') {
      let trimmed = working.trim();
      if (!trimmed) return null;

      // Handle double-stringified content: "{...}" or '\n' heavy strings
      if (isWrappedInQuotes(trimmed)) {
        try {
          trimmed = JSON.parse(trimmed);
        } catch (error) {
          console.warn('⚠️ Failed to unwrap quoted service account JSON. Using raw string.', error);
        }
      }

      working = JSON.parse(trimmed);
    } else if (typeof working === 'object') {
      // Clone objects to avoid unintended mutations downstream
      working = JSON.parse(JSON.stringify(working));
    } else {
      return null;
    }

    if (!working || typeof working !== 'object') return null;

    const parsed = working as Record<string, any>;

    if (parsed.private_key) {
      const normalized = normalizePrivateKey(parsed.private_key);
      parsed.private_key = normalized;
    }

    return parsed;
  } catch (error) {
    console.error('❌ Invalid service account JSON:', error);
    return null;
  }
}

export function stringifyServiceAccountJson(value: ServiceAccountJson): string | null {
  if (!value) return null;
  try {
    return JSON.stringify(value);
  } catch (error) {
    console.error('❌ Failed to stringify service account JSON:', error);
    return null;
  }
}
