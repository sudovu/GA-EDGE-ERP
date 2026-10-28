import { PrismaClient, RepairStatus, MovementType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { LedgerService } from '../accounting/ledger.service.js';
import { ReceiptService } from './receipt.service.js';

export class RepairService {
  constructor(private prisma: PrismaClient) {}

  /**
   * Finite State Machine valid transition graph
   */
  private static readonly VALID_TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
    [RepairStatus.RECEIVED]: [
      RepairStatus.UNDER_DIAGNOSIS,
      RepairStatus.CANCELLED,
      RepairStatus.ON_HOLD,
    ],
    [RepairStatus.UNDER_DIAGNOSIS]: [
      RepairStatus.WAITING_FOR_CUSTOMER_APPROVAL,
      RepairStatus.WAITING_FOR_PARTS,
      RepairStatus.IN_REPAIR,
      RepairStatus.UNREPAIRABLE,
      RepairStatus.ON_HOLD,
      RepairStatus.CANCELLED,
    ],
    [RepairStatus.WAITING_FOR_CUSTOMER_APPROVAL]: [
      RepairStatus.IN_REPAIR,
      RepairStatus.WAITING_FOR_PARTS,
      RepairStatus.CANCELLED,
      RepairStatus.UNREPAIRABLE,
      RepairStatus.ON_HOLD,
    ],
    [RepairStatus.WAITING_FOR_PARTS]: [
      RepairStatus.IN_REPAIR,
      RepairStatus.ON_HOLD,
      RepairStatus.CANCELLED,
    ],
    [RepairStatus.IN_REPAIR]: [
      RepairStatus.TESTING_QC,
      RepairStatus.WAITING_FOR_PARTS,
      RepairStatus.UNREPAIRABLE,
      RepairStatus.ON_HOLD,
    ],
    [RepairStatus.TESTING_QC]: [
      RepairStatus.READY_FOR_COLLECTION,
      RepairStatus.IN_REPAIR, // Returned to bench if QC fails
      RepairStatus.ON_HOLD,
    ],
    [RepairStatus.READY_FOR_COLLECTION]: [
      RepairStatus.DELIVERED,
      RepairStatus.ON_HOLD,
    ],
    [RepairStatus.DELIVERED]: [
      RepairStatus.WARRANTY_RETURN, // Re-opened under warranty
    ],
    [RepairStatus.ON_HOLD]: [
      RepairStatus.UNDER_DIAGNOSIS,
      RepairStatus.WAITING_FOR_CUSTOMER_APPROVAL,
      RepairStatus.WAITING_FOR_PARTS,
      RepairStatus.IN_REPAIR,
      RepairStatus.CANCELLED,
    ],
    [RepairStatus.CANCELLED]: [],
    [RepairStatus.UNREPAIRABLE]: [
      RepairStatus.READY_FOR_COLLECTION, // Return unrepairable device to customer
    ],
    [RepairStatus.WARRANTY_RETURN]: [
      RepairStatus.UNDER_DIAGNOSIS,
      RepairStatus.IN_REPAIR,
    ],
  };

  /**
   * 1. Customer & Hardware Intake
   */
  async intakeJob(userId: string, data: any) {
    return this.prisma.$transaction(async (tx) => {
      // Upsert Customer based on phone
      const customer = await tx.customer.upsert({
        where: { phone: data.customer.phone },
        update: {
          fullName: data.customer.fullName,
          email: data.customer.email || undefined,
          address: data.customer.address || undefined,
        },
        create: {
          fullName: data.customer.fullName,
          phone: data.customer.phone,
          email: data.customer.email || null,
          address: data.customer.address || null,
        },
      });

      // Generate sequential unique Job Number: JOB-YYYYMMDD-XXXX
      const datePrefix = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const count = await tx.repairJob.count();
      const seq = String(count + 1).padStart(4, '0');
      const jobNumber = `JOB-${datePrefix}-${seq}`;

      const estimatedCostDecimal = data.estimatedCost !== undefined ? new Decimal(data.estimatedCost) : null;

      const job = await tx.repairJob.create({
        data: {
          jobNumber,
          customerId: customer.id,
          deviceType: data.deviceType,
          brand: data.brand,
          model: data.model,
          serialNumber: data.serialNumber || null,
          reportedFault: data.reportedFault,
          physicalCondition: data.physicalCondition || null,
          accessories: data.accessories || null,
          securityPin: data.securityPin || null,
          estimatedCost: estimatedCostDecimal,
          warrantyDays: data.warrantyDays ?? 30,
          status: RepairStatus.RECEIVED,
        },
        include: { customer: true },
      });

      // Log initial history record
      await tx.repairStatusHistory.create({
        data: {
          repairJobId: job.id,
          userId,
          fromStatus: RepairStatus.RECEIVED,
          toStatus: RepairStatus.RECEIVED,
          note: 'Initial hardware intake completed.',
        },
      });

      return job;
    });
  }

  /**
   * 2. Technician Diagnosis & Estimate Recording
   */
  async updateDiagnosis(userId: string, jobId: string, data: any) {
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.repairJob.findUnique({ where: { id: jobId } });
      if (!job) throw new Error('Repair job card not found.');

      if (
        job.status !== RepairStatus.RECEIVED &&
        job.status !== RepairStatus.UNDER_DIAGNOSIS &&
        job.status !== RepairStatus.ON_HOLD
      ) {
        throw new Error(`Cannot update diagnosis while job is in status: ${job.status}`);
      }

      const laborCost = data.laborCost !== undefined ? new Decimal(data.laborCost) : job.finalLaborCost;
      const totalCost = new Decimal(job.finalPartsCost).plus(laborCost);

      const updated = await tx.repairJob.update({
        where: { id: jobId },
        data: {
          technicianId: data.technicianId || userId,
          diagnosticReport: data.diagnosticReport,
          estimatedCost: new Decimal(data.estimatedCost),
          finalLaborCost: laborCost,
          totalCost,
          internalNotes: data.internalNotes ? `${job.internalNotes || ''}\n[Diag]: ${data.internalNotes}`.trim() : job.internalNotes,
          status: RepairStatus.UNDER_DIAGNOSIS,
        },
        include: { customer: true, technician: true },
      });

      await tx.repairStatusHistory.create({
        data: {
          repairJobId: jobId,
          userId,
          fromStatus: job.status,
          toStatus: RepairStatus.UNDER_DIAGNOSIS,
          note: `Diagnosis recorded: Estimate NPR ${data.estimatedCost}`,
        },
      });

      return updated;
    });
  }

  /**
   * 3. Customer Approval Gate
   */
  async recordCustomerApproval(userId: string, jobId: string, approval: { approved: boolean; notes?: string }) {
    return this.prisma.$transaction(async (tx) => {
      const job = await tx.repairJob.findUnique({ where: { id: jobId } });
      if (!job) throw new Error('Repair job card not found.');

      const nextStatus = approval.approved ? RepairStatus.IN_REPAIR : RepairStatus.CANCELLED;

      const updated = await tx.repairJob.update({
        where: { id: jobId },
        data: {
          customerApproved: approval.approved,
          approvedAt: approval.approved ? new Date() : null,
          status: nextStatus,
          internalNotes: approval.notes ? `${job.internalNotes || ''}\n[Approval]: ${approval.notes}`.trim() : job.internalNotes,
        },
      });

      await tx.repairStatusHistory.create({
        data: {
          repairJobId: jobId,
          userId,
          fromStatus: job.status,
          toStatus: nextStatus,
          note: approval.approved ? 'Customer approved estimate.' : `Customer rejected estimate: ${approval.notes || 'No reason'}`,
        },
      });

      return updated;
    });
  }

  /**
   * 4. State Machine Transition Guard
   */
  async transitionStatus(
    userId: string,
    jobId: string,
    params: {
      targetStatus: RepairStatus;
      note?: string;
      qcPassed?: boolean;
      qcNotes?: string;
      deliveredTo?: string;
    }
  ) {
    const { targetStatus, note, qcPassed, qcNotes, deliveredTo } = params;

    return this.prisma.$transaction(async (tx) => {
      const job = await tx.repairJob.findUnique({ where: { id: jobId } });
      if (!job) throw new Error('Repair job card not found.');

      const currentStatus = job.status;

      // Validate Transition Matrix
      const allowedTargets = RepairService.VALID_TRANSITIONS[currentStatus] || [];
      if (!allowedTargets.includes(targetStatus)) {
        throw new Error(
          `Invalid state transition: Cannot transition from ${currentStatus} to ${targetStatus}. Allowed: [${allowedTargets.join(', ')}]`
        );
      }

      // Business Rule: Customer approval check before repair proceeds
      if (
        (targetStatus === RepairStatus.IN_REPAIR || targetStatus === RepairStatus.WAITING_FOR_PARTS) &&
        job.estimatedCost &&
        job.estimatedCost.greaterThan(0) &&
        !job.customerApproved
      ) {
        throw new Error('Approval Required: Chargeable repair work cannot begin without explicit customer approval.');
      }

      // Business Rule: Quality Check verification before marking ready for collection
      if (targetStatus === RepairStatus.READY_FOR_COLLECTION && !job.qcPassed && !qcPassed) {
        throw new Error('QC Incomplete: Device cannot be marked READY_FOR_COLLECTION without passing Quality Control.');
      }

      // Business Rule: Handover confirmation required on delivery
      if (targetStatus === RepairStatus.DELIVERED && !deliveredTo && !job.deliveredTo) {
        throw new Error('Handover Incomplete: Recipient name (deliveredTo) must be recorded upon physical hardware delivery.');
      }

      const updateData: any = {
        status: targetStatus,
      };

      if (qcPassed !== undefined) {
        updateData.qcPassed = qcPassed;
        updateData.qcNotes = qcNotes || job.qcNotes;
      }

      if (targetStatus === RepairStatus.TESTING_QC || targetStatus === RepairStatus.READY_FOR_COLLECTION) {
        updateData.completedDate = new Date();
      }

      if (targetStatus === RepairStatus.DELIVERED) {
        updateData.deliveredDate = new Date();
        updateData.deliveredTo = deliveredTo || job.deliveredTo;
      }

      const updated = await tx.repairJob.update({
        where: { id: jobId },
        data: updateData,
        include: { customer: true, technician: true },
      });

      // Record immutable status audit log
      await tx.repairStatusHistory.create({
        data: {
          repairJobId: jobId,
          userId,
          fromStatus: currentStatus,
          toStatus: targetStatus,
          note: note || `Status changed from ${currentStatus} to ${targetStatus}`,
        },
      });

      return updated;
    });
  }

  /**
   * 5. Spare Part Consumption & Double-Entry Allocation
   */
  async attachSparePart(
    userId: string,
    jobId: string,
    params: { productId: string; quantity: number; serialNos?: string[] }
  ) {
    const { productId, quantity, serialNos } = params;

    return this.prisma.$transaction(async (tx) => {
      const job = await tx.repairJob.findUnique({ where: { id: jobId } });
      if (!job) throw new Error('Repair job card not found.');

      if (
        job.status !== RepairStatus.IN_REPAIR &&
        job.status !== RepairStatus.UNDER_DIAGNOSIS &&
        job.status !== RepairStatus.WAITING_FOR_PARTS
      ) {
        throw new Error(`Cannot attach parts to job in status: ${job.status}`);
      }

      // 1. Lock product row and verify stock
      const product = await tx.product.findUnique({ where: { id: productId } });
      if (!product) throw new Error(`Product not found: ${productId}`);

      if (product.stockQuantity < quantity) {
        throw new Error(
          `Insufficient stock for spare part "${product.name}". Available: ${product.stockQuantity}, Required: ${quantity}`
        );
      }

      // 2. Validate and reserve hardware serials if applicable
      if (serialNos && serialNos.length > 0) {
        if (serialNos.length !== quantity) {
          throw new Error(`Serial count mismatch. Required: ${quantity}, Given: ${serialNos.length}`);
        }

        const validSerials = await tx.productSerial.findMany({
          where: { productId, serialNo: { in: serialNos }, isSold: false },
        });

        if (validSerials.length !== quantity) {
          throw new Error('One or more serial numbers are invalid or already consumed.');
        }
      }

      const lineTotal = new Decimal(product.retailPrice).times(quantity);

      // 3. Create RepairPartUsage record
      const partUsage = await tx.repairPartUsage.create({
        data: {
          repairJobId: jobId,
          productId,
          quantity,
          unitPrice: product.retailPrice,
          totalPrice: lineTotal,
        },
      });

      // 4. Decrement inventory
      await tx.product.update({
        where: { id: productId },
        data: { stockQuantity: { decrement: quantity } },
      });

      // 5. Create stock movement
      const movement = await tx.stockMovement.create({
        data: {
          productId,
          userId,
          movementType: MovementType.REPAIR_CONSUMPTION,
          quantityDelta: -quantity,
          unitCost: product.costPrice,
          referenceId: job.jobNumber,
          notes: `Consumed for Repair Job ${job.jobNumber}`,
        },
      });

      // 6. Update serials if applicable
      if (serialNos && serialNos.length > 0) {
        await tx.productSerial.updateMany({
          where: { productId, serialNo: { in: serialNos } },
          data: { isSold: true, stockMovementId: movement.id },
        });
      }

      // 7. Recompute job cost totals
      const newPartsCost = new Decimal(job.finalPartsCost).plus(lineTotal);
      const newTotalCost = newPartsCost.plus(job.finalLaborCost);

      const updatedJob = await tx.repairJob.update({
        where: { id: jobId },
        data: {
          finalPartsCost: newPartsCost,
          totalCost: newTotalCost,
        },
      });

      // 8. General Ledger: Debit Workshop Consumables (5020), Credit Merchandise Inventory (1300)
      const costOfConsumedParts = new Decimal(product.costPrice).times(quantity);
      if (costOfConsumedParts.greaterThan(0)) {
        await LedgerService.recordEntry(tx, {
          userId,
          reference: job.jobNumber,
          memo: `Spare parts consumed: ${product.name} (Qty: ${quantity}) for Job ${job.jobNumber}`,
          lines: [
            { debitAccountCode: '5020', amount: costOfConsumedParts },
            { creditAccountCode: '1300', amount: costOfConsumedParts },
          ],
        });
      }

      return {
        partUsage,
        updatedJobPartsCost: updatedJob.finalPartsCost,
        updatedJobTotal: updatedJob.totalCost,
      };
    });
  }

  /**
   * 6. Render Job Receipt
   */
  async getJobReceipt(jobId: string, format: 'html' | 'json' = 'html') {
    const job = await this.prisma.repairJob.findUnique({
      where: { id: jobId },
      include: { customer: true, technician: true, partsUsed: { include: { product: true } } },
    });

    if (!job) throw new Error('Repair job not found.');

    const receiptData = {
      jobNumber: job.jobNumber,
      receivedDate: job.receivedDate,
      customerName: job.customer.fullName,
      customerPhone: job.customer.phone,
      deviceType: job.deviceType,
      brand: job.brand,
      model: job.model,
      serialNumber: job.serialNumber,
      reportedFault: job.reportedFault,
      physicalCondition: job.physicalCondition,
      accessories: job.accessories,
      estimatedCost: job.estimatedCost ? job.estimatedCost.toString() : '0.00',
      warrantyDays: job.warrantyDays,
      status: job.status,
    };

    if (format === 'html') {
      return ReceiptService.renderJobCardHtml(receiptData);
    }

    return {
      job,
      receiptData,
    };
  }

  /**
   * 7. Query Jobs
   */
  async listJobs(filters: { status?: RepairStatus; search?: string; technicianId?: string }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.technicianId) where.technicianId = filters.technicianId;
    if (filters.search) {
      where.OR = [
        { jobNumber: { contains: filters.search, mode: 'insensitive' } },
        { brand: { contains: filters.search, mode: 'insensitive' } },
        { model: { contains: filters.search, mode: 'insensitive' } },
        { serialNumber: { contains: filters.search, mode: 'insensitive' } },
        { customer: { fullName: { contains: filters.search, mode: 'insensitive' } } },
        { customer: { phone: { contains: filters.search, mode: 'insensitive' } } },
      ];
    }

    return this.prisma.repairJob.findMany({
      where,
      include: {
        customer: true,
        technician: { select: { id: true, fullName: true, username: true } },
        partsUsed: { include: { product: true } },
        history: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
      orderBy: { receivedDate: 'desc' },
    });
  }

  async getJobById(jobId: string) {
    const job = await this.prisma.repairJob.findUnique({
      where: { id: jobId },
      include: {
        customer: true,
        technician: { select: { id: true, fullName: true, username: true } },
        partsUsed: { include: { product: true } },
        history: {
          include: { user: { select: { id: true, fullName: true, username: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!job) throw new Error('Repair job card not found.');
    return job;
  }
}
