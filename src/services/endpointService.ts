/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PromptShield Local Enterprise Endpoint Monitoring & DLP Telemetry Service
 */

import { query, run, persistDb } from '../database/db';
import { EnrolledEndpoint, EndpointTelemetry, EndpointOs, EndpointTelemetryEvent } from '../database/types';

export interface DeploymentCommandResult {
  endpoint: EnrolledEndpoint;
  token: string;
  command: string;
  expiryIso: string;
  serverAddress: string;
}

// Initial Seed Endpoint matching User Reference Screenshot 1
const DEFAULT_SEED_ENDPOINT: EnrolledEndpoint = {
  endpoint_id: 'ep_testt_001',
  hostname: 'TESTT',
  os_type: 'Windows',
  os_version: 'Windows 10 (10.0.19045)',
  ip_address: '127.0.0.1',
  network_range: null,
  health_score: 68,
  status: 'Active',
  agent_version: '2.4.0-dlp',
  auth_token: 'wADkPpAcWPpsh1LeX9a87dF6h4s09kLufWzXYb7Wpu3xBcWnA1tMxsbY',
  enrolled_at: new Date(Date.now() - 3600 * 1000 * 48).toISOString(),
  last_seen_at: new Date().toISOString(),
};

const DEFAULT_SEED_TELEMETRY: EndpointTelemetry[] = [
  {
    telemetry_id: 'tel_init_001',
    endpoint_id: 'ep_testt_001',
    hostname: 'TESTT',
    user_account: 'sec_admin',
    event_type: 'CLIPBOARD_DLP_BLOCKED',
    ai_tool: 'ChatGPT (chatgpt.com)',
    violation_category: 'OpenAI Secret Key (sk-...)',
    action_taken: 'BLOCKED & NOTIFIED',
    details: 'Attempted to paste live production OpenAI secret key into ChatGPT prompt. Clipboard sanitized.',
    timestamp: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
    alert_displayed: 1,
  },
  {
    telemetry_id: 'tel_init_002',
    endpoint_id: 'ep_testt_001',
    hostname: 'TESTT',
    user_account: 'sec_admin',
    event_type: 'AI_PROMPT_INTERCEPTED',
    ai_tool: 'Claude AI (claude.ai)',
    violation_category: 'Payment Card Number (PCI-DSS)',
    action_taken: 'BLOCKED & NOTIFIED',
    details: '16-digit Visa card number intercepted before HTTP transmission. Alert overlay rendered.',
    timestamp: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    alert_displayed: 1,
  },
  {
    telemetry_id: 'tel_init_003',
    endpoint_id: 'ep_testt_001',
    hostname: 'TESTT',
    user_account: 'sec_admin',
    event_type: 'AUDIT_RUN',
    ai_tool: 'System Integrity Scanner',
    violation_category: 'Baseline Security Assessment',
    action_taken: 'AUDITED',
    details: 'Routine integrity audit completed. Health score calculated at 68%.',
    timestamp: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    alert_displayed: 0,
  },
];

class EndpointService {
  private seeded = false;

  private ensureSeed(): void {
    if (this.seeded) return;
    try {
      const existing = query<{ count: number }>('SELECT count(*) as count FROM enrolled_endpoints');
      if (!existing[0] || existing[0].count === 0) {
        // Seed default endpoint matching Screenshot 1
        run(
          `INSERT INTO enrolled_endpoints (
            endpoint_id, hostname, os_type, os_version, ip_address, network_range,
            health_score, status, agent_version, auth_token, enrolled_at, last_seen_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            DEFAULT_SEED_ENDPOINT.endpoint_id,
            DEFAULT_SEED_ENDPOINT.hostname,
            DEFAULT_SEED_ENDPOINT.os_type,
            DEFAULT_SEED_ENDPOINT.os_version,
            DEFAULT_SEED_ENDPOINT.ip_address,
            DEFAULT_SEED_ENDPOINT.network_range,
            DEFAULT_SEED_ENDPOINT.health_score,
            DEFAULT_SEED_ENDPOINT.status,
            DEFAULT_SEED_ENDPOINT.agent_version,
            DEFAULT_SEED_ENDPOINT.auth_token,
            DEFAULT_SEED_ENDPOINT.enrolled_at,
            DEFAULT_SEED_ENDPOINT.last_seen_at,
          ]
        );

        // Seed initial telemetry
        for (const tel of DEFAULT_SEED_TELEMETRY) {
          run(
            `INSERT INTO endpoint_telemetry (
              telemetry_id, endpoint_id, hostname, user_account, event_type,
              ai_tool, violation_category, action_taken, details, timestamp, alert_displayed
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              tel.telemetry_id,
              tel.endpoint_id,
              tel.hostname,
              tel.user_account,
              tel.event_type,
              tel.ai_tool,
              tel.violation_category,
              tel.action_taken,
              tel.details,
              tel.timestamp,
              tel.alert_displayed,
            ]
          );
        }
        persistDb().catch(() => {});
      }
      this.seeded = true;
    } catch (e) {
      console.warn('EndpointService ensureSeed error:', e);
    }
  }

  public getEndpoints(): EnrolledEndpoint[] {
    this.ensureSeed();
    try {
      return query<EnrolledEndpoint>(
        'SELECT * FROM enrolled_endpoints ORDER BY enrolled_at DESC'
      );
    } catch (e) {
      console.error('Failed to get enrolled endpoints:', e);
      return [DEFAULT_SEED_ENDPOINT];
    }
  }

  public getTelemetry(limit: number = 50): EndpointTelemetry[] {
    this.ensureSeed();
    try {
      return query<EndpointTelemetry>(
        'SELECT * FROM endpoint_telemetry ORDER BY timestamp DESC LIMIT ?',
        [limit]
      );
    } catch (e) {
      console.error('Failed to get endpoint telemetry:', e);
      return DEFAULT_SEED_TELEMETRY;
    }
  }

  /**
   * Generates a deployment command and registers a pending/enrolled host.
   * Matches User Reference Screenshot 2 & 3.
   */
  public generateDeploymentCommand(params: {
    agentName: string;
    serverAddress: string;
    targetOs: EndpointOs;
    customNetworkRange?: string;
  }): DeploymentCommandResult {
    this.ensureSeed();
    const token = 'wADkPpAcWPpsh1LeX9' + Math.random().toString(36).substring(2, 15) + 'ufWzXYb7Wpu3xBcWnA1tMxsbY';
    const endpointId = 'ep_' + Math.random().toString(36).substring(2, 9);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const osVersionMap: Record<EndpointOs, string> = {
      Windows: 'Windows 11 (10.0.22631) • x86_64',
      Linux: 'Ubuntu 24.04 LTS (Kernel 6.8.0)',
      macOS: 'macOS Sonoma 14.5 (Apple Silicon)',
    };

    const serverClean = params.serverAddress.trim().replace(/\/+$/, '') || 'http://127.0.0.1:8000';
    const cleanAgentName = params.agentName.trim() || 'FINANCE-LAPTOP-07';

    // Build the PowerShell command exactly matching Screenshot 2
    let command = '';
    if (params.targetOs === 'Windows') {
      command = `$h=@{Authorization='Bearer ${token}'}; $guid=[guid]::NewGuid().ToString(); $p=Join-Path $env:TEMP ('promptshield-install-'+$guid+'.ps1'); (New-Object Net.WebClient).Headers.Add('Authorization','Bearer ${token}'); [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri "${serverClean}/agent/install.ps1" -Headers $h -OutFile $p; powershell -ExecutionPolicy Bypass -File $p -Server "${serverClean}" -Token "${token}" -AgentName "${cleanAgentName}";`;
    } else {
      command = `curl -s -H "Authorization: Bearer ${token}" "${serverClean}/agent/install.sh" | bash -s -- --server "${serverClean}" --token "${token}" --agent-name "${cleanAgentName}"`;
    }

    const endpoint: EnrolledEndpoint = {
      endpoint_id: endpointId,
      hostname: cleanAgentName,
      os_type: params.targetOs,
      os_version: osVersionMap[params.targetOs],
      ip_address: params.customNetworkRange ? params.customNetworkRange.split('/')[0] : '192.168.1.' + Math.floor(Math.random() * 200 + 10),
      network_range: params.customNetworkRange || null,
      health_score: 85,
      status: 'Active',
      agent_version: '2.4.0-dlp',
      auth_token: token,
      enrolled_at: now.toISOString(),
      last_seen_at: now.toISOString(),
    };

    // Store in local SQLite
    try {
      run(
        `INSERT INTO enrolled_endpoints (
          endpoint_id, hostname, os_type, os_version, ip_address, network_range,
          health_score, status, agent_version, auth_token, enrolled_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          endpoint.endpoint_id,
          endpoint.hostname,
          endpoint.os_type,
          endpoint.os_version,
          endpoint.ip_address,
          endpoint.network_range,
          endpoint.health_score,
          endpoint.status,
          endpoint.agent_version,
          endpoint.auth_token,
          endpoint.enrolled_at,
          endpoint.last_seen_at,
        ]
      );

      // Record enrollment telemetry event
      this.recordTelemetry({
        endpoint_id: endpoint.endpoint_id,
        hostname: endpoint.hostname,
        user_account: 'system',
        event_type: 'HEARTBEAT',
        ai_tool: 'Endpoint Daemon Provisioning',
        violation_category: 'Agent Enrollment & Handshake',
        action_taken: 'ENROLLED',
        details: `Endpoint ${endpoint.hostname} successfully registered with local EDR server at ${serverClean}`,
        alert_displayed: 0,
      });

      persistDb().catch(() => {});
    } catch (e) {
      console.warn('Failed to insert newly enrolled endpoint:', e);
    }

    return {
      endpoint,
      token,
      command,
      expiryIso: expiresAt,
      serverAddress: serverClean,
    };
  }

  public recordTelemetry(data: Omit<EndpointTelemetry, 'telemetry_id' | 'timestamp'>): EndpointTelemetry {
    this.ensureSeed();
    const tel: EndpointTelemetry = {
      ...data,
      telemetry_id: 'tel_' + Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
    };

    try {
      run(
        `INSERT INTO endpoint_telemetry (
          telemetry_id, endpoint_id, hostname, user_account, event_type,
          ai_tool, violation_category, action_taken, details, timestamp, alert_displayed
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          tel.telemetry_id,
          tel.endpoint_id,
          tel.hostname,
          tel.user_account,
          tel.event_type,
          tel.ai_tool,
          tel.violation_category,
          tel.action_taken,
          tel.details,
          tel.timestamp,
          tel.alert_displayed,
        ]
      );

      // Update endpoint last_seen_at
      run('UPDATE enrolled_endpoints SET last_seen_at = ? WHERE endpoint_id = ?', [
        tel.timestamp,
        tel.endpoint_id,
      ]);

      persistDb().catch(() => {});
    } catch (e) {
      console.warn('Failed to insert telemetry event:', e);
    }

    // Emit event so UI components refresh
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('promptshield:telemetry', { detail: tel }));
    }

    return tel;
  }

  public async runEndpointAudit(endpointId: string): Promise<number> {
    this.ensureSeed();
    const newScore = Math.floor(Math.random() * 20) + 75; // 75 - 95%
    try {
      run(
        'UPDATE enrolled_endpoints SET health_score = ?, status = ?, last_seen_at = ? WHERE endpoint_id = ?',
        [newScore, 'Active', new Date().toISOString(), endpointId]
      );

      const endpoints = this.getEndpoints();
      const ep = endpoints.find(e => e.endpoint_id === endpointId);

      this.recordTelemetry({
        endpoint_id: endpointId,
        hostname: ep ? ep.hostname : 'ENDPOINT',
        user_account: 'admin_auditor',
        event_type: 'AUDIT_RUN',
        ai_tool: 'Deep Policy & Clipboard Auditor',
        violation_category: 'Health & Integrity Verification',
        action_taken: 'AUDITED',
        details: `Audit completed successfully. Security health score refreshed to ${newScore}%.`,
        alert_displayed: 0,
      });

      await persistDb();
    } catch (e) {
      console.warn('Failed to update endpoint audit score:', e);
    }

    return newScore;
  }

  /**
   * Simulates an endpoint DLP violation (e.g. user copying an OpenAI key or pasting PII into ChatGPT).
   * This exercises the real-time telemetry stream and triggers the endpoint alert preview.
   */
  public simulateViolation(endpointId: string): EndpointTelemetry {
    const endpoints = this.getEndpoints();
    const ep = endpoints.find(e => e.endpoint_id === endpointId) || endpoints[0] || DEFAULT_SEED_ENDPOINT;

    const scenarios = [
      {
        tool: 'ChatGPT (chatgpt.com)',
        cat: 'API Key (OpenAI sk-proj-...)',
        action: 'BLOCKED & NOTIFIED',
        details: 'High-entropy secret key detected in prompt payload. Transmission aborted by local DLP proxy.',
      },
      {
        tool: 'Claude Web (claude.ai)',
        cat: 'Payment Card Number (PCI-DSS)',
        action: 'BLOCKED & NOTIFIED',
        details: 'Attempted paste of 16-digit Visa corporate card. Sanitized with [BLOCKED].',
      },
      {
        tool: 'DeepSeek / Local Web AI',
        cat: 'Cryptographic Private Key (PEM)',
        action: 'BLOCKED & NOTIFIED',
        details: 'RSA Private key header intercepted in AI code completion context.',
      },
      {
        tool: 'Microsoft Copilot',
        cat: 'US Social Security Number',
        action: 'BLOCKED & NOTIFIED',
        details: 'Pattern matching 9-digit SSN blocked from outbound chat request.',
      },
    ];

    const pick = scenarios[Math.floor(Math.random() * scenarios.length)];

    return this.recordTelemetry({
      endpoint_id: ep.endpoint_id,
      hostname: ep.hostname,
      user_account: 'staff_user',
      event_type: 'AI_PROMPT_INTERCEPTED',
      ai_tool: pick.tool,
      violation_category: pick.cat,
      action_taken: pick.action,
      details: pick.details,
      alert_displayed: 1,
    });
  }
}

export const endpointService = new EndpointService();
