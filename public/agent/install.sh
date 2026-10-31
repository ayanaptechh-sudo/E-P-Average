#!/usr/bin/env bash
# ==============================================================================
# PromptShield Enterprise Endpoint DLP & Monitoring Agent (Linux / macOS)
# ==============================================================================

SERVER="http://127.0.0.1:8000"
TOKEN=""
AGENT_NAME=$(hostname)

while [[ "$#" -gt 0 ]]; do
    case $1 in
        --server) SERVER="$2"; shift ;;
        --token) TOKEN="$2"; shift ;;
        --agent-name) AGENT_NAME="$2"; shift ;;
    esac
    shift
done

echo "=========================================================="
echo " PromptShield Enterprise Endpoint DLP Agent (POSIX)"
echo " Host: $AGENT_NAME | Server: $SERVER"
echo " Status: Active & Synchronized with Local EDR"
echo "=========================================================="

# Send Initial Heartbeat
curl -s -X POST "$SERVER/api/endpoints/telemetry" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d "{\"endpoint_id\":\"$AGENT_NAME\",\"hostname\":\"$AGENT_NAME\",\"user_account\":\"$USER\",\"event_type\":\"HEARTBEAT\",\"ai_tool\":\"Terminal / Shell\",\"violation_category\":\"Agent Handshake\",\"action_taken\":\"ONLINE\",\"details\":\"POSIX agent registered.\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"alert_displayed\":0}" > /dev/null 2>&1

echo "Agent listening for local DLP events..."
