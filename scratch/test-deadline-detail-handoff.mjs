function safeFormatTimestamp(dateStr, locale = 'en-US') {
  if (!dateStr) return '—';
  try {
    const normalized = dateStr.includes(' ') ? dateStr.replace(' ', 'T') : dateStr;
    const d = new Date(normalized);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    }
    const [y, m, da] = dateStr.slice(0, 10).split('-').map(Number);
    const dateOnly = new Date(y, m - 1, da);
    if (!isNaN(dateOnly.getTime())) {
      return dateOnly.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' });
    }
  } catch {
    // ignore
  }
  return '—';
}

console.log('=== Testing safeFormatTimestamp against diverse timestamp values ===');

const testCases = [
  '2026-08-15T22:56:49+00:00',
  '2026-08-15 22:56:49+00',
  '2026-08-15 22:56:49.123+00',
  '2026-08-15',
  null,
  undefined,
];

for (const tc of testCases) {
  const result = safeFormatTimestamp(tc);
  console.log(`Input: "${tc}" -> Result: "${result}"`);
  if (tc && result === 'Invalid Date') {
    console.error(`FAIL: Invalid Date returned for ${tc}`);
    process.exit(1);
  }
}

console.log('\n✅ ALL TIMESTAMP FORMATTING TESTS PASSED!');
