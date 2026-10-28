import { z } from 'zod';
import { RepairStatus } from '@prisma/client';

export const IntakeJobSchema = z.object({
  customer: z.object({
    id: z.string().uuid().optional(),
    fullName: z.string().trim().min(2).max(100),
    phone: z.string().trim().min(7).max(20),
    email: z.string().trim().email().optional(),
    address: z.string().trim().max(200).optional(),
  }),
  deviceType: z.string().trim().min(2).max(50), // e.g. Laptop, CCTV DVR, Managed Switch
  brand: z.string().trim().min(2).max(50),
  model: z.string().trim().min(2).max(50),
  serialNumber: z.string().trim().max(64).optional(),
  reportedFault: z.string().trim().min(5).max(1000),
  physicalCondition: z.string().trim().max(500).optional(),
  accessories: z.string().trim().max(300).optional(),
  securityPin: z.string().trim().max(50).optional(),
  estimatedCost: z.number().nonnegative().optional(),
  warrantyDays: z.number().int().min(0).max(365).default(30),
});

export const UpdateDiagnosisSchema = z.object({
  technicianId: z.string().uuid().optional(),
  diagnosticReport: z.string().trim().min(5).max(2000),
  estimatedCost: z.number().nonnegative(),
  laborCost: z.number().nonnegative().optional(),
  internalNotes: z.string().trim().max(1000).optional(),
});

export const CustomerApprovalSchema = z.object({
  approved: z.boolean(),
  notes: z.string().trim().max(500).optional(),
});

export const AttachPartSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive(),
  serialNos: z.array(z.string().trim()).optional(),
});

export const UpdateLaborCostSchema = z.object({
  laborCost: z.number().nonnegative(),
  notes: z.string().trim().optional(),
});

export const TransitionStatusSchema = z.object({
  targetStatus: z.nativeEnum(RepairStatus),
  note: z.string().trim().max(500).optional(),
  qcPassed: z.boolean().optional(),
  qcNotes: z.string().trim().max(1000).optional(),
  deliveredTo: z.string().trim().max(100).optional(),
});
