import { z } from 'zod';
import type {
  CreateVerificationRequest,
  CreateVerificationResponse,
} from './types.js';

export const createVerificationRequestSchema: z.ZodType<CreateVerificationRequest> =
  z.object({
    email: z.string(),
    repoFullName: z.string(),
    unsubToken: z.string(),
  });

export const createVerificationResponseSchema: z.ZodType<CreateVerificationResponse> =
  z.object({
    token: z.string(),
  });
