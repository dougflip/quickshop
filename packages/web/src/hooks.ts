import {
  describeCommandError,
  type CommandResult,
  type Engine,
  type EngineState,
} from "@quickshop/core";
import { useCallback, useState, useSyncExternalStore } from "react";

/** The one bridge between the engine and React. */
export function useEngine(engine: Engine): EngineState {
  return useSyncExternalStore(engine.subscribe, engine.getState);
}

/**
 * Runs a command and keeps the message of the last one that failed, for showing next to the
 * control. Returns whether the command succeeded.
 */
export function useCommandFeedback(): {
  error: string | null;
  run: (result: CommandResult<unknown>) => boolean;
  clear: () => void;
} {
  const [error, setError] = useState<string | null>(null);
  const run = useCallback((result: CommandResult<unknown>) => {
    setError(result.ok ? null : describeCommandError(result.error));
    return result.ok;
  }, []);
  const clear = useCallback(() => {
    setError(null);
  }, []);
  return { error, run, clear };
}
