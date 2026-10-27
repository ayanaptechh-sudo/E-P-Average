/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { policyRepo } from '../database/repositories/policyRepo';
import { usageRepo } from '../database/repositories/usageRepo';
import { scanRepo } from '../database/repositories/scanRepo';
import { alertRepo } from '../database/repositories/alertRepo';
import { reportRepo } from '../database/repositories/reportRepo';
import { auditRepo } from '../database/repositories/userRepo';

export interface RetentionRunResult {
  purgedEvents: number;
  purgedScansAndFindings: number;
  purgedAlerts: number;
  purgedReports: number;
  purgedAuditLogs: number;
  timestamp: string;
}

export const retentionService = {
  async runRetention(triggeredByUserId: string): Promise<RetentionRunResult> {
    const policy = policyRepo.getLatest('pol_retention');
    let config = {
      eventRetentionDays: 90,
      findingRetentionDays: 180,
      auditLogRetentionDays: 365,
      reportRetentionDays: 365,
    };

    if (policy && policy.enabled) {
      try {
        const parsed = JSON.parse(policy.policy_json);
        config = { ...config, ...parsed };
      } catch (e) {
        console.warn('Failed to parse retention policy JSON:', e);
      }
    }

    const purgedEvents = await usageRepo.purgeOlderThanDays(config.eventRetentionDays);
    const purgedScansAndFindings = await scanRepo.purgeOlderThanDays(config.findingRetentionDays);
    const purgedAlerts = await alertRepo.purgeOlderThanDays(config.findingRetentionDays);
    const purgedReports = await reportRepo.purgeOlderThanDays(config.reportRetentionDays);
    const purgedAuditLogs = await auditRepo.purgeOlderThanDays(config.auditLogRetentionDays);

    const result: RetentionRunResult = {
      purgedEvents,
      purgedScansAndFindings,
      purgedAlerts,
      purgedReports,
      purgedAuditLogs,
      timestamp: new Date().toISOString(),
    };

    await auditRepo.log({
      user_id: triggeredByUserId,
      action: 'RETENTION_PURGE_EXECUTED',
      target_type: 'retention_policy',
      target_id: 'pol_retention',
      outcome: 'Success',
      details: `Purged: ${purgedEvents} events (${config.eventRetentionDays}d), ${purgedScansAndFindings} scans/findings (${config.findingRetentionDays}d), ${purgedAlerts} alerts, ${purgedReports} reports, ${purgedAuditLogs} audit logs.`,
    });

    return result;
  },
};
