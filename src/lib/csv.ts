// Minimal CSV parser — handles quoted fields (including commas and escaped
// quotes within them), which a naive split(',') can't. Deliberately not
// pulling in a library for this; the parsing needs here are simple enough.

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') { field += '"'; i++; }
      else if (char === '"') { inQuotes = false; }
      else { field += char; }
    } else {
      if (char === '"') { inQuotes = true; }
      else if (char === ',') { row.push(field); field = ''; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && next === '\n') i++;
        row.push(field);
        field = '';
        if (row.some(f => f.trim() !== '')) rows.push(row);
        row = [];
      } else {
        field += char;
      }
    }
  }
  // Final field/row if the file doesn't end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some(f => f.trim() !== '')) rows.push(row);
  }

  return rows;
}

export function csvToObjects(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(row => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = (row[i] ?? '').trim(); });
    return obj;
  });
}

// Writer side — the exact inverse of the parser above: quote a field only
// when it actually needs it (contains a comma, quote, or newline), and
// double up any embedded quotes. No export capability existed anywhere
// in this app before Billing Phase 1; this lives here rather than in a
// new file since it's the natural counterpart to the parser already above.
function csvEscape(field: string): string {
  if (/[",\r\n]/.test(field)) {
    return `"${field.replace(/"/g, '""')}"`;
  }
  return field;
}

export function toCsv(headers: string[], rows: (string | number)[][]): string {
  const lines = [headers.map(h => csvEscape(String(h))).join(',')];
  for (const row of rows) lines.push(row.map(v => csvEscape(String(v))).join(','));
  return lines.join('\r\n');
}

// Triggers a real browser download of the given CSV text — no server
// round-trip, the export never leaves the browser.
export function downloadCsv(filename: string, csvText: string): void {
  const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
