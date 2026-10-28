/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execute, query, transaction } from '../db';
import { AiTool, ToolApprovalStatus } from '../types';
import { generateUUID } from '../../security/crypto';
import { DEFAULT_AI_CATALOG } from '../../inventory/defaultCatalog';

export const toolRepo = {
  getAll(): AiTool[] {
    return query<AiTool>('SELECT * FROM ai_tools ORDER BY tool_name ASC');
  },

  getApprovedTools(): AiTool[] {
    return query<AiTool>("SELECT * FROM ai_tools WHERE approval_status = 'Approved' ORDER BY tool_name ASC");
  },

  getById(toolId: string): AiTool | null {
    const rows = query<AiTool>('SELECT * FROM ai_tools WHERE tool_id = ?', [toolId]);
    return rows[0] || null;
  },

  findByIdentifier(identifier: string): AiTool | null {
    const cleanId = identifier.toLowerCase().trim();
    const rows = query<AiTool>(
      'SELECT * FROM ai_tools WHERE lower(identifier) = ? OR ? LIKE "%" || lower(identifier) || "%"',
      [cleanId, cleanId]
    );
    return rows[0] || null;
  },

  async create(tool: Omit<AiTool, 'tool_id' | 'created_at' | 'updated_at'>): Promise<AiTool> {
    const tool_id = generateUUID();
    const now = new Date().toISOString();
    await execute(
      `INSERT INTO ai_tools (tool_id, tool_name, tool_type, identifier, category, approval_status, risk_policy, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        tool_id,
        tool.tool_name.trim(),
        tool.tool_type,
        tool.identifier.trim().toLowerCase(),
        tool.category.trim(),
        tool.approval_status,
        tool.risk_policy.trim(),
        now,
        now,
      ]
    );
    return {
      tool_id,
      ...tool,
      identifier: tool.identifier.trim().toLowerCase(),
      created_at: now,
      updated_at: now,
    };
  },

  async update(toolId: string, updates: Partial<Omit<AiTool, 'tool_id' | 'created_at'>>): Promise<void> {
    const existing = this.getById(toolId);
    if (!existing) throw new Error('Tool not found');
    const now = new Date().toISOString();

    const tool_name = updates.tool_name ?? existing.tool_name;
    const tool_type = updates.tool_type ?? existing.tool_type;
    const identifier = (updates.identifier ?? existing.identifier).toLowerCase().trim();
    const category = updates.category ?? existing.category;
    const approval_status = updates.approval_status ?? existing.approval_status;
    const risk_policy = updates.risk_policy ?? existing.risk_policy;

    await execute(
      `UPDATE ai_tools
       SET tool_name = ?, tool_type = ?, identifier = ?, category = ?, approval_status = ?, risk_policy = ?, updated_at = ?
       WHERE tool_id = ?`,
      [tool_name, tool_type, identifier, category, approval_status, risk_policy, now, toolId]
    );
  },

  async updateApprovalStatus(toolId: string, status: ToolApprovalStatus): Promise<void> {
    const now = new Date().toISOString();
    await execute('UPDATE ai_tools SET approval_status = ?, updated_at = ? WHERE tool_id = ?', [
      status,
      now,
      toolId,
    ]);
  },

  async delete(toolId: string): Promise<void> {
    await execute('DELETE FROM ai_tools WHERE tool_id = ?', [toolId]);
  },

  count(): number {
    const res = query<{ count: number }>('SELECT count(*) as count FROM ai_tools');
    return res[0]?.count || 0;
  },

  async seedDefaults(): Promise<number> {
    const existingCount = this.count();
    if (existingCount > 0) return 0;

    const now = new Date().toISOString();
    await transaction(async () => {
      for (const t of DEFAULT_AI_CATALOG) {
        await execute(
          `INSERT INTO ai_tools (tool_id, tool_name, tool_type, identifier, category, approval_status, risk_policy, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            t.tool_id,
            t.tool_name,
            t.tool_type,
            t.identifier.toLowerCase(),
            t.category,
            t.approval_status,
            t.risk_policy,
            now,
            now,
          ]
        );
      }
    });

    return DEFAULT_AI_CATALOG.length;
  },
};
