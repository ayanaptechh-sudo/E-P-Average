/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AiTool } from '../database/types';

export interface SeededTool {
  tool_id: string;
  tool_name: string;
  tool_type: 'Website' | 'Desktop App' | 'Extension';
  identifier: string; // domain, process name, or extension identifier
  category: string;
  approval_status: 'Approved' | 'Restricted' | 'Unreviewed' | 'Review Required';
  risk_policy: string;
}

export const DEFAULT_AI_CATALOG: SeededTool[] = [
  {
    tool_id: 'tool_chatgpt_web',
    tool_name: 'ChatGPT Web',
    tool_type: 'Website',
    identifier: 'chatgpt.com',
    category: 'Generative Text & Assistant',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_openai_web',
    tool_name: 'OpenAI Platform',
    tool_type: 'Website',
    identifier: 'openai.com',
    category: 'AI Platform & API',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_claude_web',
    tool_name: 'Claude Web (Anthropic)',
    tool_type: 'Website',
    identifier: 'claude.ai',
    category: 'Generative Text & Reasoning',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_gemini_web',
    tool_name: 'Google Gemini',
    tool_type: 'Website',
    identifier: 'gemini.google.com',
    category: 'Generative Multimodal Assistant',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_copilot_web',
    tool_name: 'Microsoft Copilot',
    tool_type: 'Website',
    identifier: 'copilot.microsoft.com',
    category: 'Enterprise AI Assistant',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_perplexity_web',
    tool_name: 'Perplexity AI',
    tool_type: 'Website',
    identifier: 'perplexity.ai',
    category: 'AI Search & Research',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_deepseek_web',
    tool_name: 'DeepSeek',
    tool_type: 'Website',
    identifier: 'deepseek.com',
    category: 'Code & Reasoning Model',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_grok_web',
    tool_name: 'xAI Grok',
    tool_type: 'Website',
    identifier: 'x.ai',
    category: 'Conversational LLM',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_midjourney_web',
    tool_name: 'Midjourney',
    tool_type: 'Website',
    identifier: 'midjourney.com',
    category: 'Image Generation',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_poe_web',
    tool_name: 'Poe (Quora)',
    tool_type: 'Website',
    identifier: 'poe.com',
    category: 'Multi-Model Aggregator',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_huggingface_web',
    tool_name: 'Hugging Face',
    tool_type: 'Website',
    identifier: 'huggingface.co',
    category: 'Open Source Model Hub',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_character_web',
    tool_name: 'Character.AI',
    tool_type: 'Website',
    identifier: 'character.ai',
    category: 'Conversational Personas',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_notion_ai',
    tool_name: 'Notion AI',
    tool_type: 'Website',
    identifier: 'notion.so',
    category: 'Document & Knowledge AI',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_grammarly_ai',
    tool_name: 'Grammarly AI',
    tool_type: 'Website',
    identifier: 'grammarly.com',
    category: 'Writing Assistant',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_v0_web',
    tool_name: 'v0 by Vercel',
    tool_type: 'Website',
    identifier: 'v0.dev',
    category: 'Generative UI / Frontend',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_cursor_app',
    tool_name: 'Cursor IDE',
    tool_type: 'Desktop App',
    identifier: 'cursor.exe',
    category: 'AI-Native IDE',
    approval_status: 'Unreviewed',
    risk_policy: 'Developer Workstation Guard',
  },
  {
    tool_id: 'tool_chatgpt_desktop',
    tool_name: 'ChatGPT Desktop App',
    tool_type: 'Desktop App',
    identifier: 'chatgpt.exe',
    category: 'Desktop Assistant',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_claude_desktop',
    tool_name: 'Claude Desktop App',
    tool_type: 'Desktop App',
    identifier: 'claude.exe',
    category: 'Desktop Assistant & MCP',
    approval_status: 'Unreviewed',
    risk_policy: 'Standard DLP Guardrail',
  },
  {
    tool_id: 'tool_github_copilot_ext',
    tool_name: 'GitHub Copilot Extension',
    tool_type: 'Extension',
    identifier: 'github.copilot',
    category: 'Code Completion Extension',
    approval_status: 'Unreviewed',
    risk_policy: 'Source Code Leak Guard',
  },
  {
    tool_id: 'tool_grammarly_ext',
    tool_name: 'Grammarly Browser Extension',
    tool_type: 'Extension',
    identifier: 'kbfnbcaeplbcioakkpcpgfkobkghlhen',
    category: 'Browser Assistant Extension',
    approval_status: 'Unreviewed',
    risk_policy: 'Text Input Interception Risk',
  },
];
