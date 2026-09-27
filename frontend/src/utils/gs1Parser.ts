/**
 * GS1 & Pharmaceutical Barcode Payload Parser
 *
 * Supports parsing of:
 * - GS1 Element Strings with Application Identifiers in brackets: (01)08901234567890(10)BATCH...(17)280109(21)SER...
 * - GS1 Digital Link URLs: https://.../01/08901234567890/10/BATCH.../21/SER...?17=280109
 * - Plain AI-concatenated strings: 01089012345678901728010910BATCH...
 * - Pipe-delimited strings: GTIN|BATCH|SERIAL|EXPIRY
 * - JSON-formatted payloads: {"gtin": "...", "batch": "...", ...}
 * - Plain numeric GTIN / EAN barcode strings
 */

export interface ParsedGS1Payload {
  gtin?: string;
  batch?: string;
  expiry?: string;
  serial?: string;
  manufacturingDate?: string;
  rawPayload: string;
  format: 'GS1_BRACKETS' | 'GS1_DIGITAL_LINK' | 'GS1_PLAIN' | 'PIPE' | 'JSON' | 'PLAIN_IDENTIFIER' | 'UNKNOWN';
  additionalAIs?: Record<string, string>;
}

// Common GS1 Application Identifiers
const AI_DEFINITIONS: Record<string, { key: keyof ParsedGS1Payload; label: string; fixedLength?: number }> = {
  '01': { key: 'gtin', label: 'GTIN', fixedLength: 14 },
  '02': { key: 'gtin', label: 'Content GTIN', fixedLength: 14 },
  '10': { key: 'batch', label: 'Batch / Lot Number' },
  '17': { key: 'expiry', label: 'Expiration Date (YYMMDD)', fixedLength: 6 },
  '11': { key: 'manufacturingDate', label: 'Manufacturing Date (YYMMDD)', fixedLength: 6 },
  '21': { key: 'serial', label: 'Serial Number' },
};

/**
 * Format YYMMDD into YYYY-MM-DD
 */
export function formatGS1Date(yymmdd: string): string {
  if (!yymmdd || yymmdd.length !== 6) return yymmdd;
  const yy = parseInt(yymmdd.substring(0, 2), 10);
  const mm = yymmdd.substring(2, 4);
  const dd = yymmdd.substring(4, 6);

  // If yy >= 50 assume 19yy, else 20yy
  const century = yy >= 50 ? '19' : '20';
  const yyyy = `${century}${yymmdd.substring(0, 2)}`;

  // DD of 00 means last day of month in GS1 standard, normalize to valid date
  const day = dd === '00' ? '28' : dd;
  return `${yyyy}-${mm}-${day}`;
}

/**
 * Parse any raw decoded barcode / QR / DataMatrix string into structured pharmaceutical fields.
 */
export function parseGS1Payload(raw: string): ParsedGS1Payload {
  const trimmed = (raw || '').trim();

  const result: ParsedGS1Payload = {
    rawPayload: trimmed,
    format: 'UNKNOWN',
    additionalAIs: {},
  };

  if (!trimmed) {
    return result;
  }

  // 1. JSON Payload attempt
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const data = JSON.parse(trimmed);
      result.format = 'JSON';
      result.gtin = data.gtin || data.product_identifier || data.pid || data.id;
      result.batch = data.batch || data.batch_number || data.lot;
      result.serial = data.serial || data.serial_number || data.sn;
      result.expiry = data.expiry || data.expiry_date || data.exp;
      result.manufacturingDate = data.manufacturing_date || data.mfg_date;
      return result;
    } catch {
      // Not valid JSON, continue to other parsers
    }
  }

  // 2. GS1 Digital Link URL (e.g. https://id.gs1.org/01/08901234567890/10/BATCH...)
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      const pathSegments = url.pathname.split('/').filter(Boolean);

      let isDigitalLink = false;
      for (let i = 0; i < pathSegments.length; i += 2) {
        const ai = pathSegments[i];
        const val = pathSegments[i + 1];
        if (ai && val && AI_DEFINITIONS[ai]) {
          isDigitalLink = true;
          const def = AI_DEFINITIONS[ai];
          if (def.key === 'expiry' || def.key === 'manufacturingDate') {
            (result as any)[def.key] = val.length === 6 ? formatGS1Date(val) : val;
          } else {
            (result as any)[def.key] = val;
          }
        }
      }

      // Check query params for additional AIs (e.g. ?17=280109&21=SER123)
      url.searchParams.forEach((val, ai) => {
        if (AI_DEFINITIONS[ai]) {
          isDigitalLink = true;
          const def = AI_DEFINITIONS[ai];
          if (def.key === 'expiry' || def.key === 'manufacturingDate') {
            (result as any)[def.key] = val.length === 6 ? formatGS1Date(val) : val;
          } else {
            (result as any)[def.key] = val;
          }
        }
      });

      if (isDigitalLink) {
        result.format = 'GS1_DIGITAL_LINK';
        return result;
      }
    } catch {
      // invalid URL format, continue
    }
  }

  // 3. GS1 with Bracketed AIs: (01)08901234567890(10)BATCH-2026-001(17)280109(21)SER123
  if (trimmed.includes('(') && trimmed.includes(')')) {
    const regex = /\((\d{2,4})\)([^()]+)/g;
    let match: RegExpExecArray | null;
    let found = false;

    while ((match = regex.exec(trimmed)) !== null) {
      found = true;
      const ai = match[1];
      const val = match[2].trim();

      if (AI_DEFINITIONS[ai]) {
        const def = AI_DEFINITIONS[ai];
        if (def.key === 'expiry' || def.key === 'manufacturingDate') {
          (result as any)[def.key] = val.length === 6 ? formatGS1Date(val) : val;
        } else {
          (result as any)[def.key] = val;
        }
      } else if (result.additionalAIs) {
        result.additionalAIs[ai] = val;
      }
    }

    if (found) {
      result.format = 'GS1_BRACKETS';
      return result;
    }
  }

  // 4. Pipe-delimited string: GTIN|BATCH|SERIAL|EXPIRY
  if (trimmed.includes('|')) {
    const parts = trimmed.split('|').map((p) => p.trim());
    result.format = 'PIPE';
    if (parts[0]) result.gtin = parts[0];
    if (parts[1]) result.batch = parts[1];
    if (parts[2]) result.serial = parts[2];
    if (parts[3]) result.expiry = parts[3];
    return result;
  }

  // 5. Plain GS1 Application Identifier String without brackets
  // Check if starts with '01' followed by 14 digits
  if (trimmed.startsWith('01') && trimmed.length >= 16 && /^\d{16}/.test(trimmed)) {
    result.format = 'GS1_PLAIN';
    result.gtin = trimmed.substring(2, 16);

    let remaining = trimmed.substring(16);

    // Look for (17) YYMMDD
    if (remaining.startsWith('17') && remaining.length >= 8) {
      result.expiry = formatGS1Date(remaining.substring(2, 8));
      remaining = remaining.substring(8);
    }

    // Look for (10) Batch or (21) Serial
    if (remaining.startsWith('10')) {
      const nextAiIndex = remaining.search(/(?:17|21)\d/);
      if (nextAiIndex > 2) {
        result.batch = remaining.substring(2, nextAiIndex);
        remaining = remaining.substring(nextAiIndex);
      } else {
        result.batch = remaining.substring(2);
        remaining = '';
      }
    }

    if (remaining.startsWith('21')) {
      result.serial = remaining.substring(2);
    }

    return result;
  }

  // 6. Plain product identifier fallback (EAN-13, GTIN-14, custom alphanumeric identifier)
  result.format = 'PLAIN_IDENTIFIER';
  result.gtin = trimmed;
  return result;
}
