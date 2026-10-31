#!/usr/bin/env python3
"""
PromptShield Enterprise EDR/DLP Development Launcher
Executes the development server via 'npm run dev'.
"""

import os
import sys
import subprocess
import signal


def main():
    print("[PromptShield] Initializing development environment launcher...")
    project_root = os.path.dirname(os.path.abspath(__file__))
    os.chdir(project_root)

    print(f"[PromptShield] Working directory: {project_root}")
    print("[PromptShield] Running: npm run dev")

    is_windows = sys.platform.startswith("win")
    
    try:
        # Use shell=True for cross-platform execution (Windows npm.cmd, POSIX npm)
        process = subprocess.Popen(
            "npm run dev" if is_windows else ["npm", "run", "dev"],
            shell=is_windows,
        )

        def signal_handler(sig, frame):
            print("\n[PromptShield] Shutting down development launcher...")
            try:
                process.terminate()
                process.wait(timeout=3)
            except Exception:
                process.kill()
            sys.exit(0)

        signal.signal(signal.SIGINT, signal_handler)
        if hasattr(signal, "SIGTERM"):
            signal.signal(signal.SIGTERM, signal_handler)

        return_code = process.wait()
        sys.exit(return_code)

    except KeyboardInterrupt:
        print("\n[PromptShield] Development launcher interrupted by user.")
        try:
            process.terminate()
            process.wait(timeout=2)
        except Exception:
            process.kill()
        sys.exit(0)
    except Exception as exc:
        print(f"[PromptShield] Fatal error starting development server: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
