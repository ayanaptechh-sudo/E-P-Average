/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { computeSha256 } from '../security/crypto';
import { reportRepo } from '../database/repositories/reportRepo';
import { auditRepo } from '../database/repositories/userRepo';
import { incidentRepo } from '../database/repositories/alertRepo';
import { scanRepo } from '../database/repositories/scanRepo';
import { toolRepo } from '../database/repositories/toolRepo';
import { policyRepo } from '../database/repositories/policyRepo';
import { ReportRecord, ReportType, Incident, IncidentTimeline, AiTool } from '../database/types';
import { getActiveScannerRules } from '../scanner/scannerEngine';

export interface UsageReportData {
  reportId: string;
  generatedAt: string;
  generatedBy: string;
  reportingPeriod: string;
  totalTools: number;
  approvedCount: number;
  unreviewedCount: number;
  restrictedCount: number;
  totalEvents: number;
  totalFindings: number;
  categoriesDetected: { category: string; count: number }[];
  riskDistribution: { Low: number; Medium: number; High: number; Critical: number };
  telemetryLimitations: string[];
  recommendations: string[];
  toolList?: AiTool[];
  incidentList?: Incident[];
  activeRulesCount?: number;
  totalScansCount?: number;
}

export interface IncidentReportData {
  reportId: string;
  generatedAt: string;
  generatedBy: string;
  incident: Incident;
  timeline: IncidentTimeline[];
  username: string;
  assignedToName: string;
  telemetryLimitations: string[];
  recommendations: string[];
}

export function generateIncidentReportData(incidentId: string): IncidentReportData | null {
  const incident = incidentRepo.getById(incidentId);
  if (!incident) return null;
  const timeline = incidentRepo.getTimeline(incidentId);
  return {
    reportId: `INC-${incident.incident_number}-${Date.now().toString().slice(-4)}`,
    generatedAt: new Date().toISOString(),
    generatedBy: incident.username || 'Security Lead',
    incident,
    timeline,
    username: incident.username || incident.user_id,
    assignedToName: incident.assigned_name || 'Unassigned',
    telemetryLimitations: [
      'Evidence strictly distinguishes local prompt scans from confirmed egress transmissions.',
      'Browser extensions reflect declared capabilities, not proof of content transmission.',
    ],
    recommendations: [
      'Remediate exposed credentials or rotate associated API tokens immediately.',
      'Review employee awareness training on approved AI tooling catalog.',
      'Maintain chronological timeline records for compliance and audit defense.',
    ],
  };
}

/**
 * Enterprise Audit Report PDF Generator
 * Structured corporate Information Security Audit:
 * 1. Professional Cover Page (Title, Subtitle, STRICTLY CONFIDENTIAL box, Metadata block, forced page break).
 * 2. Page 2: Document Control & Audit Scope (Scope & Methodology, Distribution List).
 * 3. Section 1: Executive Risk Summary (Total Scans, Interceptions, Active Rules, Tool breakdown).
 * 4. Section 2: Security Incident Chronology (Ledger table, clean empty row if 0 incidents).
 * 5. Section 3: AI Tool Inventory & Governance (Complete catalog with approval statuses).
 * 6. Final Section: Remediation & Auditor Sign-off (Recommendations, physical signature lines with dates).
 * 7. Running Footers on every page except cover: "Confidential - Internal Use Only | PromptShield DLP" & "Page X of Y".
 */
export function generateUsageReportPdf(data: UsageReportData): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  // Real data acquisition
  const allIncidents = data.incidentList ?? incidentRepo.getAll();
  const allTools = data.toolList ?? toolRepo.getAll();
  const policyRecord = policyRepo.getLatest('pol_data_categories');
  const activeRulesSummary = getActiveScannerRules(policyRecord?.policy_json, policyRecord?.version);
  const activeRulesCount = data.activeRulesCount ?? activeRulesSummary.totalCount;
  const totalScans = data.totalScansCount ?? scanRepo.getScanSessions().length;
  const totalFindings = data.totalFindings;

  const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
  const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
  const leftMargin = 16;
  const rightMargin = 16;
  const contentWidth = pageWidth - leftMargin - rightMargin; // 178mm
  const rightEdge = pageWidth - rightMargin; // 194mm

  // Corporate Color Palette
  const navyHeader: [number, number, number] = [11, 17, 32]; // #0B1120
  const slateDark: [number, number, number] = [30, 41, 59]; // #1E293B
  const slateMuted: [number, number, number] = [100, 116, 139]; // #64748B
  const indigoPrimary: [number, number, number] = [79, 70, 229]; // #4F46E5
  const borderLight: [number, number, number] = [226, 232, 240]; // #E2E8F0
  const zebraBg: [number, number, number] = [248, 250, 252]; // #F8FAFC
  const crimsonAlert: [number, number, number] = [153, 27, 27]; // #991B1B

  // ===========================================================================
  // 1. PROFESSIONAL COVER PAGE
  // ===========================================================================

  // Top accent bar
  doc.setFillColor(...navyHeader);
  doc.rect(0, 0, pageWidth, 8, 'F');

  doc.setFillColor(...indigoPrimary);
  doc.rect(0, 8, pageWidth, 2, 'F');

  // Decorative watermark / background motif bar on left edge
  doc.setFillColor(241, 245, 249);
  doc.rect(0, 10, 6, pageHeight - 10, 'F');

  // Brand Name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(...indigoPrimary);
  doc.text('PROMPTSHIELD // ENTERPRISE INFORMATION SECURITY', leftMargin, 38);

  // Main Cover Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.setTextColor(...navyHeader);
  doc.text('Information Security &', leftMargin, 52);
  doc.text('Compliance Audit', leftMargin, 63);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(13);
  doc.setTextColor(...slateMuted);
  doc.text('Local DLP Governance & Shadow AI Risk Dossier', leftMargin, 74);

  // Thin separator rule
  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.6);
  doc.line(leftMargin, 82, rightEdge, 82);

  // Prominent STRICTLY CONFIDENTIAL Warning Box
  doc.setFillColor(254, 242, 242); // crimson 50
  doc.setDrawColor(254, 202, 202); // crimson 200
  doc.roundedRect(leftMargin, 92, contentWidth, 24, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...crimsonAlert);
  doc.text('STRICTLY CONFIDENTIAL — PROPRIETARY SECURITY AUDIT', leftMargin + 6, 101);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(127, 29, 29);
  doc.text(
    'This audit report contains sensitive governance metrics and employee AI telemetry. Distribution is restricted to\nauthorized compliance personnel and designated security officers under corporate non-disclosure agreements.',
    leftMargin + 6,
    107
  );

  // Report Metadata Block (Corporate Structured Grid)
  const metaBoxY = 126;
  doc.setFillColor(...zebraBg);
  doc.setDrawColor(...borderLight);
  doc.roundedRect(leftMargin, metaBoxY, contentWidth, 68, 2, 2, 'FD');

  // Inner heading
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navyHeader);
  doc.text('DOCUMENT AUDIT CLASSIFICATION', leftMargin + 8, metaBoxY + 10);

  doc.setDrawColor(...borderLight);
  doc.setLineWidth(0.3);
  doc.line(leftMargin + 8, metaBoxY + 14, rightEdge - 8, metaBoxY + 14);

  // 4 Corporate Meta Items in 2-Column Grid
  const col1X = leftMargin + 8;
  const col2X = leftMargin + 92;

  // Row 1
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...slateMuted);
  doc.text('REPORT IDENTIFIER', col1X, metaBoxY + 23);
  doc.text('GENERATION TIMESTAMP (UTC)', col2X, metaBoxY + 23);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navyHeader);
  doc.text(data.reportId, col1X, metaBoxY + 29);
  doc.text(new Date(data.generatedAt).toISOString().replace('T', ' ').slice(0, 19) + ' UTC', col2X, metaBoxY + 29);

  // Row 2
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...slateMuted);
  doc.text('PREPARED BY (AUDITOR)', col1X, metaBoxY + 41);
  doc.text('REPORTING AUDIT PERIOD', col2X, metaBoxY + 41);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navyHeader);
  doc.text(data.generatedBy || 'Security Lead', col1X, metaBoxY + 47);
  doc.text(data.reportingPeriod || 'All-Time Historical Cycle', col2X, metaBoxY + 47);

  // Row 3 (Integrity / Engine)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...slateMuted);
  doc.text('AUDIT EVALUATION ENGINE', col1X, metaBoxY + 57);
  doc.text('TELEMETRY INTEGRITY', col2X, metaBoxY + 57);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...slateDark);
  doc.text('PromptShield Airgap WASM / Zero-ReDoS AST', col1X, metaBoxY + 63);
  doc.text('Cryptographically Registered (SHA-256)', col2X, metaBoxY + 63);

  // Lower Corporate Statement
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...slateMuted);
  doc.text(
    'PromptShield Security Architecture • Airgap Client-Side Memory Isolation • Zero Cloud Exfiltration',
    pageWidth / 2,
    275,
    { align: 'center' }
  );

  // Force page break after Cover Page
  doc.addPage();

  // ===========================================================================
  // 2. PAGE 2: DOCUMENT CONTROL & AUDIT SCOPE
  // ===========================================================================
  let currentY = 22;

  // Top section header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...navyHeader);
  doc.text('Document Control & Audit Scope', leftMargin, currentY);

  currentY += 4;
  doc.setDrawColor(...indigoPrimary);
  doc.setLineWidth(1);
  doc.line(leftMargin, currentY, leftMargin + 28, currentY);

  currentY += 8;

  // Scope & Methodology Narrative
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...slateDark);
  doc.text('Audit Scope & Methodology', leftMargin, currentY);

  currentY += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const scopeText =
    'This audit report reflects all monitored client-side prompt scans, workstation process detections, and clipboard safeguarding events recorded within PromptShield. All inspection operations execute locally within an in-memory WebAssembly airgap sandbox. Under our strict Zero-Leak Privacy Guarantee, no raw prompt text, user clipboard buffers, API keys, or personal identity numbers are ever persisted in storage or printed in this document. Only structural metadata, rule classifications, and categorical counts are reviewed.';
  const splitScope = doc.splitTextToSize(scopeText, contentWidth);
  doc.text(splitScope, leftMargin, currentY);

  currentY += splitScope.length * 4.2 + 8;

  // Distribution List Table
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...slateDark);
  doc.text('Formal Audit Distribution List', leftMargin, currentY);

  currentY += 4;

  const distributionRows = [
    ['Chief Information Security Officer (CISO)', 'Executive Security Oversight', 'Full Audit Dossier', 'Sign-off Required'],
    ['Lead Security Operations Analyst', 'DLP Operations & Incident Response', 'Full Audit Dossier', 'Action Assigned'],
    ['Corporate Data Protection Officer (DPO)', 'Regulatory Compliance & Privacy', 'Executive & Governance Ledger', 'Record Copy'],
    ['Internal IT & Infrastructure Committee', 'Endpoint Policy & Tool Approvals', 'AI Tool Inventory & Policies', 'Informational'],
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin },
    head: [['Stakeholder Role', 'Operational Department', 'Access Level', 'Governance Action']],
    body: distributionRows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      textColor: slateDark,
      lineColor: borderLight,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: navyHeader,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: zebraBg,
    },
  });

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

  // ===========================================================================
  // 3. SECTION 1: EXECUTIVE RISK SUMMARY
  // ===========================================================================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...navyHeader);
  doc.text('Section 1: Executive Risk Summary', leftMargin, currentY);

  currentY += 4;
  doc.setDrawColor(...indigoPrimary);
  doc.setLineWidth(1);
  doc.line(leftMargin, currentY, leftMargin + 28, currentY);

  currentY += 7;

  const execSummaryRows = [
    [
      'Total Client-Side Local Scans',
      String(totalScans),
      'Client-side memory airgap scans (Clipboard & Manual)',
      'Active Protection',
    ],
    [
      'Total PII & Secret Interceptions',
      String(totalFindings),
      'Sensitive pattern matches prevented or quarantined',
      totalFindings > 0 ? 'Requires Review' : 'Clean Posture',
    ],
    [
      'Active DLP Guardrail Rules',
      String(activeRulesCount),
      'Safe non-backtracking AST regex policies (Zero ReDoS)',
      'Enforced',
    ],
    [
      'Monitored AI Tool Endpoints',
      String(allTools.length),
      `${data.approvedCount} Approved • ${data.restrictedCount} Restricted • ${data.unreviewedCount} Unreviewed`,
      'Cataloged',
    ],
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin },
    head: [['Audit Dimension', 'Value', 'Operational Context', 'Control Status']],
    body: execSummaryRows,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: slateDark,
      lineColor: borderLight,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: navyHeader,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: zebraBg,
    },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 50 },
      1: { halign: 'center', fontStyle: 'bold', cellWidth: 22 },
      2: { cellWidth: 76 },
      3: { halign: 'center', cellWidth: 30, fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 3) {
        const val = hookData.cell.raw as string;
        if (val === 'Requires Review') {
          hookData.cell.styles.textColor = crimsonAlert;
          hookData.cell.styles.fillColor = [254, 242, 242];
        } else if (val === 'Clean Posture' || val === 'Enforced' || val === 'Active Protection') {
          hookData.cell.styles.textColor = [21, 128, 61]; // green-700
        }
      }
    },
  });

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // ===========================================================================
  // 4. SECTION 2: SECURITY INCIDENT CHRONOLOGY (LEDGER)
  // ===========================================================================
  if (currentY > 210) {
    doc.addPage();
    currentY = 22;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...navyHeader);
  doc.text('Section 2: Security Incident Chronology', leftMargin, currentY);

  currentY += 4;
  doc.setDrawColor(...indigoPrimary);
  doc.setLineWidth(1);
  doc.line(leftMargin, currentY, leftMargin + 28, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...slateMuted);
  doc.text(
    'Formal security investigation dossier. Chronological log of intercepted data transmissions and policy escalations.',
    leftMargin,
    currentY
  );

  currentY += 4;

  const incidentRows = allIncidents.map((inc) => {
    const formattedDate = new Date(inc.opened_at).toISOString().replace('T', ' ').slice(0, 19);
    const toolMatch = inc.summary.match(/(?:ChatGPT|Claude|Cursor|Perplexity|Copilot|Gemini|DeepSeek|v0)/i);
    const destTool = toolMatch ? toolMatch[0] : 'Workstation Sandbox';
    const policyViolated = inc.title.replace(/^(?:DLP Escalation:?|Incident:?)\s*/i, '') || 'Data Protection Policy';
    return [
      formattedDate,
      destTool,
      policyViolated,
      inc.priority.toUpperCase(),
      inc.status,
    ];
  });

  const incidentBody =
    incidentRows.length > 0
      ? incidentRows
      : [['—', 'No incidents detected - Clean Audit Cycle', 'Zero data protection violations recorded', 'CLEAN', 'Resolved']];

  autoTable(doc, {
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin },
    head: [['Date/Time (UTC)', 'Destination AI Tool', 'Policy Violated', 'Severity', 'State']],
    body: incidentBody,
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: slateDark,
      lineColor: borderLight,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: navyHeader,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: zebraBg,
    },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 38, fontStyle: 'bold' },
      2: { cellWidth: 63 },
      3: { cellWidth: 21, halign: 'center', fontStyle: 'bold' },
      4: { cellWidth: 21, halign: 'center' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 3) {
        const textVal = hookData.cell.raw as string;
        if (textVal === 'CRITICAL') {
          hookData.cell.styles.textColor = crimsonAlert;
          hookData.cell.styles.fillColor = [254, 242, 242];
        } else if (textVal === 'HIGH') {
          hookData.cell.styles.textColor = [194, 65, 12];
          hookData.cell.styles.fillColor = [255, 247, 237];
        } else if (textVal === 'MEDIUM') {
          hookData.cell.styles.textColor = [161, 98, 7];
          hookData.cell.styles.fillColor = [254, 252, 232];
        } else if (textVal === 'LOW' || textVal === 'CLEAN') {
          hookData.cell.styles.textColor = [21, 128, 61];
          hookData.cell.styles.fillColor = [240, 253, 244];
        }
      }
    },
  });

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // ===========================================================================
  // 5. SECTION 3: AI TOOL INVENTORY & GOVERNANCE
  // ===========================================================================
  if (currentY > 210) {
    doc.addPage();
    currentY = 22;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...navyHeader);
  doc.text('Section 3: AI Tool Inventory & Governance', leftMargin, currentY);

  currentY += 4;
  doc.setDrawColor(...indigoPrimary);
  doc.setLineWidth(1);
  doc.line(leftMargin, currentY, leftMargin + 28, currentY);

  currentY += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...slateMuted);
  doc.text(
    'Monitored web domains, desktop processes, and browser extensions subject to active enterprise DLP guardrails.',
    leftMargin,
    currentY
  );

  currentY += 4;

  const toolsRows = allTools.map((t) => [
    t.tool_name,
    t.tool_type,
    t.category,
    t.identifier,
    t.approval_status.toUpperCase(),
  ]);

  const toolBody =
    toolsRows.length > 0
      ? toolsRows
      : [['No AI tools registered', '—', '—', '—', 'UNREVIEWED']];

  autoTable(doc, {
    startY: currentY,
    margin: { left: leftMargin, right: rightMargin },
    head: [['Tool Name', 'Platform', 'Category', 'Domain / Process Identifier', 'Status']],
    body: toolBody,
    theme: 'grid',
    styles: {
      fontSize: 7.5,
      cellPadding: 2.5,
      textColor: slateDark,
      lineColor: borderLight,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: navyHeader,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: zebraBg,
    },
    columnStyles: {
      0: { cellWidth: 40, fontStyle: 'bold' },
      1: { cellWidth: 24 },
      2: { cellWidth: 44 },
      3: { cellWidth: 46 },
      4: { cellWidth: 24, halign: 'center', fontStyle: 'bold' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body' && hookData.column.index === 4) {
        const val = hookData.cell.raw as string;
        if (val === 'APPROVED') {
          hookData.cell.styles.textColor = [21, 128, 61];
          hookData.cell.styles.fillColor = [240, 253, 244];
        } else if (val === 'RESTRICTED') {
          hookData.cell.styles.textColor = crimsonAlert;
          hookData.cell.styles.fillColor = [254, 242, 242];
        } else {
          hookData.cell.styles.textColor = [100, 116, 139];
          hookData.cell.styles.fillColor = [248, 250, 252];
        }
      }
    },
  });

  currentY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14;

  // ===========================================================================
  // 6. FINAL SECTION: REMEDIATION & AUDITOR SIGN-OFF
  // ===========================================================================
  if (currentY > 190) {
    doc.addPage();
    currentY = 22;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(...navyHeader);
  doc.text('Final Section: Remediation & Auditor Sign-off', leftMargin, currentY);

  currentY += 4;
  doc.setDrawColor(...indigoPrimary);
  doc.setLineWidth(1);
  doc.line(leftMargin, currentY, leftMargin + 28, currentY);

  currentY += 8;

  // Remediation recommendations
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(...slateDark);
  doc.text('Actionable Remediation Recommendations', leftMargin, currentY);

  currentY += 5;

  const defaultRecommendations = [
    'Classify all remaining "Unreviewed" AI tools in the corporate catalog to eliminate shadow AI usage.',
    'Rotate any API keys or tokens flagged in intercepted scans immediately to prevent unauthorized egress.',
    'Enforce mandatory local clipboard pre-flight scanning before developers paste proprietary code into external LLMs.',
    'Maintain chronological audit logs and verified SHA-256 integrity digests for all quarterly compliance reviews.',
  ];

  const recommendationsToPrint =
    data.recommendations && data.recommendations.length > 0
      ? data.recommendations
      : defaultRecommendations;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);

  recommendationsToPrint.forEach((rec, idx) => {
    doc.text(`${idx + 1}.  ${rec}`, leftMargin + 2, currentY);
    currentY += 5;
  });

  currentY += 10;

  // Physical Signatures Box with Lead Auditor & CISO
  const signBlockY = Math.max(currentY, 215);
  const signColWidth = (contentWidth - 16) / 2; // ~81mm each
  const signCol1 = leftMargin;
  const signCol2 = leftMargin + signColWidth + 16;

  // Auditor Signature
  doc.setDrawColor(...slateMuted);
  doc.setLineWidth(0.4);
  doc.line(signCol1, signBlockY + 22, signCol1 + signColWidth, signBlockY + 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...navyHeader);
  doc.text('Lead Security Auditor', signCol1, signBlockY + 27);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...slateMuted);
  doc.text(`Name: ${data.generatedBy || 'Security Lead'}`, signCol1, signBlockY + 32);
  doc.text(`Signature Date: ${new Date(data.generatedAt).toISOString().slice(0, 10)}`, signCol1, signBlockY + 37);

  // CISO Signature
  doc.setDrawColor(...slateMuted);
  doc.setLineWidth(0.4);
  doc.line(signCol2, signBlockY + 22, signCol2 + signColWidth, signBlockY + 22);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...navyHeader);
  doc.text('Chief Information Security Officer (CISO)', signCol2, signBlockY + 27);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...slateMuted);
  doc.text('Name: _______________________________', signCol2, signBlockY + 32);
  doc.text('Signature Date: ________________________', signCol2, signBlockY + 37);

  // ===========================================================================
  // 7. RUNNING FOOTERS ON EVERY PAGE EXCEPT COVER (PAGE 1)
  // ===========================================================================
  const totalPages = doc.getNumberOfPages();

  for (let i = 2; i <= totalPages; i++) {
    doc.setPage(i);

    // Running top header for subsequent pages
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...slateMuted);
    doc.text('PromptShield // DLP & Shadow AI Compliance Audit', leftMargin, 11);
    doc.text(`Report ID: ${data.reportId}`, rightEdge, 11, { align: 'right' });

    doc.setDrawColor(...borderLight);
    doc.setLineWidth(0.3);
    doc.line(leftMargin, 13, rightEdge, 13);

    // Running bottom footer
    doc.setDrawColor(...borderLight);
    doc.setLineWidth(0.4);
    doc.line(leftMargin, 284, rightEdge, 284);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...slateMuted);
    doc.text('Confidential - Internal Use Only | PromptShield DLP', leftMargin, 289);
    doc.text(`Page ${i} of ${totalPages}`, rightEdge, 289, { align: 'right' });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

/**
 * Generate PDF for Incident Summary Report
 */
export function generateIncidentReportPdf(data: IncidentReportData): Uint8Array {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const navyHeader: [number, number, number] = [11, 17, 32];
  const slateDark: [number, number, number] = [30, 41, 59];
  const indigoPrimary: [number, number, number] = [79, 70, 229];
  const slateMuted: [number, number, number] = [100, 116, 139];
  const borderLight: [number, number, number] = [226, 232, 240];
  const zebraBg: [number, number, number] = [248, 250, 252];

  const leftMargin = 16;
  const rightMargin = 16;
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - leftMargin - rightMargin;
  const rightEdge = pageWidth - rightMargin;

  // Header banner accent bar
  doc.setFillColor(...navyHeader);
  doc.rect(0, 0, pageWidth, 6, 'F');
  doc.setFillColor(...indigoPrimary);
  doc.rect(0, 6, pageWidth, 2, 'F');

  // Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...navyHeader);
  doc.text(`Security Incident Dossier: ${data.incident.incident_number}`, leftMargin, 20);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...slateMuted);
  doc.text(`Title: ${data.incident.title}  |  Priority: ${data.incident.priority}  |  Status: ${data.incident.status}`, leftMargin, 26);

  // Meta box
  doc.setDrawColor(...borderLight);
  doc.setFillColor(...zebraBg);
  doc.roundedRect(leftMargin, 31, contentWidth, 18, 1.5, 1.5, 'FD');

  doc.setFontSize(8);
  doc.setTextColor(...slateMuted);
  doc.text('TARGET USER:', leftMargin + 4, 37);
  doc.text('INVESTIGATOR:', leftMargin + 55, 37);
  doc.text('OPENED AT:', leftMargin + 115, 37);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...navyHeader);
  doc.text(data.username, leftMargin + 4, 44);
  doc.text(data.assignedToName || 'Unassigned', leftMargin + 55, 44);
  doc.text(new Date(data.incident.opened_at).toISOString().replace('T', ' ').slice(0, 19) + ' UTC', leftMargin + 115, 44);

  // Executive Summary
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...navyHeader);
  doc.text('Executive Summary & Scope:', leftMargin, 56);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  const splitSummary = doc.splitTextToSize(data.incident.summary || 'No summary text provided.', contentWidth);
  doc.text(splitSummary, leftMargin, 62);

  const timelineStartY = 62 + splitSummary.length * 4.5 + 4;

  // Timeline Table
  const timelineRows = data.timeline.map((t) => [
    new Date(t.event_time).toISOString().replace('T', ' ').slice(0, 19),
    t.event_type,
    t.description,
    t.recorded_by,
  ]);

  autoTable(doc, {
    startY: timelineStartY,
    margin: { left: leftMargin, right: rightMargin },
    head: [['Time (UTC)', 'Event Type', 'Description (Scrubbed Metadata)', 'Recorded By']],
    body: timelineRows.length > 0 ? timelineRows : [['—', 'No timeline entries recorded', '—', '—']],
    theme: 'grid',
    styles: {
      fontSize: 8,
      cellPadding: 3,
      textColor: slateDark,
      lineColor: borderLight,
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: navyHeader,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: zebraBg,
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 12;

  // Signatures
  const signY = Math.max(finalY, 235);
  doc.setDrawColor(...slateMuted);
  doc.line(leftMargin, signY, leftMargin + 75, signY);
  doc.line(leftMargin + 95, signY, rightEdge, signY);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...navyHeader);
  doc.text('Assigned Lead Investigator Signature', leftMargin, signY + 5);
  doc.text('Chief Information Security Officer Approval', leftMargin + 95, signY + 5);

  // Footers on all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...borderLight);
    doc.setLineWidth(0.4);
    doc.line(leftMargin, 284, rightEdge, 284);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...slateMuted);
    doc.text('Confidential - Internal Use Only | PromptShield DLP', leftMargin, 289);
    doc.text(`Page ${i} of ${totalPages}`, rightEdge, 289, { align: 'right' });
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

/**
 * Generate self-contained HTML for AI Usage & Compliance Report
 */
export function generateUsageReportHtml(data: UsageReportData): string {
  const allIncidents = data.incidentList ?? incidentRepo.getAll();
  const allTools = data.toolList ?? toolRepo.getAll();
  const policyRecord = policyRepo.getLatest('pol_data_categories');
  const activeRulesSummary = getActiveScannerRules(policyRecord?.policy_json, policyRecord?.version);
  const activeRulesCount = data.activeRulesCount ?? activeRulesSummary.totalCount;
  const totalScans = data.totalScansCount ?? scanRepo.getScanSessions().length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PromptShield — DLP & Shadow AI Compliance Audit [${data.reportId}]</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0b1120; background: #fff; margin: 0; padding: 40px; font-size: 13px; line-height: 1.5; }
    .cover { border-bottom: 3px solid #0b1120; padding-bottom: 24px; margin-bottom: 32px; }
    h1 { margin: 0; font-size: 26px; color: #0b1120; font-weight: 800; }
    .subtitle { color: #64748b; font-size: 14px; margin-top: 6px; }
    .confidential-box { background: #fef2f2; border: 1px solid #fecaca; border-radius: 6px; padding: 14px; margin: 20px 0; color: #991b1b; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; }
    .meta-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; }
    .meta-val { font-size: 14px; font-weight: 700; color: #0b1120; margin-top: 4px; font-family: monospace; }
    .section-title { font-size: 15px; font-weight: 700; color: #0b1120; margin: 32px 0 10px 0; border-bottom: 2px solid #4f46e5; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    th { background: #0b1120; text-align: left; padding: 9px 12px; font-size: 11px; color: #ffffff; border: 1px solid #1e293b; font-weight: 600; }
    td { padding: 9px 12px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) { background-color: #f8fafc; }
    .tag { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .tag-app { color: #15803d; background: #f0fdf4; border: 1px solid #bbf7d0; }
    .tag-res { color: #991b1b; background: #fef2f2; border: 1px solid #fecaca; }
    .tag-unr { color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; }
    .footer { margin-top: 48px; border-top: 1px solid #e2e8f0; padding-top: 16px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="cover">
    <div style="font-size: 12px; font-weight: 700; color: #4f46e5; margin-bottom: 8px;">PROMPTSHIELD // ENTERPRISE INFORMATION SECURITY</div>
    <h1>Information Security & Compliance Audit</h1>
    <div class="subtitle">Local DLP Governance & Shadow AI Risk Dossier</div>

    <div class="confidential-box">
      <strong>STRICTLY CONFIDENTIAL — PROPRIETARY SECURITY AUDIT</strong><br>
      This audit report contains sensitive governance metrics and employee AI telemetry. Distribution is restricted to authorized compliance personnel and designated security officers under corporate non-disclosure agreements.
    </div>

    <div class="meta-grid">
      <div class="meta-card">
        <div class="meta-label">Report ID</div>
        <div class="meta-val">${data.reportId}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Generated At (UTC)</div>
        <div class="meta-val">${new Date(data.generatedAt).toISOString().slice(0, 16)}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Prepared By</div>
        <div class="meta-val">${data.generatedBy}</div>
      </div>
      <div class="meta-card">
        <div class="meta-label">Audit Period</div>
        <div class="meta-val">${data.reportingPeriod}</div>
      </div>
    </div>
  </div>

  <div class="section-title">Document Control & Audit Scope</div>
  <p style="color: #334155; line-height: 1.6;">
    This audit report reflects all monitored client-side prompt scans, workstation process detections, and clipboard safeguarding events recorded within PromptShield. All inspection operations execute locally within an in-memory WebAssembly airgap sandbox. Under our strict Zero-Leak Privacy Guarantee, no raw prompt text, user clipboard buffers, API keys, or personal identity numbers are ever persisted in storage or printed in this document.
  </p>

  <div class="section-title">Section 1: Executive Risk Summary</div>
  <table>
    <thead>
      <tr>
        <th>Audit Dimension</th>
        <th style="text-align: center;">Value</th>
        <th>Operational Context</th>
        <th style="text-align: center;">Control Status</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Total Client-Side Local Scans</strong></td>
        <td style="text-align: center; font-family: monospace; font-weight: bold;">${totalScans}</td>
        <td>Client-side memory airgap scans (Clipboard & Manual)</td>
        <td style="text-align: center; font-weight: bold; color: #15803d;">Active Protection</td>
      </tr>
      <tr>
        <td><strong>Total PII & Secret Interceptions</strong></td>
        <td style="text-align: center; font-family: monospace; font-weight: bold;">${data.totalFindings}</td>
        <td>Sensitive pattern matches prevented or quarantined</td>
        <td style="text-align: center; font-weight: bold; color: ${data.totalFindings > 0 ? '#991b1b' : '#15803d'};">
          ${data.totalFindings > 0 ? 'Requires Review' : 'Clean Posture'}
        </td>
      </tr>
      <tr>
        <td><strong>Active DLP Guardrail Rules</strong></td>
        <td style="text-align: center; font-family: monospace; font-weight: bold;">${activeRulesCount}</td>
        <td>Safe non-backtracking AST regex policies (Zero ReDoS)</td>
        <td style="text-align: center; font-weight: bold; color: #15803d;">Enforced</td>
      </tr>
      <tr>
        <td><strong>Monitored AI Tool Endpoints</strong></td>
        <td style="text-align: center; font-family: monospace; font-weight: bold;">${allTools.length}</td>
        <td>${data.approvedCount} Approved • ${data.restrictedCount} Restricted • ${data.unreviewedCount} Unreviewed</td>
        <td style="text-align: center; font-weight: bold;">Cataloged</td>
      </tr>
    </tbody>
  </table>

  <div class="section-title">Section 2: Security Incident Chronology</div>
  <table>
    <thead>
      <tr>
        <th>Date/Time (UTC)</th>
        <th>Destination AI Tool</th>
        <th>Policy Violated</th>
        <th style="text-align: center;">Severity</th>
        <th style="text-align: center;">State</th>
      </tr>
    </thead>
    <tbody>
      ${allIncidents.length === 0
        ? '<tr><td colspan="5" style="text-align:center; color:#94a3b8; padding: 16px;">No incidents detected - Clean Audit Cycle</td></tr>'
        : allIncidents.map((inc) => `
          <tr>
            <td style="font-family: monospace;">${new Date(inc.opened_at).toISOString().replace('T', ' ').slice(0, 19)}</td>
            <td><strong>${inc.title.replace(/^(?:DLP Escalation:?|Incident:?)\s*/i, '')}</strong></td>
            <td>${inc.summary || 'Data Protection Policy'}</td>
            <td style="text-align: center;"><span class="tag tag-res">${inc.priority}</span></td>
            <td style="text-align: center;">${inc.status}</td>
          </tr>
        `).join('')}
    </tbody>
  </table>

  <div class="section-title">Section 3: AI Tool Inventory & Governance</div>
  <table>
    <thead>
      <tr>
        <th>Tool Name</th>
        <th>Platform</th>
        <th>Category</th>
        <th>Domain / Process Identifier</th>
        <th style="text-align: center;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${allTools.map((t) => `
        <tr>
          <td><strong>${t.tool_name}</strong></td>
          <td>${t.tool_type}</td>
          <td>${t.category}</td>
          <td style="font-family: monospace;">${t.identifier}</td>
          <td style="text-align: center;">
            <span class="tag ${t.approval_status === 'Approved' ? 'tag-app' : t.approval_status === 'Restricted' ? 'tag-res' : 'tag-unr'}">
              ${t.approval_status}
            </span>
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="footer">
    <span>Confidential - Internal Use Only | PromptShield DLP</span>
    <span>Zero Raw Secrets Preserved &bull; Cryptographically Hashed Record</span>
  </div>
</body>
</html>`;
}

/**
 * Generate self-contained HTML for Incident Summary Report
 */
export function generateIncidentReportHtml(data: IncidentReportData): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>PromptShield — Incident Dossier [${data.incident.incident_number}]</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; background: #fff; margin: 0; padding: 40px; font-size: 13px; line-height: 1.5; }
    .header { border-bottom: 2px solid #4f46e5; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; }
    h1 { margin: 0; font-size: 20px; color: #0b1120; }
    .subtitle { color: #64748b; font-size: 12px; margin-top: 4px; }
    .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
    .meta-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; }
    .meta-label { font-size: 10px; text-transform: uppercase; color: #64748b; font-weight: 600; }
    .meta-val { font-size: 13px; font-weight: 700; color: #0b1120; margin-top: 4px; font-family: monospace; }
    .section-title { font-size: 14px; font-weight: 700; color: #0b1120; margin: 24px 0 10px 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #0b1120; text-align: left; padding: 8px; font-size: 11px; color: #ffffff; border: 1px solid #1e293b; font-weight: 600; }
    td { padding: 8px; border: 1px solid #e2e8f0; }
    tr:nth-child(even) { background-color: #f8fafc; }
    .callout { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px; margin: 16px 0; color: #1e40af; font-size: 12px; }
    .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 20px; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }
    .sign-off { margin-top: 30px; display: grid; grid-template-columns: 1fr 1fr; gap: 40px; }
    .sign-line { border-bottom: 1px solid #94a3b8; height: 35px; margin-bottom: 4px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1>Security Incident Dossier: ${data.incident.incident_number}</h1>
      <div class="subtitle">PromptShield Chain-of-Custody & Evidence Timeline</div>
    </div>
    <div style="text-align: right; font-family: monospace; font-size: 11px; color: #64748b;">
      ID: ${data.reportId}<br>Generated: ${new Date(data.generatedAt).toUTCString()}
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-card">
      <div class="meta-label">Incident Number</div>
      <div class="meta-val">${data.incident.incident_number}</div>
    </div>
    <div class="meta-card">
      <div class="meta-label">Priority</div>
      <div class="meta-val">${data.incident.priority}</div>
    </div>
    <div class="meta-card">
      <div class="meta-label">Status</div>
      <div class="meta-val">${data.incident.status}</div>
    </div>
    <div class="meta-card">
      <div class="meta-label">Target User</div>
      <div class="meta-val">${data.username}</div>
    </div>
  </div>

  <div class="section-title">1. Executive Summary & Scope</div>
  <p style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; font-size: 13px; line-height: 1.6; color: #334155;">
    ${data.incident.summary || 'No summary text provided.'}
  </p>

  <div class="section-title">2. Chronological Evidence Timeline</div>
  <table>
    <thead>
      <tr>
        <th style="width: 140px;">Time (UTC)</th>
        <th style="width: 140px;">Event Category</th>
        <th>Description (Non-Sensitive Scanned Metadata)</th>
        <th style="width: 120px;">Recorded By</th>
      </tr>
    </thead>
    <tbody>
      ${data.timeline.length === 0
        ? '<tr><td colspan="4" style="text-align:center; color:#94a3b8;">No timeline entries recorded.</td></tr>'
        : data.timeline.map(t => `
          <tr>
            <td style="font-family: monospace;">${new Date(t.event_time).toISOString().replace('T', ' ').slice(0, 19)}</td>
            <td><strong>${t.event_type}</strong></td>
            <td>${t.description}</td>
            <td style="font-family: monospace;">${t.recorded_by}</td>
          </tr>
        `).join('')}
    </tbody>
  </table>

  <div class="callout">
    <strong>Evidence Distinction Notice:</strong> Local in-memory scans verify prompt contents before sending. This report explicitly verifies whether data was intercepted locally versus attempted transmission.
  </div>

  <div class="sign-off">
    <div>
      <div class="sign-line"></div>
      <div style="font-size: 11px; color: #64748b;">Assigned Lead Investigator Signature</div>
    </div>
    <div>
      <div class="sign-line"></div>
      <div style="font-size: 11px; color: #64748b;">Chief Information Security Officer Approval</div>
    </div>
  </div>

  <div class="footer">
    <span>PromptShield ShadowAI Leak Guard &bull; Incident Dossier</span>
    <span>Cryptographically Hashed Record</span>
  </div>
</body>
</html>`;
}

/**
 * Downloads a generated file and registers the cryptographic record in reports table
 */
export async function exportReportFile(params: {
  reportType: ReportType;
  fileName: string;
  format: 'html' | 'pdf';
  content: string | Uint8Array;
  generatedByUserId: string;
  incidentId?: string | null;
}): Promise<ReportRecord> {
  const hash = await computeSha256(params.content);

  // Trigger browser download
  const mimeType = params.format === 'html' ? 'text/html;charset=utf-8' : 'application/pdf';
  const blob = new Blob([params.content as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = params.fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  // Record in reports table
  const record = await reportRepo.record({
    incident_id: params.incidentId || null,
    report_type: params.reportType,
    file_name: params.fileName,
    generated_by: params.generatedByUserId,
    sha256_hash: hash,
  });

  await auditRepo.log({
    user_id: params.generatedByUserId,
    action: 'REPORT_EXPORTED',
    target_type: 'report',
    target_id: record.report_id,
    outcome: 'Success',
    details: `Exported ${params.format.toUpperCase()} report: "${params.fileName}" (SHA-256: ${hash.slice(0, 16)}...)`,
  });

  return record;
}
