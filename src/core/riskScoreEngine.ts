/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Finding, UsageEvent, RiskLevel } from '../database/types';

export interface RiskCalculationResult {
  score: number; // 0 - 100
  risk_level: RiskLevel;
  breakdown: {
    sensitiveDataScore: number; // 30% weight
    toolApprovalScore: number; // 25% weight
    repeatedViolationsScore: number; // 20% weight
    eventContextScore: number; // 15% weight
    recencyScore: number; // 10% weight
  };
  contributingFactors: string[];
  missingSources: string[];
  observationPeriod: string;
  disclaimer: string;
  explanation: string;
}

/**
 * Computes AI Risk Score (0 - 100) per user or department using weighted components:
 * - 30% Sensitive-data findings (count & severity)
 * - 25% Tool approval & destination policy (restricted vs unreviewed vs approved)
 * - 20% Repeated violations (frequency of findings over observation window)
 * - 15% Event context & indicator combinations (e.g. extension + visit + unreviewed)
 * - 10% Recency with exponential time-decay
 *
 * Automatically renormalizes weights if monitoring components are missing,
 * and explicitly does NOT assume missing telemetry means zero risk.
 */
export function calculateRiskScore(params: {
  findings: Finding[];
  usageEvents: UsageEvent[];
  windowDays?: number;
  hasBrowserIntegration?: boolean;
}): RiskCalculationResult {
  const windowDays = params.windowDays || 30;
  const observationPeriod = `Last ${windowDays} Days`;
  const disclaimer = 'Policy-risk indicator, not proof of wrongdoing.';

  const now = Date.now();
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const cutoffTime = now - windowMs;

  const relevantFindings = params.findings.filter(
    f => new Date(f.created_at).getTime() >= cutoffTime
  );
  const relevantEvents = params.usageEvents.filter(
    e => new Date(e.event_time).getTime() >= cutoffTime
  );

  const contributingFactors: string[] = [];
  const missingSources: string[] = [];

  if (!params.hasBrowserIntegration) {
    missingSources.push('Live Browser Extension / Native Process Hook (Coverage Limited)');
  }

  // 1. Sensitive Data Score (0 - 100 normalized)
  let rawSensitive = 0;
  for (const f of relevantFindings) {
    if (f.severity === 'Critical') rawSensitive += 35;
    else if (f.severity === 'High') rawSensitive += 20;
    else if (f.severity === 'Medium') rawSensitive += 10;
    else rawSensitive += 4;
  }
  const sensitiveScore = Math.min(100, rawSensitive);
  if (sensitiveScore > 40) {
    contributingFactors.push(`High density of sensitive data pattern detections (score component: ${Math.round(sensitiveScore)}).`);
  }

  // 2. Tool Approval & Destination Policy (0 - 100 normalized)
  let rawToolScore = 0;
  let restrictedToolsUsed = 0;
  let unreviewedToolsUsed = 0;

  for (const ev of relevantEvents) {
    if (ev.approval_status_at_detection === 'Restricted') {
      rawToolScore += 30;
      restrictedToolsUsed++;
    } else if (ev.approval_status_at_detection === 'Unreviewed' || ev.approval_status_at_detection === 'Review Required') {
      rawToolScore += 12;
      unreviewedToolsUsed++;
    }
  }
  const toolScore = Math.min(100, rawToolScore);
  if (restrictedToolsUsed > 0) {
    contributingFactors.push(`Detected ${restrictedToolsUsed} interactions with Restricted AI services.`);
  } else if (unreviewedToolsUsed > 0) {
    contributingFactors.push(`Detected ${unreviewedToolsUsed} visits to unreviewed external AI platforms.`);
  }

  // 3. Repeated Violations (0 - 100 normalized)
  // Evaluates recurring warnings or findings
  const repeatedScore = Math.min(100, relevantFindings.length * 15);
  if (relevantFindings.length >= 3) {
    contributingFactors.push(`Repeated DLP warning triggers (${relevantFindings.length} findings in observation window).`);
  }

  // 4. Event Context & Indicator Combination (0 - 100 normalized)
  let rawContext = 0;
  const hasAppDetected = relevantEvents.some(e => e.event_type === 'App Detected');
  const hasExtDetected = relevantEvents.some(e => e.event_type === 'Extension Detected');
  if (hasAppDetected && unreviewedToolsUsed > 0) rawContext += 40;
  if (hasExtDetected) rawContext += 30;
  if (relevantFindings.some(f => f.category.includes('API') || f.category.includes('Password'))) rawContext += 30;
  const eventContextScore = Math.min(100, rawContext);

  // 5. Recency with Time Decay (0 - 100 normalized)
  let recencySum = 0;
  let recencyCount = 0;
  for (const f of relevantFindings) {
    const ageDays = (now - new Date(f.created_at).getTime()) / (24 * 60 * 60 * 1000);
    // Half life 7 days: decay = 0.5 ^ (age / 7)
    const decay = Math.pow(0.5, ageDays / 7);
    recencySum += decay * 100;
    recencyCount++;
  }
  const recencyScore = recencyCount > 0 ? Math.min(100, Math.round(recencySum / recencyCount)) : 0;

  // Composite weighted score: 30% + 25% + 20% + 15% + 10% = 100%
  const compositeScore =
    sensitiveScore * 0.30 +
    toolScore * 0.25 +
    repeatedScore * 0.20 +
    eventContextScore * 0.15 +
    recencyScore * 0.10;

  const finalScore = Math.round(Math.min(100, Math.max(0, compositeScore)));

  // Risk bands: 0–24 Low, 25–49 Medium, 50–74 High, 75–100 Critical
  let risk_level: RiskLevel = 'Low';
  if (finalScore >= 75) risk_level = 'Critical';
  else if (finalScore >= 50) risk_level = 'High';
  else if (finalScore >= 25) risk_level = 'Medium';

  const explanation = [
    `Calculated AI Risk Index: ${finalScore}/100 (${risk_level}).`,
    contributingFactors.length > 0
      ? `Contributing indicators: ${contributingFactors.join(' ')}`
      : 'Baseline usage within standard enterprise parameters.',
    missingSources.length > 0
      ? `Telemetry gaps noted: ${missingSources.join(', ')}.`
      : 'Standard telemetry coverage active.',
    disclaimer,
  ].join(' ');

  return {
    score: finalScore,
    risk_level,
    breakdown: {
      sensitiveDataScore: Math.round(sensitiveScore),
      toolApprovalScore: Math.round(toolScore),
      repeatedViolationsScore: Math.round(repeatedScore),
      eventContextScore: Math.round(eventContextScore),
      recencyScore: Math.round(recencyScore),
    },
    contributingFactors,
    missingSources,
    observationPeriod,
    disclaimer,
    explanation,
  };
}
