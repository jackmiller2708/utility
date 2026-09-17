import { Context, Duration, Effect, Fiber, Layer, Ref, Stream } from "effect";
import { Command as PlatformCommand, CommandExecutor } from "@effect/platform";
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

/** Drains a process' output stream into `ref` chunk by chunk, forwarding each chunk to `onChunk` as it arrives. A stream read failure is swallowed (mirroring a Node stream that simply stops emitting `data`) rather than failing the whole process invocation. */
const drainToRef = (stream: Stream.Stream<Uint8Array, unknown>, ref: Ref.Ref<string>, onChunk?: (chunk: string) => void): Effect.Effect<void> => stream.pipe(
  Stream.decodeText(),
  Stream.tap((chunk) => Ref.update(ref, (acc) => acc + chunk).pipe(Effect.zipRight(Effect.sync(() => onChunk?.(chunk))))),
  Stream.runDrain,
  Effect.ignore
);

const buildPlatformCommand = (command: Command): PlatformCommand.Command => {
  let platformCommand = PlatformCommand.make(command.executable, ...command.args);

  if (command.cwd) {
    platformCommand = PlatformCommand.workingDirectory(platformCommand, command.cwd);
  }

  if (command.env) {
    platformCommand = PlatformCommand.env(platformCommand, command.env);
  }

  return platformCommand;
};

export const ProcessLive = Layer.effect(
  Process,
  Effect.gen(function* () {
    const executor = yield* CommandExecutor.CommandExecutor;

    const spawn = (command: Command): Effect.Effect<ProcessResult, ProcessError> => Effect.gen(function* () {
      // Accumulates the full stdout for the process's entire lifetime with no bound — a
      // pre-existing limitation shared by every `Process` caller (ffmpeg included). Out of
      // scope for the video-download plan, not fixed here.
      const stdoutRef = yield* Ref.make("");
      const stderrRef = yield* Ref.make("");
      const platformCommand = buildPlatformCommand(command);

      const run = Effect.scoped(Effect.gen(function* () {
        const proc = yield* executor.start(platformCommand);

        const stdoutFiber = yield* Effect.fork(drainToRef(proc.stdout, stdoutRef, command.onStdout));
        const stderrFiber = yield* Effect.fork(drainToRef(proc.stderr, stderrRef, command.onStderr));

        const exitCode = yield* proc.exitCode;

        // Joined before returning so the scope's exit doesn't interrupt these fibers
        // mid-drain — otherwise the tail of a fast-closing process' output could be lost.
        yield* Fiber.join(stdoutFiber);
        yield* Fiber.join(stderrFiber);

        return Number(exitCode);
      }));

      const timed = command.timeoutMs && command.timeoutMs > 0
        ? run.pipe(Effect.timeout(Duration.millis(command.timeoutMs)))
        : run;

      const exitCode = yield* timed.pipe(
        Effect.catchTag("TimeoutException", () => Ref.get(stderrRef).pipe(Effect.flatMap((stderr) => Effect.fail(new ProcessError({
          executable: command.executable,
          message: `Process timed out after ${command.timeoutMs}ms`,
          stderr,
        }))))),
        Effect.mapError((err) => err instanceof ProcessError
          ? err
          : new ProcessError({ executable: command.executable, message: `Failed to execute ${command.executable}: ${err.message}`, cause: err })
        ),
      );

      const stdout = yield* Ref.get(stdoutRef);
      const stderr = yield* Ref.get(stderrRef);

      if (exitCode !== 0) {
        return yield* Effect.fail(new ProcessError({
          executable: command.executable,
          message: `Process ${command.executable} exited with code ${exitCode}`,
          exitCode,
          stderr,
        }));
      }

      return { exitCode, stdout, stderr };
    });

    return { spawn };
  })
);
