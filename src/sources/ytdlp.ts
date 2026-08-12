import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CommandRunner } from "./tiktok.ts";

const run = promisify(execFile);

/** Enough for a poll of one creator's recent posts, generous enough to survive a slow answer. */
const TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024;

export class ToolMissingError extends Error {
  constructor(tool: string) {
    super(`${tool} is not on the path. The TikTok source cannot run without it.`);
    this.name = "ToolMissingError";
  }
}

export class ToolFailedError extends Error {
  readonly stderr: string;

  constructor(tool: string, stderr: string) {
    super(`${tool} failed: ${stderr.trim().split("\n").at(-1) ?? "no output"}`);
    this.name = "ToolFailedError";
    this.stderr = stderr;
  }
}

/**
 * The real runner. Every external call is given a timeout, because a poll that hangs holds up
 * the whole schedule and there is no upper bound on how long a blocked request will wait.
 */
export function ytDlpRunner(binary = "yt-dlp"): CommandRunner {
  return async (args: string[]) => {
    try {
      const { stdout } = await run(binary, args, {
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
      });
      return stdout;
    } catch (cause) {
      const error = cause as NodeJS.ErrnoException & { stderr?: string };
      if (error.code === "ENOENT") throw new ToolMissingError(binary);
      throw new ToolFailedError(binary, error.stderr ?? error.message);
    }
  };
}
