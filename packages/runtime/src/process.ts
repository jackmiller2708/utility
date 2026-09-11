import { Context, Effect, Layer } from "effect";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { ProcessError } from "./errors.js";

export interface Command {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  /**
   * Called synchronously with each raw stdout/stderr chunk as the process emits it, in addition
   * to (not instead of) the buffering that fills `ProcessResult`. Exists for tools like ffmpeg
   * that report progress by writing periodic lines to a live stream while the process runs — a
   * one-shot invocation with no equivalent to PDF's "call the binary N times, report progress
   * between calls" trick, since a single ffmpeg encode is one long-running process, not many
   * short ones. Optional and unused by every caller that doesn't need incremental progress.
   */
  readonly onStdout?: (chunk: string) => void;
  readonly onStderr?: (chunk: string) => void;
}

export interface ProcessResult {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface Process {
  readonly spawn: (command: Command) => Effect.Effect<ProcessResult, ProcessError>;
}

export const Process = Context.GenericTag<Process>("@utility/runtime/Process");

export const ProcessLive = Layer.succeed(
  Process,
  Process.of({
    spawn: (command: Command) =>
      Effect.async<ProcessResult, ProcessError>((resume) => {
        let proc: ChildProcessWithoutNullStreams | undefined;

        try {
          proc = spawn(command.executable, [...command.args], {
            cwd: command.cwd,
            env: command.env ? { ...process.env, ...command.env } : process.env,
            shell: false,
          });

          let stdout = "";
          let stderr = "";

          proc.stdout.on("data", (data) => {
            const text = data.toString();
            stdout += text;
            command.onStdout?.(text);
          });

          proc.stderr.on("data", (data) => {
            const text = data.toString();
            stderr += text;
            command.onStderr?.(text);
          });

          let timeoutId: NodeJS.Timeout | undefined;
          if (command.timeoutMs && command.timeoutMs > 0) {
            timeoutId = setTimeout(() => {
              proc?.kill("SIGKILL");
              resume(
                Effect.fail(
                  new ProcessError({
                    executable: command.executable,
                    message: `Process timed out after ${command.timeoutMs}ms`,
                    stderr,
                  })
                )
              );
            }, command.timeoutMs);
          }

          proc.on("error", (err) => {
            if (timeoutId) clearTimeout(timeoutId);
            resume(
              Effect.fail(
                new ProcessError({
                  executable: command.executable,
                  message: `Failed to execute ${command.executable}: ${err.message}`,
                  cause: err,
                })
              )
            );
          });

          proc.on("close", (code) => {
            if (timeoutId) clearTimeout(timeoutId);
            if (code === 0) {
              resume(
                Effect.succeed({
                  exitCode: 0,
                  stdout,
                  stderr,
                })
              );
            } else {
              resume(
                Effect.fail(
                  new ProcessError({
                    executable: command.executable,
                    message: `Process ${command.executable} exited with code ${code}`,
                    exitCode: code ?? undefined,
                    stderr,
                  })
                )
              );
            }
          });
        } catch (err) {
          resume(
            Effect.fail(
              new ProcessError({
                executable: command.executable,
                message: `Failed to spawn process ${command.executable}`,
                cause: err,
              })
            )
          );
        }

        // Runs only if the fiber awaiting this effect is interrupted (e.g. a cancelled
        // job) while the process is still running. Without this, cancellation stops
        // Effect from waiting on the result but leaves the real OS process running to
        // completion in the background — the entire point of cancellation lost silently.
        return Effect.sync(() => {
          proc?.kill("SIGKILL");
        });
      }),
  })
);
