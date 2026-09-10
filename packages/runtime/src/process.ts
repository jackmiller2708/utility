import { Context, Effect, Layer } from "effect";
import { spawn } from "node:child_process";
import { ProcessError } from "./errors.js";

export interface Command {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
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
        try {
          const proc = spawn(command.executable, [...command.args], {
            cwd: command.cwd,
            env: command.env ? { ...process.env, ...command.env } : process.env,
            shell: false,
          });

          let stdout = "";
          let stderr = "";

          proc.stdout.on("data", (data) => {
            stdout += data.toString();
          });

          proc.stderr.on("data", (data) => {
            stderr += data.toString();
          });

          let timeoutId: NodeJS.Timeout | undefined;
          if (command.timeoutMs && command.timeoutMs > 0) {
            timeoutId = setTimeout(() => {
              proc.kill("SIGKILL");
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
      }),
  })
);
