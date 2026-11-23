import { z } from 'zod';
import { ROLES, type Role, type Permission } from '../permissions';
import { USER_STATUSES, type UserStatus } from '../enums';

export const loginSchema = z.object({
  username: z.string().trim().min(3, 'Enter your username').max(64),
  password: z.string().min(8, 'Password has at least 8 characters').max(128),
});
export type LoginInput = z.infer<typeof loginSchema>;

const strongPassword = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128)
  .regex(/[A-Z]/, 'Add an uppercase letter')
  .regex(/[a-z]/, 'Add a lowercase letter')
  .regex(/[0-9]/, 'Add a number');

export const userCreateSchema = z.object({
  name: z.string().trim().min(2, 'Enter the full name').max(120),
  username: z.string().trim().toLowerCase().min(3).max(64).regex(/^[a-z0-9._-]+$/, 'Use lowercase letters, numbers, dot, dash or underscore'),
  email: z.email('Enter a valid email').optional().or(z.literal('')),
  phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'Enter a 10-digit mobile number').optional().or(z.literal('')),
  role: z.enum(ROLES),
  geoPath: z.string().trim().min(2, 'Choose a scope'),
  facilityId: z.string().optional(),
  customRoleId: z.string().optional(),
  password: strongPassword,
});
export type UserCreateInput = z.infer<typeof userCreateSchema>;

export const userUpdateSchema = userCreateSchema.omit({ password: true, username: true }).partial().extend({
  status: z.enum(USER_STATUSES).optional(),
});
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;

export const passwordChangeSchema = z
  .object({ currentPassword: z.string().min(8), newPassword: strongPassword, confirmPassword: z.string() })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ['confirmPassword'], message: 'Passwords do not match' });

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  email?: string;
  role: Role;
  permissions: Permission[];
  tenantId: string;
  geoPath: string;
  facilityId?: string;
  facilityName?: string;
  scopeLabel: string;
}

export interface UserDto {
  id: string;
  name: string;
  username: string;
  email?: string;
  phone?: string;
  role: Role;
  status: UserStatus;
  tenantId: string;
  geoPath: string;
  facilityId?: string;
  customRoleId?: string;
  scopeLabel: string;
  lastLoginAt?: string;
  mfaEnabled: boolean;
  createdAt: string;
}

export interface LoginResult {
  accessToken: string;
  expiresIn: number;
  user: SessionUser;
}

/** Bulk user onboarding row. Area is a location code path or name; facility by code. A temporary password is generated. */
export const userImportRowSchema = z.preprocess(
  (v) => (v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, typeof x === 'string' && x.trim() === '' ? undefined : x])) : v),
  z.object({
    username: z.string().trim().toLowerCase().min(3, 'username is required').max(64).regex(/^[a-z0-9._-]+$/, 'username: lowercase letters, numbers, . _ -'),
    name: z.string().trim().min(2, 'name is required').max(120),
    role: z.enum(ROLES, { error: `role must be one of ${ROLES.join(', ')}` }),
    location: z.string().trim().min(2, 'location is required (code or name, e.g. MDU or Madurai)'),
    facilityCode: z.string().trim().optional(),
    phone: z.string().trim().regex(/^[6-9]\d{9}$/, 'phone must be a 10-digit mobile number').optional(),
    email: z.email('email is not valid').optional(),
  }),
);
export type UserImportRow = z.infer<typeof userImportRowSchema>;
