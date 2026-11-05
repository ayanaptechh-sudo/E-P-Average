var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// electron/preload.ts
var preload_exports = {};
module.exports = __toCommonJS(preload_exports);
var import_electron = require("electron");
var electronAPI = {
  // Device Persistence Handlers
  getDevices: () => {
    return import_electron.ipcRenderer.invoke("get-devices");
  },
  addDevice: (device) => {
    return import_electron.ipcRenderer.invoke("add-device", device);
  },
  updateDevice: (id, updates) => {
    return import_electron.ipcRenderer.invoke("update-device", id, updates);
  },
  deleteDevice: (id) => {
    return import_electron.ipcRenderer.invoke("delete-device", id);
  },
  // EDR Command Queue Handlers
  queueCommand: (agentId, command, payload) => {
    return import_electron.ipcRenderer.invoke("queue-agent-command", agentId, command, payload);
  },
  getPendingCommands: (agentId) => {
    return import_electron.ipcRenderer.invoke("get-pending-commands", agentId);
  },
  // Daemon Status
  getDaemonStatus: () => {
    return import_electron.ipcRenderer.invoke("get-daemon-status");
  },
  toggleDaemon: (enabled) => {
    return import_electron.ipcRenderer.invoke("toggle-daemon", enabled);
  },
  // Event Listeners
  onTelemetryReceived: (callback) => {
    const handler = (_event, data) => callback(data);
    import_electron.ipcRenderer.on("telemetry-received", handler);
    return () => {
      import_electron.ipcRenderer.removeListener("telemetry-received", handler);
    };
  },
  onClipboardLeakBlocked: (callback) => {
    const handler = (_event, data) => callback(data);
    import_electron.ipcRenderer.on("clipboard-leak-blocked", handler);
    return () => {
      import_electron.ipcRenderer.removeListener("clipboard-leak-blocked", handler);
    };
  }
};
import_electron.contextBridge.exposeInMainWorld("electronAPI", electronAPI);
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PromptShield Enterprise EDR - Electron Preload Bridge
 * Exposes IPC handlers securely via contextBridge.
 */
