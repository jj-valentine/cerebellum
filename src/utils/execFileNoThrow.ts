import { execFile } from 'child_process';
import { promisify } from 'util';

const execFilePromise = promisify(execFile);

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  ok: boolean;
}

/**
 * Run an executable with an argument list. Never throws — returns ok:false on failure.
 * Use this instead of exec/execSync to avoid shell injection.
 */
export async function execFileNoThrow(
  cmd: string,
  args: string[] = [],
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await execFilePromise(cmd, args);
    return { stdout, stderr, exitCode: 0, ok: true };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      exitCode: e.code ?? 1,
      ok: false,
    };
  }
}
