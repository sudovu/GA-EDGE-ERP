export interface ReceiptPrintData {
  shopName: string;
  shopPhone: string;
  shopEmail: string;
  invoiceNo: string;
  date: Date;
  cashierName: string;
  customerName: string;
  customerPhone: string;
  items: Array<{
    name: string;
    sku: string;
    quantity: number;
    unitPrice: string;
    totalPrice: string;
    serials?: string[];
  }>;
  subTotal: string;
  discount: string;
  taxAmount: string;
  grandTotal: string;
  paidAmount: string;
  changeAmount: string;
  balanceDue: string;
  payments: Array<{
    method: string;
    amount: string;
    referenceNo?: string | null;
  }>;
}

export class EscPosService {
  // ESC/POS Command Constants
  private static readonly ESC = 0x1b;
  private static readonly GS = 0x1d;

  private static readonly CMD_INIT = Buffer.from([EscPosService.ESC, 0x40]); // ESC @
  private static readonly CMD_ALIGN_LEFT = Buffer.from([EscPosService.ESC, 0x61, 0x00]); // ESC a 0
  private static readonly CMD_ALIGN_CENTER = Buffer.from([EscPosService.ESC, 0x61, 0x01]); // ESC a 1
  private static readonly CMD_ALIGN_RIGHT = Buffer.from([EscPosService.ESC, 0x61, 0x02]); // ESC a 2
  private static readonly CMD_BOLD_ON = Buffer.from([EscPosService.ESC, 0x45, 0x01]); // ESC E 1
  private static readonly CMD_BOLD_OFF = Buffer.from([EscPosService.ESC, 0x45, 0x00]); // ESC E 0
  private static readonly CMD_DOUBLE_SIZE = Buffer.from([EscPosService.GS, 0x21, 0x11]); // GS ! 0x11
  private static readonly CMD_NORMAL_SIZE = Buffer.from([EscPosService.GS, 0x21, 0x00]); // GS ! 0x00
  private static readonly CMD_FEED_AND_CUT = Buffer.from([EscPosService.GS, 0x56, 0x41, 0x03]); // GS V A 3

  /**
   * Generates a raw ESC/POS binary byte stream.
   * Can be sent directly to raw TCP (port 9100) or USB /dev/usb/lp0 on Ubuntu.
   */
  static generateBinaryBuffer(data: ReceiptPrintData, paperWidth: 80 | 58 = 80): Buffer {
    const buffers: Buffer[] = [];
    const maxCols = paperWidth === 80 ? 42 : 32;

    const append = (buf: Buffer) => buffers.push(buf);
    const appendText = (text: string) => buffers.push(Buffer.from(text, 'utf-8'));
    const appendLine = (text: string = '') => appendText(`${text}\n`);

    const formatRow = (left: string, right: string): string => {
      const spaceNeeded = maxCols - (left.length + right.length);
      if (spaceNeeded <= 0) {
        return `${left.slice(0, maxCols - right.length - 1)} ${right}\n`;
      }
      return `${left}${' '.repeat(spaceNeeded)}${right}\n`;
    };

    const separator = '-'.repeat(maxCols);

    // 1. Initialize
    append(this.CMD_INIT);

    // 2. Header
    append(this.CMD_ALIGN_CENTER);
    append(this.CMD_BOLD_ON);
    append(this.CMD_DOUBLE_SIZE);
    appendLine(data.shopName.toUpperCase());
    append(this.CMD_NORMAL_SIZE);
    append(this.CMD_BOLD_OFF);
    appendLine(`Tel: ${data.shopPhone}`);
    appendLine(data.shopEmail);
    appendLine(`VAT No: 600123987 | TAX INVOICE`);
    appendLine(separator);

    // 3. Invoice & Customer Metadata
    append(this.CMD_ALIGN_LEFT);
    append(Buffer.from(formatRow(`Invoice: ${data.invoiceNo}`, `Date: ${new Date(data.date).toLocaleDateString()}`)));
    append(Buffer.from(formatRow(`Cashier: ${data.cashierName}`, `Time: ${new Date(data.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`)));
    append(Buffer.from(formatRow(`Customer: ${data.customerName}`, `Phone: ${data.customerPhone}`)));
    appendLine(separator);

    // 4. Line Items
    append(this.CMD_BOLD_ON);
    append(Buffer.from(formatRow('Item Description', 'Amount')));
    append(this.CMD_BOLD_OFF);
    appendLine(separator);

    for (const item of data.items) {
      appendLine(item.name);
      const detailStr = `  ${item.quantity} x ${item.unitPrice}`;
      append(Buffer.from(formatRow(detailStr, item.totalPrice)));
      if (item.serials && item.serials.length > 0) {
        appendLine(`  SN: ${item.serials.join(', ')}`);
      }
    }
    appendLine(separator);

    // 5. Financial Summary
    append(Buffer.from(formatRow('Sub Total:', data.subTotal)));
    if (parseFloat(data.discount) > 0) {
      append(Buffer.from(formatRow('Discount:', `-${data.discount}`)));
    }
    append(Buffer.from(formatRow('VAT (13%):', data.taxAmount)));
    append(this.CMD_BOLD_ON);
    append(this.CMD_DOUBLE_SIZE);
    append(Buffer.from(formatRow('GRAND TOTAL:', data.grandTotal)));
    append(this.CMD_NORMAL_SIZE);
    append(this.CMD_BOLD_OFF);
    appendLine(separator);

    // 6. Payment Breakdown
    append(this.CMD_BOLD_ON);
    appendLine('PAYMENT BREAKDOWN:');
    append(this.CMD_BOLD_OFF);
    for (const p of data.payments) {
      const label = p.referenceNo ? `  ${p.method} (${p.referenceNo})` : `  ${p.method}`;
      append(Buffer.from(formatRow(label, p.amount)));
    }

    if (parseFloat(data.changeAmount) > 0) {
      append(Buffer.from(formatRow('Cash Change Returned:', data.changeAmount)));
    }
    if (parseFloat(data.balanceDue) > 0) {
      append(this.CMD_BOLD_ON);
      append(Buffer.from(formatRow('Customer Balance Due:', data.balanceDue)));
      append(this.CMD_BOLD_OFF);
    }

    appendLine(separator);

    // 7. Footer & Barcode Representation
    append(this.CMD_ALIGN_CENTER);
    appendLine('Thank you for choosing GA-ERP!');
    appendLine('Goods once sold can be exchanged within 7 days');
    appendLine('with original invoice.');
    appendLine(`*${data.invoiceNo}*`);
    appendLine();

    // 8. Feed & Partial Cut
    append(this.CMD_FEED_AND_CUT);

    return Buffer.concat(buffers);
  }

  /**
   * Renders a printable monospaced text version for logging, browser preview, or network thermal dump.
   */
  static renderPlainText(data: ReceiptPrintData, maxCols: number = 42): string {
    const lines: string[] = [];
    const sep = '='.repeat(maxCols);
    const subSep = '-'.repeat(maxCols);

    const pad = (left: string, right: string) => {
      const space = maxCols - (left.length + right.length);
      if (space <= 0) return `${left.slice(0, maxCols - right.length - 1)} ${right}`;
      return `${left}${' '.repeat(space)}${right}`;
    };

    lines.push(sep);
    lines.push(data.shopName.toUpperCase().padStart((maxCols + data.shopName.length) / 2));
    lines.push(`Tel: ${data.shopPhone} | ${data.shopEmail}`.padStart((maxCols + 25) / 2));
    lines.push('TAX INVOICE (VAT: 600123987)'.padStart((maxCols + 28) / 2));
    lines.push(sep);
    lines.push(pad(`Invoice: ${data.invoiceNo}`, `Date: ${new Date(data.date).toLocaleDateString()}`));
    lines.push(pad(`Customer: ${data.customerName}`, `Phone: ${data.customerPhone}`));
    lines.push(subSep);
    lines.push(pad('Description', 'Total'));
    lines.push(subSep);

    for (const item of data.items) {
      lines.push(item.name);
      lines.push(pad(`  ${item.quantity} @ ${item.unitPrice}`, item.totalPrice));
      if (item.serials && item.serials.length > 0) {
        lines.push(`  S/N: ${item.serials.join(', ')}`);
      }
    }
    lines.push(subSep);
    lines.push(pad('Subtotal:', data.subTotal));
    if (parseFloat(data.discount) > 0) {
      lines.push(pad('Discount:', `-${data.discount}`));
    }
    lines.push(pad('VAT (13%):', data.taxAmount));
    lines.push(pad('GRAND TOTAL:', data.grandTotal));
    lines.push(subSep);
    for (const p of data.payments) {
      lines.push(pad(`Paid via ${p.method}:`, p.amount));
    }
    if (parseFloat(data.changeAmount) > 0) {
      lines.push(pad('Change Returned:', data.changeAmount));
    }
    if (parseFloat(data.balanceDue) > 0) {
      lines.push(pad('Store Credit (AR):', data.balanceDue));
    }
    lines.push(sep);
    lines.push('Thank you for shopping with us!'.padStart((maxCols + 30) / 2));
    lines.push(sep);

    return lines.join('\n');
  }
}
