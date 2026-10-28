import { z } from 'zod';
import { PaymentMethod } from '@prisma/client';

export const POSLineItemSchema = z.object({
  productId: z.string().uuid('Invalid product UUID'),
  quantity: z.number().int().positive('Quantity must be >= 1'),
  serialNos: z.array(z.string().trim()).optional(),
  unitPriceOverride: z.number().positive().optional(),
});

export const SplitTenderPaymentSchema = z.object({
  method: z.nativeEnum(PaymentMethod),
  amount: z.number().positive('Payment amount must be greater than zero'),
  referenceNo: z.string().trim().max(100).optional(),
});

export const POSCheckoutSchema = z.object({
  customerId: z.string().uuid('Invalid customer UUID').optional(),
  walkInCustomer: z
    .object({
      fullName: z.string().trim().min(2).max(100),
      phone: z.string().trim().min(7).max(20),
    })
    .optional(),
  items: z.array(POSLineItemSchema).min(1, 'Cart cannot be empty'),
  discount: z.number().nonnegative().default(0.0),
  taxRate: z.number().nonnegative().default(0.13), // 13% default VAT
  payments: z.array(SplitTenderPaymentSchema).min(1, 'At least one payment method is required'),
  notes: z.string().trim().max(255).optional(),
});
