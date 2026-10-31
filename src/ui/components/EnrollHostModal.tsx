/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * PromptShield Enterprise Endpoint Enrollment Modal
 * Clean, focused implementation with Step 1 (Config) -> Step 2 (Command Snippet) -> Done (Pending State)
 */

import React, { useState } from 'react';
import {
  Laptop,
  X,
  Copy,
  Check,
  Download,
  Terminal,
  Shield,
} from 'lucide-react';

export type TargetOs = 'Windows' | 'macOS' | 'Linux';

export interface NewDevicePayload {
  name: string;
  os: TargetOs;
  serverAddress: string;
}

interface EnrollHostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEnrollComplete: (device: NewDevicePayload) => void;
}

export function EnrollHostModal({ isOpen, onClose, onEnrollComplete }: EnrollHostModalProps) {
  const [step, setStep] = useState<'form' | 'snippet'>('form');
  const [serverAddress, setServerAddress] = useState('http://127.0.0.1:8000');
  const [agentName, setAgentName] = useState('');
  const [targetOs, setTargetOs] = useState<TargetOs>('Windows');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentName.trim()) return;
    setStep('snippet');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatedCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDone = () => {
    onEnrollComplete({
      name: agentName.trim(),
      os: targetOs,
      serverAddress: serverAddress.trim() || 'http://127.0.0.1:8000',
    });
    // Reset modal state
    setStep('form');
    setAgentName('');
    setCopied(false);
    onClose();
  };

  const handleClose = () => {
    setStep('form');
    setCopied(false);
    onClose();
  };

  // Generate clean deployment command based on user inputs
  const cleanServer = serverAddress.trim().replace(/\/+$/, '') || 'http://127.0.0.1:8000';
  const cleanName = agentName.trim() || 'ENDPOINT-HOST';
  const token = 'wADkPpAcWPpsh1LeX9ufWzXYb7Wpu3xBcWnA1tMxsbY';

  let generatedCommand = '';
  if (targetOs === 'Windows') {
    generatedCommand = `$h=@{Authorization='Bearer ${token}'}; $guid=[guid]::NewGuid().ToString(); $p=Join-Path $env:TEMP ('promptshield-install-'+$guid+'.ps1'); Invoke-WebRequest -Uri "${cleanServer}/agent/install.ps1" -Headers $h -OutFile $p; powershell -ExecutionPolicy Bypass -File $p -Server "${cleanServer}" -Token "${token}" -AgentName "${cleanName}";`;
  } else {
    generatedCommand = `curl -s -H "Authorization: Bearer ${token}" "${cleanServer}/agent/install.sh" | bash -s -- --server "${cleanServer}" --token "${token}" --agent-name "${cleanName}"`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs select-none">
      <div className="relative w-full max-w-xl bg-white dark:bg-[#18212F] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all text-slate-900 dark:text-slate-100">
        
        {/* ===================================================================
            STEP 1: INSTALL AN ENDPOINT AGENT MODAL
           =================================================================== */}
        {step === 'form' && (
          <div className="p-6 md:p-8">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-[#991B1B] dark:bg-[#7F1D1D] flex items-center justify-center shrink-0 shadow-md">
                  <Laptop className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                    Install an endpoint agent
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Configure endpoint identity and target deployment server
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleGenerate} className="space-y-4 mt-6">
              {/* Field 1: Server address */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Server address
                </label>
                <input
                  type="text"
                  required
                  value={serverAddress}
                  onChange={(e) => setServerAddress(e.target.value)}
                  placeholder="http://127.0.0.1:8000"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[#111722] border border-slate-200 dark:border-slate-700 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                />
              </div>

              {/* Field 2: Agent name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Agent name
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="e.g. MARKETING-MAC-02 or WORKSTATION-PC"
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-[#111722] border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 font-medium"
                />
              </div>

              {/* Field 3: Target OS */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Target OS
                </label>
                <select
                  value={targetOs}
                  onChange={(e) => setTargetOs(e.target.value as TargetOs)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-[#111722] border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50 cursor-pointer font-medium"
                >
                  <option value="Windows">Windows</option>
                  <option value="macOS">macOS</option>
                  <option value="Linux">Linux</option>
                </select>
              </div>

              {/* Action Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!agentName.trim()}
                  className="bg-[#EA580C] hover:bg-[#D94F04] disabled:opacity-50 text-white font-bold px-6 py-2.5 rounded-2xl text-sm shadow-md hover:shadow-lg transition-all flex items-center gap-2 cursor-pointer active:scale-98"
                >
                  <Download className="w-4 h-4" />
                  <span>Generate deployment command</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ===================================================================
            STEP 2: COMMAND SNIPPET MODAL
           =================================================================== */}
        {step === 'snippet' && (
          <div className="p-6 md:p-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  One-time endpoint installation commands
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Run this command on the target computer to initiate local DLP protection
                </p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Target Details Badge */}
            <div className="bg-slate-100 dark:bg-[#111722] p-3 rounded-xl border border-slate-200 dark:border-slate-800 mb-4 text-xs font-mono text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-800 dark:text-slate-100">Agent:</span> {agentName} • <span className="font-bold text-slate-800 dark:text-slate-100">Target OS:</span> {targetOs} • <span className="font-bold text-slate-800 dark:text-slate-100">Server:</span> {cleanServer}
            </div>

            {/* Section Header with Copy button */}
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                <Terminal className="w-4 h-4 text-orange-500" />
                <span>{targetOs === 'Windows' ? 'Windows PowerShell — copy and run' : 'Terminal — copy and run'}</span>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="text-xs font-bold text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-500">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy snippet</span>
                  </>
                )}
              </button>
            </div>

            {/* Dark block containing the generated command */}
            <div className="rounded-2xl bg-slate-900 text-slate-100 p-4 border border-slate-800 shadow-inner font-mono text-xs overflow-x-auto leading-relaxed">
              <pre className="whitespace-pre-wrap break-all text-slate-200 select-all">
                {generatedCommand}
              </pre>
            </div>

            {/* Bottom: Primary "Done" Button only (Simulate Host Check-In removed!) */}
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end">
              <button
                type="button"
                onClick={handleDone}
                className="bg-[#EA580C] hover:bg-[#D94F04] text-white font-bold px-8 py-2.5 rounded-2xl text-sm shadow-md hover:shadow-lg transition-all cursor-pointer active:scale-98"
              >
                Done
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
