/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { alertRepo } from '../database/repositories/alertRepo';
import { auditRepo, userRepo } from '../database/repositories/userRepo';
import { toolRepo } from '../database/repositories/toolRepo';
import { policyRepo } from '../database/repositories/policyRepo';
import { Alert, AlertStatus, Finding, ScanSession, SeverityLevel } from '../database/types';

export const alertService = {
  /**
   * Evaluates a completed scan session and its findings, generating at most ONE alert
   * if policy thresholds are met.
   * A Medium "possible secret" alone never creates an alert.
   * If the same user triggers an alert with the same categories within 10 minutes,
   * increments a counter on the existing open alert instead of creating a new one.
   * Privacy Invariant: Description contains ONLY non-sensitive metadata (categories, counts, tool).
   */
  async evaluateScanForAlert(
    session: ScanSession,
    findings: Finding[],
    intendedToolId?: string | null
  ): Promise<Alert | null> {
    if (!findings || findings.length === 0) return null;

    // A Medium "possible secret" alone never creates an alert
    const isOnlyMediumPossibleSecret = findings.every(
      (f) => f.category.toLowerCase().includes('possible secret') && f.severity === 'Medium'
    );
    if (isOnlyMediumPossibleSecret) {
      return null;
    }

    const thresholdPolicy = policyRepo.getLatest('pol_alert_thresholds');
    let minSeverity: SeverityLevel = 'High';

    if (thresholdPolicy && thresholdPolicy.enabled) {
      try {
        const config = JSON.parse(thresholdPolicy.policy_json);
        if (config.minSeverityForAlert) {
          minSeverity = config.minSeverityForAlert;
        }
      } catch (e) {
        console.warn('Failed to parse threshold policy:', e);
      }
    }

    const severityRanks: Record<SeverityLevel, number> = {
      Low: 1,
      Medium: 2,
      High: 3,
      Critical: 4,
    };

    // Find highest severity across findings
    let highestSeverity: SeverityLevel = 'Low';
    for (const f of findings) {
      if (severityRanks[f.severity] > severityRanks[highestSeverity]) {
        highestSeverity = f.severity;
      }
    }

    // Check destination tool status
    let toolName = 'Unspecified Destination';
    if (intendedToolId) {
      const tool = toolRepo.getById(intendedToolId);
      if (tool) {
        toolName = tool.tool_name;
        if (
          tool.approval_status === 'Restricted' &&
          findings.some((f) => f.category.includes('API') || f.category.includes('Password'))
        ) {
          highestSeverity = 'Critical';
        }
      }
    }

    if (severityRanks[highestSeverity] < severityRanks[minSeverity]) {
      return null;
    }

    // Prepare category counts & summary (METADATA ONLY)
    const categorySummaryMap: Record<string, number> = {};
    for (const f of findings) {
      categorySummaryMap[f.category] = (categorySummaryMap[f.category] || 0) + (f.match_count || 1);
    }

    const sortedCategories = Object.keys(categorySummaryMap).sort();
    const categoriesSignature = sortedCategories.join(', ');
    const countsList = sortedCategories.map((c) => `${c} (${categorySummaryMap[c]})`).join(', ');

    const title = `${highestSeverity} DLP Alert: ${categoriesSignature}`;
    const description = countsList;

    // Check for open alert for same user with same categories within last 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const openAlerts = alertRepo.getAll({ status: 'Open', userId: session.user_id });

    const existingAlert = openAlerts.find((a) => {
      if (a.created_at < tenMinutesAgo) return false;
      return a.title.includes(categoriesSignature) || a.description.includes(categoriesSignature);
    });

    if (existingAlert) {
      // Increment counter on existing alert
      const currentCountMatch = existingAlert.title.match(/\[x(\d+)\]/);
      const currentCount = currentCountMatch ? parseInt(currentCountMatch[1], 10) : 1;
      const newCount = currentCount + 1;
      const cleanBaseTitle = existingAlert.title.replace(/\[x\d+\]\s*/, '');
      const updatedTitle = `[x${newCount}] ${cleanBaseTitle}`;
      const updatedDescription = `${description} [Triggered ${newCount} times; last detection at ${new Date().toLocaleTimeString()}]`;

      await alertRepo.updateDetails(existingAlert.alert_id, updatedTitle, updatedDescription);

      await auditRepo.log({
        user_id: session.user_id,
        action: 'ALERT_INCREMENTED',
        target_type: 'alert',
        target_id: existingAlert.alert_id,
        outcome: 'Success',
        details: `Incremented repeat alert frequency to ${newCount}x for ${categoriesSignature}`,
      });

      return {
        ...existingAlert,
        title: updatedTitle,
        description: updatedDescription,
      };
    }

    // Create new alert
    const primaryFinding = findings[0];
    const alert = await alertRepo.create({
      finding_id: primaryFinding?.finding_id || null,
      user_id: session.user_id,
      severity: highestSeverity,
      title,
      description,
      assigned_to: null,
      status: 'Open',
    });

    await auditRepo.log({
      user_id: session.user_id,
      action: 'ALERT_GENERATED',
      target_type: 'alert',
      target_id: alert.alert_id,
      outcome: 'Success',
      details: `Generated ${highestSeverity} alert for ${categoriesSignature} (Tool: ${toolName})`,
    });

    return alert;
  },

  /**
   * Retain legacy method for backwards compatibility
   */
  async evaluateFindingForAlert(
    finding: Finding,
    intendedToolId?: string | null
  ): Promise<Alert | null> {
    const fakeSession: ScanSession = {
      scan_id: finding.scan_id,
      user_id: finding.user_id,
      tool_id: intendedToolId || null,
      scan_time: finding.created_at,
      scan_source: 'Manual Text',
      detected_count: finding.match_count,
      categories_json: JSON.stringify([finding.category]),
      highest_risk: finding.severity,
      scan_status: 'Completed',
    };
    return this.evaluateScanForAlert(fakeSession, [finding], intendedToolId);
  },

  async updateAlertStatus(
    alertId: string,
    newStatus: AlertStatus,
    performedByUserId: string,
    assignedToUserId?: string | null
  ): Promise<void> {
    const alert = alertRepo.getById(alertId);
    if (!alert) throw new Error('Alert not found');

    await alertRepo.updateStatus(alertId, newStatus, assignedToUserId);

    let assignedName = 'Unassigned';
    if (assignedToUserId) {
      const u = userRepo.getById(assignedToUserId);
      if (u) assignedName = u.username;
    }

    await auditRepo.log({
      user_id: performedByUserId,
      action: 'ALERT_STATUS_UPDATE',
      target_type: 'alert',
      target_id: alertId,
      outcome: 'Success',
      details: `Status transitioned to ${newStatus}. Assigned to: ${assignedName}`,
    });
  },
};
