/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execute, query, transaction } from '../db';
import { Policy, PolicyType } from '../types';
import { BALANCED_TEMPLATE, DEFAULT_SCANNER_RULES, RULES_VERSION, ScannerRuleConfig } from '../../core/defaultPolicies';
import { auditRepo } from './userRepo';

export const policyRepo = {
  getLatest(policyId: string): Policy | null {
    const rows = query<Policy>(
      'SELECT * FROM policies WHERE policy_id = ? ORDER BY version DESC LIMIT 1',
      [policyId]
    );
    return rows[0] || null;
  },

  getAllLatest(): Policy[] {
    return query<Policy>(`
      SELECT p1.*
      FROM policies p1
      JOIN (
        SELECT policy_id, MAX(version) as max_v
        FROM policies
        GROUP BY policy_id
      ) p2 ON p1.policy_id = p2.policy_id AND p1.version = p2.max_v
      ORDER BY p1.policy_name ASC
    `);
  },

  getVersion(policyId: string, version: number): Policy | null {
    const rows = query<Policy>(
      'SELECT * FROM policies WHERE policy_id = ? AND version = ?',
      [policyId, version]
    );
    return rows[0] || null;
  },

  getAllVersions(policyId: string): Policy[] {
    return query<Policy>(
      'SELECT * FROM policies WHERE policy_id = ? ORDER BY version DESC',
      [policyId]
    );
  },

  async saveNewVersion(policy: {
    policy_id: string;
    policy_name: string;
    policy_type: PolicyType;
    policy_json: string;
    enabled: boolean;
    updated_by: string;
  }): Promise<Policy> {
    const latest = this.getLatest(policy.policy_id);
    const nextVersion = latest ? latest.version + 1 : 1;
    const now = new Date().toISOString();

    await execute(
      `INSERT INTO policies (policy_id, policy_name, policy_type, policy_json, version, enabled, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        policy.policy_id,
        policy.policy_name,
        policy.policy_type,
        policy.policy_json,
        nextVersion,
        policy.enabled ? 1 : 0,
        policy.updated_by,
        now,
      ]
    );

    return {
      policy_id: policy.policy_id,
      policy_name: policy.policy_name,
      policy_type: policy.policy_type,
      policy_json: policy.policy_json,
      version: nextVersion,
      enabled: policy.enabled ? 1 : 0,
      updated_by: policy.updated_by,
      updated_at: now,
    };
  },

  async seedDefaults(adminUsername: string): Promise<void> {
    const existing = query<{ count: number }>('SELECT count(*) as count FROM policies');
    if ((existing[0]?.count || 0) > 0) return;

    const now = new Date().toISOString();
    await transaction(async () => {
      // 1. Tool Approval Policy
      await execute(
        `INSERT INTO policies (policy_id, policy_name, policy_type, policy_json, version, enabled, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'pol_tool_approval',
          'Enterprise Tool Approval & Classification',
          'Tool Approval',
          JSON.stringify(BALANCED_TEMPLATE.toolApprovalPolicy),
          1,
          1,
          adminUsername,
          now,
        ]
      );

      // 2. Data Category & Scanner Rules Policy
      await execute(
        `INSERT INTO policies (policy_id, policy_name, policy_type, policy_json, version, enabled, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'pol_data_categories',
          'Sensitive Data Category Scanner Rules',
          'Data Category',
          JSON.stringify(BALANCED_TEMPLATE.dataCategories),
          1,
          1,
          adminUsername,
          now,
        ]
      );

      // 3. Alert Threshold Policy
      await execute(
        `INSERT INTO policies (policy_id, policy_name, policy_type, policy_json, version, enabled, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'pol_alert_thresholds',
          'DLP Alert Generation Thresholds',
          'Alert Threshold',
          JSON.stringify(BALANCED_TEMPLATE.alertThresholds),
          1,
          1,
          adminUsername,
          now,
        ]
      );

      // 4. Retention Policy
      await execute(
        `INSERT INTO policies (policy_id, policy_name, policy_type, policy_json, version, enabled, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          'pol_retention',
          'Data Purge & Retention Schedule',
          'Retention',
          JSON.stringify(BALANCED_TEMPLATE.retention),
          1,
          1,
          adminUsername,
          now,
        ]
      );
    });
  },

  async migrateScannerRules(): Promise<boolean> {
    try {
      const policy = this.getLatest('pol_data_categories');
      if (!policy) return false;

      let storedRules: ScannerRuleConfig[] = [];
      let storedVersion = 1;

      try {
        const parsed = JSON.parse(policy.policy_json);
        if (Array.isArray(parsed)) {
          storedRules = parsed;
          storedVersion = 1;
        } else if (parsed && typeof parsed === 'object') {
          storedRules = Array.isArray(parsed.rules) ? parsed.rules : [];
          storedVersion = typeof parsed.rules_version === 'number' ? parsed.rules_version : 1;
        }
      } catch {
        storedRules = [];
      }

      let changed = false;
      const finalRules: ScannerRuleConfig[] = [];
      const seenIds = new Set<string>();

      for (const rule of storedRules) {
        if (!rule || !rule.rule_id) continue;
        seenIds.add(rule.rule_id);

        let compiles = true;
        try {
          new RegExp(rule.regex, rule.flags || 'g');
        } catch {
          compiles = false;
        }

        if (!compiles) {
          const defaultRule = DEFAULT_SCANNER_RULES.find((d) => d.rule_id === rule.rule_id);
          if (defaultRule) {
            finalRules.push({ ...defaultRule });
            changed = true;
          } else {
            finalRules.push({ ...rule, enabled: false });
            changed = true;
          }
        } else {
          // Never overwrite a rule the admin edited and that still compiles
          finalRules.push(rule);
        }
      }

      // For every default rule_id missing from stored rules, append it
      for (const defaultRule of DEFAULT_SCANNER_RULES) {
        if (!seenIds.has(defaultRule.rule_id)) {
          finalRules.push({ ...defaultRule });
          seenIds.add(defaultRule.rule_id);
          changed = true;
        }
      }

      if (storedVersion < RULES_VERSION) {
        changed = true;
      }

      if (changed) {
        await this.saveNewVersion({
          policy_id: 'pol_data_categories',
          policy_name: policy.policy_name,
          policy_type: 'Data Category',
          policy_json: JSON.stringify({
            rules_version: RULES_VERSION,
            rules: finalRules,
          }),
          enabled: true,
          updated_by: 'system-migration',
        });

        try {
          await auditRepo.log({
            user_id: 'system',
            action: 'POLICY_MIGRATION',
            target_type: 'policy',
            target_id: 'pol_data_categories',
            outcome: 'Success',
            details: `Migrated scanner rules to v${RULES_VERSION} (${finalRules.length} rules).`,
          });
        } catch (auditErr) {
          console.warn('Migration audit log error:', auditErr);
        }

        return true;
      }
    } catch (err) {
      console.warn('migrateScannerRules error (continuing without blocking):', err);
    }
    return false;
  },

  async syncDefaultRules(): Promise<boolean> {
    return this.migrateScannerRules();
  },
};

export const migrateScannerRules = () => policyRepo.migrateScannerRules();
