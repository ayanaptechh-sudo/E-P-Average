/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Eye, EyeOff, AlertCircle, Sparkles, Lock, ArrowRight, Check } from 'lucide-react';
import { useAuth } from '../../services/authContext';
import { ThemeToggle } from '../components/ThemeToggle';

export const LoginPage: React.FC = () => {
  const { login, setupAdmin, isFirstRun } = useAuth();
  const [email, setEmail] = useState('admin@promptshield.com');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showForgotNotice, setShowForgotNotice] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setShowForgotNotice(false);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    if (!password) {
      setError('Please enter your password.');
      return;
    }

    try {
      setLoading(true);
      if (isFirstRun) {
        const username = email.includes('@') ? email.split('@')[0] : email.trim();
        await setupAdmin(username, password, 'Information Security');
      } else {
        try {
          await login(email.trim(), password);
        } catch (firstErr) {
          if (email.includes('@')) {
            const username = email.split('@')[0];
            await login(username, password);
          } else {
            throw firstErr;
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid credentials. Please verify your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col md:flex-row bg-white dark:bg-slate-900 font-sans antialiased selection:bg-purple-500 selection:text-white">
      {/* =========================================================================
          LEFT SIDE: SOLID DEEP PURPLE CONTAINER WITH 3D ANIMATED ISOMETRIC ELEMENT
         ========================================================================= */}
      <div className="relative md:w-1/2 bg-[#5B4DFB] flex flex-col justify-between p-8 sm:p-12 lg:p-16 overflow-hidden text-white min-h-[420px] md:min-h-screen">
        {/* Subtle Background Glows */}
        <div className="pointer-events-none absolute -top-24 -left-24 w-96 h-96 rounded-full bg-purple-400/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 w-[30rem] h-[30rem] rounded-full bg-indigo-300/15 blur-3xl" />

        {/* Brand Header */}
        <div className="relative z-10 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-lg">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="font-extrabold text-xl tracking-tight text-white flex items-center gap-1.5">
            PromptShield
            <span className="text-[10px] uppercase font-bold tracking-widest bg-white/20 text-white px-2 py-0.5 rounded-full">
              DLP
            </span>
          </span>
        </div>

        {/* Center: 3D Isometric Animated Cube Illustration */}
        <div className="relative z-10 my-auto flex flex-col items-center justify-center py-8">
          <div className="relative w-72 h-72 sm:w-84 sm:h-84 flex items-center justify-center">
            {/* Ambient Base Shadow */}
            <motion.div
              animate={{
                scale: [1, 1.05, 1],
                opacity: [0.35, 0.25, 0.35],
              }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="absolute bottom-6 w-52 h-16 rounded-full bg-[#3B2DC4]/60 blur-xl pointer-events-none"
            />

            {/* Floating Isometric 3D Cube Container */}
            <motion.div
              animate={{
                y: [-8, 8, -8],
              }}
              transition={{
                duration: 5,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
              className="relative w-64 h-64 select-none cursor-pointer"
            >
              <svg viewBox="0 0 320 320" className="w-full h-full drop-shadow-2xl">
                <defs>
                  {/* Top Face Gradient */}
                  <linearGradient id="cubeTop" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#7E72FC" />
                    <stop offset="100%" stopColor="#6C5EF8" />
                  </linearGradient>

                  {/* Left Face Gradient */}
                  <linearGradient id="cubeLeft" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#5142E6" />
                    <stop offset="100%" stopColor="#3C2DBE" />
                  </linearGradient>

                  {/* Right Face Gradient */}
                  <linearGradient id="cubeRight" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#4334DA" />
                    <stop offset="100%" stopColor="#2E20A8" />
                  </linearGradient>

                  {/* Yellow Small Cube Gradients */}
                  <linearGradient id="yellowTop" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#FDE047" />
                    <stop offset="100%" stopColor="#EAB308" />
                  </linearGradient>
                  <linearGradient id="yellowLeft" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#CA8A04" />
                    <stop offset="100%" stopColor="#A16207" />
                  </linearGradient>
                  <linearGradient id="yellowRight" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#EAB308" />
                    <stop offset="100%" stopColor="#CA8A04" />
                  </linearGradient>

                  {/* Button Cyan Gradient */}
                  <linearGradient id="buttonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38BDF8" />
                    <stop offset="100%" stopColor="#0284C7" />
                  </linearGradient>
                </defs>

                {/* Main Isometric Cube Body */}
                {/* Top Surface */}
                <path
                  d="M 160 50 L 260 105 L 160 160 L 60 105 Z"
                  fill="url(#cubeTop)"
                />
                {/* Left Front Surface */}
                <path
                  d="M 60 105 L 160 160 L 160 270 L 60 215 Z"
                  fill="url(#cubeLeft)"
                />
                {/* Right Front Surface */}
                <path
                  d="M 160 160 L 260 105 L 260 215 L 160 270 Z"
                  fill="url(#cubeRight)"
                />

                {/* Coin Slot on Top Face */}
                <path
                  d="M 130 90 L 175 115 L 168 119 L 123 94 Z"
                  fill="#251887"
                  opacity="0.85"
                />

                {/* Glowing Round Button on Left Face */}
                <ellipse
                  cx="110"
                  cy="175"
                  rx="16"
                  ry="24"
                  transform="rotate(-25 110 175)"
                  fill="url(#buttonGrad)"
                  stroke="#7DD3FC"
                  strokeWidth="3"
                  className="filter drop-shadow-[0_0_8px_rgba(56,189,248,0.8)]"
                />
                <circle cx="107" cy="172" r="5" fill="#FFFFFF" opacity="0.8" />

                {/* 3 Glowing Dots on Right Face */}
                <ellipse cx="205" cy="175" rx="4.5" ry="7" transform="rotate(25 205 175)" fill="#38BDF8" className="filter drop-shadow-[0_0_6px_#38BDF8]" />
                <ellipse cx="225" cy="165" rx="4.5" ry="7" transform="rotate(25 225 165)" fill="#38BDF8" className="filter drop-shadow-[0_0_6px_#38BDF8]" />
                <ellipse cx="240" cy="155" rx="4.5" ry="7" transform="rotate(25 240 155)" fill="#38BDF8" className="filter drop-shadow-[0_0_6px_#38BDF8]" />

                {/* Yellow Accent Cube on Top Right */}
                {/* Top */}
                <path d="M 215 80 L 235 91 L 215 102 L 195 91 Z" fill="url(#yellowTop)" />
                {/* Left */}
                <path d="M 195 91 L 215 102 L 215 122 L 195 111 Z" fill="url(#yellowLeft)" />
                {/* Right */}
                <path d="M 215 102 L 235 91 L 235 111 L 215 122 Z" fill="url(#yellowRight)" />

                {/* Floating Animated Golden Token/Key entering the slot */}
                <g className="animate-bounce" style={{ animationDuration: '2.5s' }}>
                  <ellipse cx="150" cy="55" rx="14" ry="7" fill="#FACC15" stroke="#FEF08A" strokeWidth="1.5" />
                  <ellipse cx="150" cy="53" rx="10" ry="5" fill="#EAB308" />
                </g>

                {/* Mechanical Articulated White Arm (from left side) */}
                <path
                  d="M 5 210 Q 30 200, 55 195"
                  stroke="#E2E8F0"
                  strokeWidth="10"
                  strokeLinecap="round"
                  fill="none"
                />
                <circle cx="55" cy="195" r="7" fill="#94A3B8" />
                <path
                  d="M 55 195 L 85 183"
                  stroke="#FFFFFF"
                  strokeWidth="8"
                  strokeLinecap="round"
                  fill="none"
                  className="drop-shadow-md"
                />
                <circle cx="85" cy="183" r="5" fill="#38BDF8" />
              </svg>
            </motion.div>
          </div>

          {/* Subtitle Under 3D Visual */}
          <div className="text-center max-w-sm mt-4">
            <h3 className="font-bold text-lg text-white tracking-tight">
              Local Privacy & Airgap Protection
            </h3>
            <p className="text-xs text-purple-100/80 mt-1 leading-relaxed">
              100% in-browser WebAssembly SQLite. Detect and prevent sensitive credentials from leaking into AI tools.
            </p>
          </div>
        </div>

        {/* Footer Notes */}
        <div className="relative z-10 flex items-center justify-between text-xs text-purple-200/70 border-t border-white/10 pt-4">
          <span>PromptShield Security</span>
          <span>v2.4 Enterprise</span>
        </div>
      </div>

      {/* =========================================================================
          RIGHT SIDE: CLEAN MINIMAL LOGIN FORM (Dark/Light responsive)
         ========================================================================= */}
      <div className="md:w-1/2 bg-white dark:bg-slate-900 flex flex-col justify-center items-center p-8 sm:p-12 lg:p-20 relative">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md mx-auto">
          {/* Form Header */}
          <div className="mb-8">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 dark:text-slate-100 tracking-tight">
              Log In
            </h1>
            <p className="text-sm text-gray-400 dark:text-slate-400 mt-2">
              Enter your email and password to login our dashboard.
            </p>
          </div>

          {/* Error Banner */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs flex items-start gap-3"
            >
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="leading-relaxed font-medium">{error}</div>
            </motion.div>
          )}

          {/* Forgot Password Notification */}
          {showForgotNotice && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-xl bg-purple-50 dark:bg-indigo-950/50 border border-purple-200 dark:border-indigo-900 text-purple-800 dark:text-indigo-300 text-xs leading-relaxed"
            >
              <div className="font-bold mb-0.5">Airgap Security Mode Active</div>
              Password recovery tokens must be provisioned directly by your Security Administrator.
            </motion.div>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email Field */}
            <div>
              <label
                htmlFor="email-input"
                className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider mb-2"
              >
                Email
              </label>
              <input
                id="email-input"
                type="text"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="info@promptshield.com"
                className="w-full px-4 py-3 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:border-[#5B4DFB] focus:ring-4 focus:ring-purple-100 dark:focus:ring-purple-900/40 transition-all shadow-xs"
              />
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label
                  htmlFor="password-input"
                  className="block text-xs font-semibold text-gray-700 dark:text-slate-300 uppercase tracking-wider"
                >
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotNotice(true)}
                  className="text-xs font-medium text-[#5B4DFB] dark:text-indigo-400 hover:text-[#4A3EE0] transition-colors cursor-pointer"
                >
                  Forgot Password?
                </button>
              </div>

              <div className="relative">
                <input
                  id="password-input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your Password"
                  className="w-full px-4 py-3 pr-11 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-xl text-gray-900 dark:text-slate-100 placeholder:text-gray-400 dark:placeholder:text-slate-500 text-sm focus:outline-none focus:border-[#5B4DFB] focus:ring-4 focus:ring-purple-100 dark:focus:ring-purple-900/40 transition-all shadow-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-400 hover:text-gray-600 dark:hover:text-slate-200 transition-colors p-1 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label="Toggle password visibility"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
            </div>

            {/* Solid Purple Sign In Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-4 rounded-xl bg-[#5B4DFB] hover:bg-[#4E3EF0] active:scale-[0.99] text-white font-semibold text-sm shadow-lg shadow-purple-500/25 transition-all duration-150 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-6"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>

            {/* Bottom Links */}
            <div className="text-center pt-4">
              <p className="text-xs text-gray-400 dark:text-slate-500">
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => setShowForgotNotice(true)}
                  className="font-semibold text-[#5B4DFB] dark:text-indigo-400 hover:underline cursor-pointer"
                >
                  Sign Up
                </button>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export const SetupPage: React.FC = LoginPage;
export default LoginPage;
