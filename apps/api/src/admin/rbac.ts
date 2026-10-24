import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DbService } from '../database/db.service';
import { AppError } from '../common/errors';
import { AppRequest } from '../common/request-context';
import { AuditService } from '../common/audit.service';

export type Role = 'super_admin' | 'compliance_officer' | 'operations' | 'finance' | 'support_agent' | 'auditor';

export type Permission =
  | 'customers.read' | 'customers.pii' | 'onboarding.review' | 'screening.review' | 'restrictions.manage'
  | 'alerts.manage' | 'withdrawals.review' | 'payments.read' | 'orders.read' | 'reconciliation.manage'
  | 'support.read' | 'support.manage' | 'fees.manage' | 'controls.manage' | 'jurisdictions.manage'
  | 'launch_gates.approve' | 'audit.read' | 'reports.read' | 'system.read' | 'staff.manage';

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  super_admin: [
    'customers.read', 'customers.pii', 'onboarding.review', 'screening.review', 'restrictions.manage', 'alerts.manage',
    'withdrawals.review', 'payments.read', 'orders.read', 'reconciliation.manage', 'support.read', 'support.manage',
    'fees.manage', 'controls.manage', 'jurisdictions.manage', 'launch_gates.approve', 'audit.read', 'reports.read',
    'system.read', 'staff.manage',
  ],
  compliance_officer: [
    'customers.read', 'customers.pii', 'onboarding.review', 'screening.review', 'restrictions.manage', 'alerts.manage',
    'withdrawals.review', 'jurisdictions.manage', 'reports.read', 'audit.read', 'launch_gates.approve', 'support.read', 'orders.read', 'payments.read',
  ],
  operations: ['customers.read', 'reconciliation.manage', 'payments.read', 'orders.read', 'support.read', 'support.manage', 'system.read', 'controls.manage', 'launch_gates.approve'],
  finance: ['customers.read', 'withdrawals.review', 'payments.read', 'reconciliation.manage', 'fees.manage', 'reports.read', 'orders.read'],
  support_agent: ['customers.read', 'support.read', 'support.manage', 'orders.read'],
  auditor: ['customers.read', 'audit.read', 'reports.read', 'system.read', 'payments.read', 'orders.read', 'support.read'],
};

export function permissionsFor(roles: string[]): Set<Permission> {
  const s = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r as Role] ?? []) s.add(p);
  return s;
}

const PERMS_KEY = 'required_permissions';
export const RequirePermissions = (...perms: Permission[]) => SetMetadata(PERMS_KEY, perms);

/** Loads roles fresh on every request (role revocation is immediate) and enforces least privilege. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly db: DbService, private readonly audit: AuditService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const required = this.reflector.getAllAndOverride<Permission[]>(PERMS_KEY, [ctx.getHandler(), ctx.getClass()]) ?? [];
    const auth = req.auth;
    if (!auth || auth.subjectType !== 'staff') throw new AppError('UNAUTHENTICATED', 'Authentication required', 401);
    const staff = await this.db.one<{ status: string; roles: string[] }>(
      "SELECT s.status, COALESCE(array_agg(r.role) FILTER (WHERE r.role IS NOT NULL), '{}') AS roles FROM staff_users s LEFT JOIN staff_roles r ON r.staff_id = s.id WHERE s.id = $1 GROUP BY s.id",
      [auth.subjectId],
    );
    if (!staff || staff.status !== 'active') throw new AppError('UNAUTHENTICATED', 'Staff account inactive', 401);
    auth.roles = staff.roles;
    const have = permissionsFor(staff.roles);
    const missing = required.filter((p) => !have.has(p));
    if (missing.length) {
      await this.audit.record({ actorType: 'staff', actorId: auth.subjectId, action: 'admin.access_denied', outcome: 'denied', metadata: { path: req.path, missing }, req });
      throw new AppError('FORBIDDEN', 'You do not have permission to perform this action', 403, { missing });
    }
    return true;
  }
}
