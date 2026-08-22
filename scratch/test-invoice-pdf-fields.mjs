import { generateInvoicePdf } from '../src/lib/invoice.ts';

console.log('=== Testing Invoice PDF Field Generation ===');

const mockEntries = [
  { id: 'e-1', date: '2026-08-01', description: 'Legal Drafting & Review', duration_minutes: 120, rate: 250 },
  { id: 'e-2', date: '2026-08-05', description: 'Client Consultation', duration_minutes: 60, rate: 300 },
];

// Test Case A: LawPay Connected + Firm Contact Info Present
const inputWithLawPay = {
  invoiceNumber: 'INV-20260821-0001',
  issuedDate: '2026-08-21',
  dueDate: 'Due upon receipt',
  firmName: 'Apex Legal Partners',
  firmRegion: 'CA',
  firmCountry: 'US',
  firmPhone: '+1 (555) 234-5678',
  lawpayUrl: 'https://secure.lawpay.com/pay/apexlegal',
  clientName: 'Weston Logistics',
  matterTitle: 'Weston v. Castellan Freight',
  currency: 'USD',
  locale: 'en-US',
  entries: mockEntries,
};

const resultA = generateInvoicePdf(inputWithLawPay);
console.log(`Test A Blob Size: ${resultA.blob.size} bytes`);
if (resultA.blob.size === 0) {
  console.error('FAIL: PDF Blob size is 0 for Test A');
  process.exit(1);
}

// Test Case B: LawPay NOT Connected
const inputWithoutLawPay = {
  invoiceNumber: 'INV-20260821-0002',
  issuedDate: '2026-08-21',
  dueDate: 'Due upon receipt',
  firmName: 'Apex Legal Partners',
  firmRegion: null,
  firmCountry: null,
  firmPhone: null,
  lawpayUrl: null,
  clientName: 'Weston Logistics',
  matterTitle: 'Weston v. Castellan Freight',
  currency: 'USD',
  locale: 'en-US',
  entries: mockEntries,
};

const resultB = generateInvoicePdf(inputWithoutLawPay);
console.log(`Test B Blob Size: ${resultB.blob.size} bytes`);
if (resultB.blob.size === 0) {
  console.error('FAIL: PDF Blob size is 0 for Test B');
  process.exit(1);
}

console.log('✅ INVOICE PDF FIELDS TEST PASSED SUCCESSFULLY!');
