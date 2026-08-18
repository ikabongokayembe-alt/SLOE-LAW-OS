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
  firmName: string;
  clientName: string;
  matterTitle: string;
  currency: string | null;
  locale: string;
  entries: InvoiceLineEntry[];
}

export interface InvoicePdfResult {
  blob: Blob;
  totalMinutes: number;
  // Null only when NOT ONE covered entry had a rate set — never a
  // fabricated stand-in number. Otherwise the sum of just the rated
  // entries (see the "not included" footnote logic below) — a partial,
  // honestly-labelled total beats a wrong complete-looking one.
  totalAmount: number | null;
}

export function generateInvoicePdf(input: InvoicePdfInput): InvoicePdfResult {
  const { invoiceNumber, issuedDate, firmName, clientName, matterTitle, currency, locale, entries } = input;

  const totalMinutes = entries.reduce((sum, e) => sum + e.duration_minutes, 0);
  const ratedEntries = entries.filter(e => e.rate !== null && e.rate !== undefined);
  const totalAmount = ratedEntries.length > 0
    ? ratedEntries.reduce((sum, e) => sum + (computeAmount(e.duration_minutes, e.rate) ?? 0), 0)
    : null;
  const unratedCount = entries.length - ratedEntries.length;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('INVOICE', marginX, 56);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(firmName, pageWidth - marginX, 40, { align: 'right' });
  doc.text(`Invoice #${invoiceNumber}`, pageWidth - marginX, 54, { align: 'right' });
  doc.text(`Issued ${formatDateOnly(issuedDate, locale, { day: 'numeric', month: 'short', year: 'numeric' })}`, pageWidth - marginX, 68, { align: 'right' });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('BILL TO', marginX, 92);
  doc.setFont('helvetica', 'normal');
  doc.text(clientName, marginX, 106);

  doc.setFont('helvetica', 'bold');
  doc.text('MATTER', marginX, 128);
  doc.setFont('helvetica', 'normal');
  doc.text(matterTitle, marginX, 142);

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
    startY: 164,
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

  // jspdf-autotable stamps the table's final Y position onto the doc
  // instance for whatever renders after it -- reading it back here is the
  // documented way to continue laying out content below a table of
  // unknown height, rather than guessing a fixed offset.
  const finalY = (doc as any).lastAutoTable?.finalY ?? 164;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(`Total hours: ${formatHours(totalMinutes)}`, pageWidth - marginX, finalY + 24, { align: 'right' });
  doc.text(
    totalAmount !== null ? `Total due: ${formatAmount(totalAmount, currency, locale)}` : 'Total due: — (no rate set on any entry)',
    pageWidth - marginX, finalY + 40, { align: 'right' }
  );

  if (unratedCount > 0 && totalAmount !== null) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(
      `* Total reflects only entries with a billing rate set. ${unratedCount} entr${unratedCount === 1 ? 'y has' : 'ies have'} no rate and ${unratedCount === 1 ? 'is' : 'are'} not included above.`,
      marginX, finalY + 60
    );
  }

  return { blob: doc.output('blob'), totalMinutes, totalAmount };
}
