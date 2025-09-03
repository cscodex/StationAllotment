import { IStorage } from '../storage';
import { InsertAuditLog } from '@shared/schema';

export class AuditService {
  constructor(private storage: IStorage) {}

  async log(
    userId: string,
    action: string,
    resource: string,
    resourceId: string,
    details?: any,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    const auditLog: InsertAuditLog = {
      userId,
      action,
      resource,
      resourceId,
      details,
      ipAddress,
      userAgent,
    };

    await this.storage.createAuditLog(auditLog);
  }
}
