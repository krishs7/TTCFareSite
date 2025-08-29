import { z } from 'zod';
import { Agencies, Directions, PaymentMethods } from './fareEngine.js';

export const checkBodySchema = z.object({
  direction: z.nativeEnum(Directions),
  startAgency: z.nativeEnum(Agencies),
  firstTapISO: z.string().datetime(),
  paymentMethod: z.nativeEnum(PaymentMethods),
  sameCard: z.boolean()
});

