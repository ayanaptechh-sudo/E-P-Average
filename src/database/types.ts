/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type UserRole = 'Administrator' | 'Analyst' | 'Manager' | 'Auditor' | 'End User';
export type UserStatus = 'Active' | 'Inactive';

export interface AppUser {
  user_id: string;
  username: string;
  password_hash: string;
  salt: string;
  role: UserRole;
  department: string;
  status: UserStatus;
  created_at: string; // UTC ISO
}

export type ToolType = 'Website' | 'Desktop App' | 'Extension';
export type ToolApprovalStatus = 'Approved' | 'Restricted' | 'Unreviewed' | 'Review Required';

export interface AiTool {
  tool_id: string;
  tool_name: string;
  tool_type: ToolType;
  identifier: string; // domain or process name or extension ID
  category: string; // e.g. "Generative Text", "Code Assistant", "Image Generation"
  approval_status: ToolApprovalStatus;
  risk_policy: string; // "Allow with warning", "Blocked", "Standard", etc.
  created_at: string;
  updated_at: string;
}

export type UsageEventType = 'Visit' | 'App Detected' | 'Extension Detected';
export type DetectionSource = 
  | 'Browser History Import'
  | 'Process Inventory Import'
  | 'Extension Inventory Import'
  | 'Manual Entry';
export type CollectionStatus = 'Success' | 'Partial' | 'Error';

export interface UsageEvent {
  usage_event_id: string;
  user_id: string;
  tool_id: string;
  device_identifier: string;
  event_type: UsageEventType;
  event_time: string; // UTC ISO
  detection_source: DetectionSource;
  confidence: number; // 0.0 - 1.0
  collection_status: CollectionStatus;
  approval_status_at_detection: ToolApprovalStatus;
}

export type ScanSource = 'Manual Text' | 'Clipboard' | 'Browser Integration';
export type ScanStatus = 'Completed' | 'Partial' | 'Failed';
export type SeverityLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface ScanSession {
  scan_id: string;
  user_id: string;
  tool_id: string | null; // intended destination, nullable
  scan_time: string;
  scan_source: ScanSource;
  detected_count: number;
  categories_json: string; // JSON string of category names
  highest_risk: SeverityLevel | 'None';
  scan_status: ScanStatus;
}

export type FindingStatus = 'New' | 'Reviewing' | 'Resolved' | 'Dismissed';
export type FindingActionTaken = 'Warned' | 'Redacted' | 'Dismissed';

export interface Finding {
  finding_id: string;
  scan_id: string;
  usage_event_id: string | null;
  user_id: string;
  tool_id: string | null;
  category: string;
  match_count: number;
  rule_id: string;
  severity: SeverityLevel;
  explanation: string;
  false_positive_note?: string;
  created_at: string;
  status: FindingStatus;
  action_taken: FindingActionTaken;
  policy_version: number;
}

export type RedactionActionStatus = 'Previewed' | 'Copied' | 'Cancelled' | 'Failed';

export interface RedactionEvent {
  redaction_event_id: string;
  scan_id: string;
  redaction_count: number;
  categories_json: string;
  action_time: string;
  action_status: RedactionActionStatus;
}

export type RiskLevel = 'Low' | 'Medium' | 'High' | 'Critical';

export interface RiskScore {
  risk_score_id: string;
  user_id: string | null;
  department: string | null;
  score: number; // 0 - 100
  risk_level: RiskLevel;
  scoring_window: string; // e.g. "Last 30 Days"
  explanation: string;
  calculated_at: string;
}

export type AlertStatus = 'Open' | 'Acknowledged' | 'Investigating' | 'Resolved' | 'Closed';

export interface Alert {
  alert_id: string;
  finding_id: string | null;
  user_id: string;
  severity: SeverityLevel;
  title: string;
  description: string; // Non-sensitive metadata only!
  assigned_to: string | null;
  status: AlertStatus;
  created_at: string;
  resolved_at: string | null;
}

export type IncidentPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type IncidentStatus = 'Open' | 'In Progress' | 'On Hold' | 'Closed';

export interface Incident {
  incident_id: string;
  incident_number: string; // e.g. INC-2026-0001
  title: string;
  user_id: string;
  priority: IncidentPriority;
  status: IncidentStatus;
  assigned_to: string | null;
  summary: string;
  opened_at: string;
  closed_at: string | null;
}

export type TimelineEventType = 
  | 'Scan'
  | 'Finding'
  | 'Warning'
  | 'Redaction'
  | 'Review'
  | 'Resolution'
  | 'Attempted Submission'
  | 'Confirmed Submission';

export interface IncidentTimeline {
  timeline_id: string;
  incident_id: string;
  event_type: TimelineEventType;
  source_record_id: string | null;
  event_time: string;
  description: string;
  recorded_by: string;
}

export type PolicyType = 
  | 'Tool Approval'
  | 'Data Category'
  | 'Risk Rule'
  | 'Retention'
  | 'Alert Threshold';

export interface Policy {
  policy_id: string;
  policy_name: string;
  policy_type: PolicyType;
  policy_json: string;
  version: number;
  enabled: number; // 1 or 0
  updated_by: string;
  updated_at: string;
}

export type ReportType = 'AI Usage Compliance' | 'Incident Summary' | 'Department Risk Audit';

export interface ReportRecord {
  report_id: string;
  incident_id: string | null;
  report_type: ReportType;
  file_name: string;
  generated_by: string;
  generated_at: string;
  sha256_hash: string;
}

export interface AuditLog {
  audit_log_id: string;
  user_id: string;
  action: string;
  target_type: string;
  target_id: string | null;
  outcome: 'Success' | 'Failure' | 'Blocked';
  timestamp: string;
  details: string; // Non-sensitive metadata only!
}

export interface AppSetting {
  key: string;
  value: string;
  updated_at: string;
}
