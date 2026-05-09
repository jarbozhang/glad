/**
 * Low-level ripgrep wrapper - just arguments in, string out
 */

import { spawn } from 'child_process';
import { projectPath } from '@/projectPath';
import { join, resolve } from 'path';

export interface RipgrepResult {
    exitCode: number
    stdout: string
    stderr: string
    truncated?: boolean
}

export interface RipgrepOptions {
    cwd?: string
    maxStdoutBytes?: number
}

/**
 * Run ripgrep with the given arguments
 * @param args - Array of command line arguments to pass to ripgrep
 * @param options - Options for ripgrep execution
 * @returns Promise with exit code, stdout and stderr
 */
export function run(args: string[], options?: RipgrepOptions): Promise<RipgrepResult> {
    const RUNNER_PATH = resolve(join(projectPath(), 'scripts', 'ripgrep_launcher.cjs'));
    return new Promise((resolve, reject) => {
        const child = spawn('node', [RUNNER_PATH, JSON.stringify(args)], {
            stdio: ['pipe', 'pipe', 'pipe'],
            cwd: options?.cwd,
            windowsHide: true,
        });

        let stdout = '';
        let stderr = '';
        let stdoutBytes = 0;
        let truncated = false;
        let killedForOutputLimit = false;
        const maxStdoutBytes = options?.maxStdoutBytes;

        child.stdout.on('data', (data) => {
            if (maxStdoutBytes === undefined) {
                stdout += data.toString();
                return;
            }

            if (stdoutBytes >= maxStdoutBytes) {
                truncated = true;
                if (!killedForOutputLimit) {
                    killedForOutputLimit = true;
                    child.kill();
                }
                return;
            }

            const remainingBytes = maxStdoutBytes - stdoutBytes;
            if (data.length <= remainingBytes) {
                stdout += data.toString();
                stdoutBytes += data.length;
                return;
            }

            stdout += data.subarray(0, remainingBytes).toString();
            stdoutBytes = maxStdoutBytes;
            truncated = true;
            killedForOutputLimit = true;
            child.kill();
        });

        child.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        child.on('close', (code) => {
            let output = stdout;
            if (truncated) {
                const lastNewline = output.lastIndexOf('\n');
                if (lastNewline >= 0) {
                    output = output.slice(0, lastNewline + 1);
                }
            }

            resolve({
                exitCode: killedForOutputLimit ? 0 : code || 0,
                stdout: output,
                stderr,
                truncated
            });
        });

        child.on('error', (err) => {
            reject(err);
        });
    });
}
