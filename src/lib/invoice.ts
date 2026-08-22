// Real invoice PDF generation from unbilled time entries (product-audit
// Gap 2). This is the ONLY place invoice content is composed — both the
// PDF a user downloads immediately after generating and the PDF stored
// for later retrieval come from this exact same function, so there is
// never a version that drifts from what's on file.
//
// No payment status, no amount-due tracking, no "paid" concept — that's
// the separate, out-of-scope LawPay task. This produces a real, correct
// line-item document and nothing more.
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { computeAmount, formatAmount, formatHours } from './timeEntries';
import { formatDateOnly } from './dates';

export interface InvoiceLineEntry {
  id: string;
  date: string; // date-only, e.g. "2026-06-01"
  description?: string;
  duration_minutes: number;
  rate: number | null;
}

export interface InvoicePdfInput {
  invoiceNumber: string;
  issuedDate: string; // date-only
  dueDate?: string;   // e.g. "Due upon receipt"
  firmName: string;
  firmRegion?: string | null;
  firmCountry?: string | null;
  firmPhone?: string | null;
  lawpayUrl?: string | null;
  clientName: string;
  matterTitle: string;
  currency: string | null;
  locale: string;
  entries: InvoiceLineEntry[];
}

export interface InvoicePdfResult {
  blob: Blob;
  totalMinutes: number;
  totalAmount: number | null;
}

export function generateInvoicePdf(input: InvoicePdfInput): InvoicePdfResult {
  const {
    invoiceNumber,
    issuedDate,
    dueDate = 'Due upon receipt',
    firmName,
    firmRegion,
    firmCountry,
    firmPhone,
    lawpayUrl,
    clientName,
    matterTitle,
    currency,
    locale,
    entries,
  } = input;

  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);
  const ratedEntries = entries.filter(e => e.rate !== null && e.rate !== undefined);
  const totalAmount = ratedEntries.length > 0
    ? ratedEntries.reduce((sum, e) => sum + (computeAmount(e.duration_minutes, e.rate) ?? 0), 0)
    : null;
  const unratedCount = entries.length - ratedEntries.length;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;

  // Header Title on Left
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(20, 26, 38);
  doc.text('INVOICE', marginX, 50);

  // Right-aligned Header Info
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20, 26, 38);

  let rightY = 36;
  doc.text(firmName, pageWidth - marginX, rightY, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(80, 80, 80);

  const locationStr = [firmRegion, firmCountry].filter(Boolean).join(', ');
  if (locationStr) {
    rightY += 13;
    doc.text(locationStr, pageWidth - marginX, rightY, { align: 'right' });
  }

  if (firmPhone) {
    rightY += 13;
    doc.text(`Tel: ${firmPhone}`, pageWidth - marginX, rightY, { align: 'right' });
  }

  rightY += 15;
  doc.text(`Invoice #${invoiceNumber}`, pageWidth - marginX, rightY, { align: 'right' });
  rightY += 13;
  doc.text(`Issued: ${formatDateOnly(issuedDate, locale, { day: 'numeric', month: 'short', year: 'numeric' })}`, pageWidth - marginX, rightY, { align: 'right' });
  rightY += 13;
  doc.text(`Due Date: ${dueDate}`, pageWidth - marginX, rightY, { align: 'right' });

  // Bill To & Matter on Left
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 26, 38);
  doc.text('BILL TO', marginX, 90);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(clientName, marginX, 104);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 26, 38);
  doc.text('MATTER', marginX, 126);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(40, 40, 40);
  doc.text(matterTitle, marginX, 140);

  const rows = entries.map(e => {
    const amount = computeAmount(e.duration_minutes, e.rate);
    return [
      formatDateOnly(e.date, locale, { day: 'numeric', month: 'short', year: 'numeric' }),
      e.description || '—',
      formatHours(e.duration_minutes),
      e.rate !== null && e.rate !== undefined ? formatAmount(e.rate, currency, locale) : '—',
      amount !== null ? formatAmount(amount, currency, locale) : '—',
    ];
  });

  autoTable(doc, {
    startY: 160,
    head: [['Date', 'Description', 'Hours', 'Rate', 'Amount']],
    body: rows,
    margin: { left: marginX, right: marginX },
    styles: { fontSize: 9, cellPadding: 6 },
    headStyles: { fillColor: [20, 26, 38], textColor: [255, 255, 255] },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });

  const finalY = (doc as any).lastAutoTable?.finalY ?? 160;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(20, 26, 38);
  doc.text(`Total hours: ${formatHours(totalMinutes)}`, pageWidth - marginX, finalY + 22, { align: 'right' });
  doc.text(
    totalAmount !== null ? `Total due: ${formatAmount(totalAmount, currency, locale)}` : 'Total due: — (no rate set on any entry)',
    pageWidth - marginX, finalY + 38, { align: 'right' }
  );

  let currentY = finalY + 54;

  if (unratedCount > 0 && totalAmount !== null) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(
      `* Total reflects only entries with a billing rate set. ${unratedCount} entr${unratedCount === 1 ? 'y has' : 'ies have'} no rate and ${unratedCount === 1 ? 'is' : 'are'} not included above.`,
      marginX, currentY
    );
    currentY += 20;
  }

  // Payment Instructions Section
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(20, 26, 38);
  doc.text('PAYMENT INSTRUCTIONS', marginX, currentY);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(60, 60, 60);

  if (lawpayUrl && lawpayUrl.trim().length > 0) {
    doc.text(
      `Pay online via LawPay: ${lawpayUrl.trim()}`,
      marginX,
      currentY + 14,
      { maxWidth: pageWidth - marginX * 2 }
    );
  } else {
    doc.text(
      'Please contact the firm directly to arrange payment.',
      marginX,
      currentY + 14,
      { maxWidth: pageWidth - marginX * 2 }
    );
  }

  return { blob: doc.output('blob'), totalMinutes, totalAmount };
}
