/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { useAuth } from '../../services/authContext';
import { toolRepo } from '../../database/repositories/toolRepo';
import { usageRepo } from '../../database/repositories/usageRepo';
import { auditRepo } from '../../database/repositories/userRepo';
import { AiTool, ToolApprovalStatus, ToolType } from '../../database/types';
import { DataTable, Column, Modal } from '../components/DataTable';
import { RiskBadge } from '../components/CommonUI';
import {
  parseBrowserHistoryImport,
  parseProcessInventoryImport,
  parseExtensionInventoryImport,
  ParsedImportResult,
} from '../../inventory/parsers';

export const InventoryPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [tools, setTools] = useState<AiTool[]>(() => toolRepo.getAll());
  const [refreshKey, setRefreshKey] = useState(0);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedTool, setSelectedTool] = useState<AiTool | null>(null);

  // Import Modal State
  const [activeImportType, setActiveImportType] = useState<
    'history' | 'process' | 'extension' | null
  >(null);
  const [importContent, setImportContent] = useState('');
  const [importResult, setImportResult] = useState<ParsedImportResult | null>(null);
  const [importStatusMessage, setImportStatusMessage] = useState<string | null>(null);

  // Form State for Add / Edit
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<ToolType>('Website');
  const [formIdentifier, setFormIdentifier] = useState('');
  const [formCategory, setFormCategory] = useState('Generative Text & Assistant');
  const [formApproval, setFormApproval] = useState<ToolApprovalStatus>('Unreviewed');
  const [formPolicy, setFormPolicy] = useState('Standard DLP Guardrail');

  const reload = () => {
    setTools(toolRepo.getAll());
    setRefreshKey(k => k + 1);
  };

  const handleApprovalChange = async (tool: AiTool, newStatus: ToolApprovalStatus) => {
    try {
      await toolRepo.updateApprovalStatus(tool.tool_id, newStatus);
      await auditRepo.log({
        user_id: currentUser?.user_id || 'system',
        action: 'TOOL_APPROVAL_CHANGED',
        target_type: 'ai_tool',
        target_id: tool.tool_id,
        outcome: 'Success',
        details: `Updated "${tool.tool_name}" approval status from ${tool.approval_status} to ${newStatus}.`,
      });
      reload();
    } catch (err) {
      console.error('Failed to update tool status:', err);
    }
  };

  const handleSaveTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formIdentifier.trim()) return;

    try {
      if (selectedTool) {
        await toolRepo.update(selectedTool.tool_id, {
          tool_name: formName,
          tool_type: formType,
          identifier: formIdentifier,
          category: formCategory,
          approval_status: formApproval,
          risk_policy: formPolicy,
        });
        await auditRepo.log({
          user_id: currentUser?.user_id || 'system',
          action: 'TOOL_UPDATED',
          target_type: 'ai_tool',
          target_id: selectedTool.tool_id,
          outcome: 'Success',
          details: `Updated catalog item "${formName}" (${formIdentifier}).`,
        });
      } else {
        const created = await toolRepo.create({
          tool_name: formName,
          tool_type: formType,
          identifier: formIdentifier,
          category: formCategory,
          approval_status: formApproval,
          risk_policy: formPolicy,
        });
        await auditRepo.log({
          user_id: currentUser?.user_id || 'system',
          action: 'TOOL_CREATED',
          target_type: 'ai_tool',
          target_id: created.tool_id,
          outcome: 'Success',
          details: `Created new AI catalog tool "${formName}" (${formIdentifier}).`,
        });
      }

      setIsAddModalOpen(false);
      setIsEditModalOpen(false);
      setSelectedTool(null);
      resetForm();
      reload();
    } catch (err) {
      console.error('Failed to save tool:', err);
    }
  };

  const handleDeleteTool = async (tool: AiTool) => {
    if (!confirm(`Are you sure you want to delete ${tool.tool_name}?`)) return;
    try {
      await toolRepo.delete(tool.tool_id);
      await auditRepo.log({
        user_id: currentUser?.user_id || 'system',
        action: 'TOOL_DELETED',
        target_type: 'ai_tool',
        target_id: tool.tool_id,
        outcome: 'Success',
        details: `Deleted AI catalog tool "${tool.tool_name}".`,
      });
      reload();
    } catch (err) {
      console.error('Failed to delete tool:', err);
    }
  };

  const openEditModal = (tool: AiTool) => {
    setSelectedTool(tool);
    setFormName(tool.tool_name);
    setFormType(tool.tool_type);
    setFormIdentifier(tool.identifier);
    setFormCategory(tool.category);
    setFormApproval(tool.approval_status);
    setFormPolicy(tool.risk_policy);
    setIsEditModalOpen(true);
  };

  const resetForm = () => {
    setFormName('');
    setFormType('Website');
    setFormIdentifier('');
    setFormCategory('Generative Text & Assistant');
    setFormApproval('Unreviewed');
    setFormPolicy('Standard DLP Guardrail');
  };

  // Handle Ingest Process
  const handleProcessImport = async () => {
    if (!importContent.trim() || !currentUser) return;
    let result: ParsedImportResult;

    if (activeImportType === 'history') {
      result = parseBrowserHistoryImport(importContent, tools, currentUser.user_id);
    } else if (activeImportType === 'process') {
      result = parseProcessInventoryImport(importContent, tools, currentUser.user_id);
    } else {
      result = parseExtensionInventoryImport(importContent, tools, currentUser.user_id);
    }

    setImportResult(result);

    if (result.events.length > 0) {
      const { inserted, duplicatesSkipped } = await usageRepo.batchInsert(result.events);
      await auditRepo.log({
        user_id: currentUser.user_id,
        action: 'USAGE_INVENTORY_IMPORTED',
        target_type: 'usage_events',
        outcome: result.status === 'Error' ? 'Failure' : 'Success',
        details: `Source: ${result.source}. Parsed ${result.totalParsed} records, Matched ${result.matchedCount}, Inserted ${inserted} new events (${duplicatesSkipped} duplicates skipped).`,
      });
      setImportStatusMessage(
        `Successfully ingested ${inserted} new events (${duplicatesSkipped} duplicates skipped). Collection status: ${result.status}.`
      );
    } else {
      setImportStatusMessage(
        `No catalog-matched events were found in the uploaded data. (${result.totalParsed} records evaluated).`
      );
    }
  };

  const columns: Column<AiTool>[] = [
    {
      header: 'AI Service Name',
      accessor: (tool) => (
        <div>
          <div className="font-bold text-gray-900 dark:text-slate-100 text-xs">{tool.tool_name}</div>
          <div className="font-mono text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">
            {tool.identifier}
          </div>
        </div>
      ),
      sortable: true,
      sortValue: (t) => t.tool_name,
    },
    {
      header: 'Type',
      accessor: (tool) => (
        <span className="font-mono text-xs text-gray-700 dark:text-slate-300 bg-gray-100 dark:bg-slate-700 border border-gray-200 dark:border-slate-600 px-2 py-0.5 rounded font-medium">
          {tool.tool_type}
        </span>
      ),
      sortable: true,
      sortValue: (t) => t.tool_type,
    },
    {
      header: 'Category',
      accessor: (tool) => <span className="text-gray-800 dark:text-slate-200 font-medium text-xs">{tool.category}</span>,
      sortable: true,
      sortValue: (t) => t.category,
    },
    {
      header: 'Approval Status',
      accessor: (tool) => (
        <select
          value={tool.approval_status}
          onChange={(e) => handleApprovalChange(tool, e.target.value as ToolApprovalStatus)}
          className={`text-xs font-bold py-1 px-2.5 rounded-lg border focus:outline-none transition-colors cursor-pointer shadow-2xs ${
            tool.approval_status === 'Approved'
              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800/80'
              : tool.approval_status === 'Restricted'
              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-300 dark:border-rose-800/80'
              : tool.approval_status === 'Review Required'
              ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800/80'
              : 'bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-300 dark:border-orange-800/80'
          }`}
        >
          <option value="Approved">Approved</option>
          <option value="Unreviewed">Unreviewed</option>
          <option value="Review Required">Review Required</option>
          <option value="Restricted">Restricted</option>
        </select>
      ),
    },
    {
      header: 'Risk Policy',
      accessor: (tool) => <span className="text-gray-700 dark:text-slate-300 text-xs font-mono">{tool.risk_policy}</span>,
    },
    {
      header: 'Actions',
      align: 'right',
      accessor: (tool) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => openEditModal(tool)}
            className="p-1.5 text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            title="Edit Tool"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>
          <button
            onClick={() => handleDeleteTool(tool)}
            className="p-1.5 text-gray-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer"
            title="Delete Tool"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header with Import Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-slate-100">
            AI Tool Inventory & Shadow AI Discovery
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-slate-400 font-medium mt-1">
            Manage approved enterprise AI tools and import local workstation telemetry
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setActiveImportType('history');
              setImportContent('');
              setImportResult(null);
              setImportStatusMessage(null);
            }}
            className="px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-4 h-4 text-gray-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Import History</span>
          </button>

          <button
            onClick={() => {
              setActiveImportType('process');
              setImportContent('');
              setImportResult(null);
              setImportStatusMessage(null);
            }}
            className="px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-4 h-4 text-gray-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
            </svg>
            <span>Import Processes</span>
          </button>

          <button
            onClick={() => {
              setActiveImportType('extension');
              setImportContent('');
              setImportResult(null);
              setImportStatusMessage(null);
            }}
            className="px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-700 rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-4 h-4 text-gray-500 dark:text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
            </svg>
            <span>Import Extensions</span>
          </button>

          <button
            onClick={() => {
              resetForm();
              setIsAddModalOpen(true);
            }}
            className="px-4 py-2 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span>Add AI Tool</span>
          </button>
        </div>
      </div>

      {/* Tools Table */}
      <DataTable
        columns={columns}
        data={tools}
        keyField="tool_id"
        searchPlaceholder="Filter tools by name, domain, category..."
        searchFilter={(tool, q) =>
          tool.tool_name.toLowerCase().includes(q) ||
          tool.identifier.toLowerCase().includes(q) ||
          tool.category.toLowerCase().includes(q) ||
          tool.approval_status.toLowerCase().includes(q)
        }
      />

      {/* Add / Edit Modal */}
      <Modal
        isOpen={isAddModalOpen || isEditModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setIsEditModalOpen(false);
          setSelectedTool(null);
        }}
        title={selectedTool ? `Edit ${selectedTool.tool_name}` : 'Add AI Service to Catalog'}
        subtitle="Cataloged tools are evaluated by the local prompt scanner and shadow AI discovery daemon."
      >
        <form onSubmit={handleSaveTool} className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Tool Name
            </label>
            <input
              type="text"
              required
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              placeholder="e.g. Cursor IDE, ChatGPT, Claude"
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900 dark:text-slate-100 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Type
              </label>
              <select
                value={formType}
                onChange={(e) => setFormType(e.target.value as ToolType)}
                className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-900 dark:text-slate-100 font-semibold"
              >
                <option value="Website">Website</option>
                <option value="Desktop App">Desktop App</option>
                <option value="Extension">Extension</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
                Approval Status
              </label>
              <select
                value={formApproval}
                onChange={(e) => setFormApproval(e.target.value as ToolApprovalStatus)}
                className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-900 dark:text-slate-100 font-semibold"
              >
                <option value="Approved">Approved</option>
                <option value="Unreviewed">Unreviewed</option>
                <option value="Review Required">Review Required</option>
                <option value="Restricted">Restricted</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Identifier (Domain / Process / Ext ID)
            </label>
            <input
              type="text"
              required
              value={formIdentifier}
              onChange={(e) => setFormIdentifier(e.target.value)}
              placeholder="e.g. claude.ai, cursor.exe, or extension ID"
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-gray-900 dark:text-slate-100 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Category
            </label>
            <input
              type="text"
              value={formCategory}
              onChange={(e) => setFormCategory(e.target.value)}
              placeholder="e.g. Generative Text, Code Assistant, Image Generation"
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-900 dark:text-slate-100 font-medium"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300">
              Risk Policy
            </label>
            <input
              type="text"
              value={formPolicy}
              onChange={(e) => setFormPolicy(e.target.value)}
              placeholder="e.g. Standard DLP Guardrail, Blocked, Allow with Warning"
              className="mt-1 w-full px-3.5 py-2 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none text-gray-900 dark:text-slate-100 font-medium"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2 border-t border-gray-150 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setIsAddModalOpen(false);
                setIsEditModalOpen(false);
              }}
              className="px-4 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              {selectedTool ? 'Save Changes' : 'Create Tool'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Ingestion Modal (History / Process / Extension) */}
      <Modal
        isOpen={activeImportType !== null}
        onClose={() => setActiveImportType(null)}
        title={
          activeImportType === 'history'
            ? 'Import Browser History Telemetry'
            : activeImportType === 'process'
            ? 'Import Workstation Process Inventory'
            : 'Import Browser Extension Inventory'
        }
        subtitle={
          activeImportType === 'history'
            ? 'Paste or upload browser history export (CSV/JSON). Domains and visit times are matched locally; full URLs are never preserved.'
            : activeImportType === 'process'
            ? 'Upload tasklist or ps aux output to detect AI desktop applications locally.'
            : 'Paste extension manifest list JSON. Note: declared capability, not proof of access.'
        }
        maxWidth="lg"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-slate-300 mb-1">
              Raw File Content / Data
            </label>
            <textarea
              rows={8}
              value={importContent}
              onChange={(e) => setImportContent(e.target.value)}
              placeholder={
                activeImportType === 'history'
                  ? 'Paste CSV or JSON array: [{"url": "https://chatgpt.com", "visitTime": "2026-10-15T12:00:00Z"}]'
                  : activeImportType === 'process'
                  ? 'Paste tasklist output or JSON array of process names: ["cursor.exe", "chatgpt.exe"]'
                  : 'Paste extension JSON list: [{"name": "GitHub Copilot", "id": "github.copilot", "permissions": ["tabs"]}]'
              }
              className="w-full p-3 font-mono text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 text-gray-900 dark:text-slate-100"
            />
          </div>

          {importStatusMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold border ${
                importResult?.status === 'Success'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : importResult?.status === 'Partial'
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
              }`}
            >
              {importStatusMessage}
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-150 dark:border-slate-700">
            <span className="text-[11px] text-gray-500 dark:text-slate-400 font-medium">
              Deduplication active (same tool, source & time window skipped automatically)
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setActiveImportType(null)}
                className="px-3.5 py-2 text-xs font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleProcessImport}
                disabled={!importContent.trim()}
                className="px-4 py-2 text-xs font-bold text-white bg-[#5B4DFB] hover:bg-[#4E3EF0] rounded-xl shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
              >
                Parse & Ingest Events
              </button>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
};
