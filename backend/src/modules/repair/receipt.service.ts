export interface ReceiptJobData {
  jobNumber: string;
  receivedDate: Date;
  customerName: string;
  customerPhone: string;
  deviceType: string;
  brand: string;
  model: string;
  serialNumber: string | null;
  reportedFault: string;
  physicalCondition: string | null;
  accessories: string | null;
  estimatedCost: string;
  warrantyDays: number;
  status: string;
}

export class ReceiptService {
  static renderJobCardHtml(job: ReceiptJobData): string {
    const formattedDate = new Date(job.receivedDate).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Job Card - ${job.jobNumber}</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
    font-size: 12px;
    line-height: 1.4;
    color: #111;
    margin: 0;
    padding: 16px;
    width: 80mm;
    box-sizing: border-box;
  }
  @media print {
    body { padding: 0; width: 100%; }
    @page { margin: 4mm; }
  }
  .header { text-align: center; border-bottom: 2px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
  .shop-title { font-size: 16px; font-weight: 800; text-transform: uppercase; }
  .shop-sub { font-size: 10px; color: #444; }
  .job-number { font-size: 18px; font-weight: 900; margin: 8px 0; letter-spacing: 1px; }
  .barcode { font-family: monospace; font-size: 14px; font-weight: bold; background: #eee; padding: 2px 4px; display: inline-block; }
  .section { margin-top: 8px; border-bottom: 1px solid #ddd; padding-bottom: 6px; }
  .row { display: flex; justify-content: space-between; margin: 2px 0; }
  .label { font-weight: bold; color: #333; }
  .value { text-align: right; max-width: 60%; word-break: break-word; }
  .fault-box { background: #f9f9f9; padding: 6px; border-left: 3px solid #222; margin-top: 4px; }
  .disclaimer { font-size: 9px; color: #555; text-align: justify; margin-top: 10px; }
  .sig-block { margin-top: 24px; border-top: 1px solid #000; display: flex; justify-content: space-between; padding-top: 4px; font-size: 10px; }
</style>
</head>
<body>
  <div class="header">
    <div class="shop-title">NEXUSEDGE SOLUTIONS</div>
    <div class="shop-sub">Computer, IoT & Network Workshop</div>
    <div class="shop-sub">Phone: +977-1-4455660 | Kathmandu</div>
    <div class="job-number">${job.jobNumber}</div>
    <div class="barcode">*${job.jobNumber}*</div>
  </div>

  <div class="section">
    <div class="row"><span class="label">Received:</span><span class="value">${formattedDate}</span></div>
    <div class="row"><span class="label">Customer:</span><span class="value">${job.customerName}</span></div>
    <div class="row"><span class="label">Contact:</span><span class="value">${job.customerPhone}</span></div>
  </div>

  <div class="section">
    <div class="row"><span class="label">Device:</span><span class="value">${job.deviceType}</span></div>
    <div class="row"><span class="label">Brand/Model:</span><span class="value">${job.brand} ${job.model}</span></div>
    <div class="row"><span class="label">Serial/MAC:</span><span class="value">${job.serialNumber || 'N/A'}</span></div>
    <div class="row"><span class="label">Accessories:</span><span class="value">${job.accessories || 'None'}</span></div>
    <div class="row"><span class="label">Condition:</span><span class="value">${job.physicalCondition || 'Normal wear'}</span></div>
  </div>

  <div class="section">
    <span class="label">Reported Fault:</span>
    <div class="fault-box">${job.reportedFault}</div>
  </div>

  <div class="section">
    <div class="row"><span class="label">Estimated Cost:</span><span class="value">NPR ${job.estimatedCost}</span></div>
    <div class="row"><span class="label">Service Warranty:</span><span class="value">${job.warrantyDays} Days</span></div>
    <div class="row"><span class="label">Intake Status:</span><span class="value">${job.status}</span></div>
  </div>

  <div class="disclaimer">
    <strong>Terms & Disclaimers:</strong>
    1. Goods left unclaimed over 45 days after completion notice may incur storage fees or be recycled.
    2. NexusEdge is not liable for data loss. Customers must back up critical data prior to repair.
    3. Original job card must be surrendered upon hardware pickup.
  </div>

  <div class="sig-block">
    <span>Customer Signature</span>
    <span>Technician Seal</span>
  </div>
</body>
</html>`;
  }
}
