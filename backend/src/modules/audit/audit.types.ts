import { AuditAction, AuditOutcome } from "@prisma/client";

/// The member who took the action.
export interface AuditActor {
  id: string;
  email: string;
}

/// The device it was taken on, as it was at the time.
export interface AuditDevice {
  id: string;
  orgId: string;
  name: string;
}

/// Who is acting, on which device.
export interface AuditSubject {
  actor: AuditActor;
  device: AuditDevice;
}

export interface AuditEntry extends AuditSubject {
  action: AuditAction;
  outcome: AuditOutcome;
  detail?: Record<string, unknown>;
}
