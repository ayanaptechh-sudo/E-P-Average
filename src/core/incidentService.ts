/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { incidentRepo } from '../database/repositories/alertRepo';
import { auditRepo } from '../database/repositories/userRepo';
import {
  Incident,
  IncidentPriority,
  IncidentStatus,
  IncidentTimeline,
  TimelineEventType,
} from '../database/types';

export const incidentService = {
  async createIncident(params: {
    title: string;
    user_id: string;
    priority: IncidentPriority;
    assigned_to: string | null;
    summary: string;
    opened_by: string;
    initialFindingId?: string | null;
  }): Promise<Incident> {
    const incident = await incidentRepo.create({
      title: params.title,
      user_id: params.user_id,
      priority: params.priority,
      status: 'Open',
      assigned_to: params.assigned_to,
      summary: params.summary,
      opened_by: params.opened_by,
    });

    if (params.initialFindingId) {
      await incidentRepo.addTimelineEvent({
        incident_id: incident.incident_id,
        event_type: 'Finding',
        source_record_id: params.initialFindingId,
        description: `Linked DLP finding [${params.initialFindingId}] as origin trigger.`,
        recorded_by: params.opened_by,
      });
    }

    await auditRepo.log({
      user_id: params.opened_by,
      action: 'INCIDENT_CREATED',
      target_type: 'incident',
      target_id: incident.incident_id,
      outcome: 'Success',
      details: `Created incident ${incident.incident_number}: "${params.title}" (Priority: ${params.priority})`,
    });

    return incident;
  },

  async addTimelineEvent(params: {
    incident_id: string;
    event_type: TimelineEventType;
    description: string;
    source_record_id?: string | null;
    recorded_by: string;
  }): Promise<IncidentTimeline> {
    const event = await incidentRepo.addTimelineEvent({
      incident_id: params.incident_id,
      event_type: params.event_type,
      source_record_id: params.source_record_id || null,
      description: params.description,
      recorded_by: params.recorded_by,
    });

    await auditRepo.log({
      user_id: params.recorded_by,
      action: 'INCIDENT_TIMELINE_ADD',
      target_type: 'incident',
      target_id: params.incident_id,
      outcome: 'Success',
      details: `Added timeline event [${params.event_type}]: ${params.description.slice(0, 80)}`,
    });

    return event;
  },

  async updateIncident(
    incidentId: string,
    updates: {
      status?: IncidentStatus;
      priority?: IncidentPriority;
      assigned_to?: string | null;
      summary?: string;
    },
    updatedBy: string
  ): Promise<void> {
    await incidentRepo.update(incidentId, updates, updatedBy);

    await auditRepo.log({
      user_id: updatedBy,
      action: 'INCIDENT_UPDATED',
      target_type: 'incident',
      target_id: incidentId,
      outcome: 'Success',
      details: `Updated incident properties: status=${updates.status || 'unchanged'}, priority=${updates.priority || 'unchanged'}`,
    });
  },
};
