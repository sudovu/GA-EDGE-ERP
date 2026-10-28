import { z } from 'zod';

export const HardwareIdentifierSchema = z.object({
  serialNo: z.string().trim().min(3).max(64),
  imei: z.string().trim().regex(/^[0-9]{15}$/, 'IMEI must be exactly 15 digits').optional(),
  macAddress: z
    .string()
    .trim()
    .regex(/^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/, 'Invalid MAC address format (e.g. AA:BB:CC:DD:EE:FF)')
    .optional(),
});

export const CreateProductSchema = z.object({
  sku: z.string().trim().min(3).max(32).toUpperCase(),
  barcode: z.string().trim().max(48).optional(),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional(),
  category: z.string().trim().min(2).max(50),
  brand: z.string().trim().max(50).optional(),
  model: z.string().trim().max(50).optional(),
  costPrice: z.number().positive('Cost price must be positive'),
  retailPrice: z.number().positive('Retail price must be positive'),
  minStockAlert: z.number().int().nonnegative().default(5),
  isSparePart: z.boolean().default(false),
});

export const UpdateProductSchema = CreateProductSchema.partial();

export const CreateSupplierSchema = z.object({
  companyName: z.string().trim().min(2).max(100),
  contactPerson: z.string().trim().max(60).optional(),
  email: z.string().trim().email('Invalid email address').optional(),
  phone: z.string().trim().min(7).max(20),
  address: z.string().trim().max(200).optional(),
  taxNumber: z.string().trim().max(30).optional(), // VAT or PAN
});

export const CreatePurchaseOrderSchema = z.object({
  supplierId: z.string().uuid('Invalid supplier UUID'),
  notes: z.string().trim().max(500).optional(),
  expectedDelivery: z.string().datetime().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().uuid('Invalid product UUID'),
        orderedQuantity: z.number().int().positive('Quantity must be >= 1'),
        unitCost: z.number().positive('Unit cost must be > 0'),
      })
    )
    .min(1, 'Purchase order must have at least one line item'),
});

export const ReceiveStockSchema = z.object({
  purchaseOrderId: z.string().uuid(),
  productId: z.string().uuid(),
  quantityReceived: z.number().int().positive(),
  identifiers: z.array(HardwareIdentifierSchema).optional(),
});

export const StockAdjustmentSchema = z.object({
  productId: z.string().uuid(),
  quantityDelta: z.number().int().refine((val) => val !== 0, 'Adjustment delta cannot be 0'),
  reason: z.string().trim().min(5).max(255),
  identifiersToAdd: z.array(HardwareIdentifierSchema).optional(),
  serialNumbersToRemove: z.array(z.string().trim()).optional(),
});
