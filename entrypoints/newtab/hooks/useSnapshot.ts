import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import type {
  Command,
  CommandBus,
  CommandResult,
  Snapshot,
} from '@/src/messaging/protocol';

const CommandBusContext = createContext<CommandBus | null>(null);

/**
 * Provides a {@link CommandBus} to the component tree. Swapping the injected
 * bus (InMemory → Runtime) is the only change needed to move from Phase 1
 * standalone UI to the Phase 2 background-backed app.
 */
export function CommandBusProvider(props: { bus: CommandBus; children: ReactNode }) {
  return createElement(CommandBusContext.Provider, { value: props.bus }, props.children);
}

/** Returns the current {@link CommandBus}; throws if used outside the provider. */
export function useCommandBus(): CommandBus {
  const bus = useContext(CommandBusContext);
  if (!bus) throw new Error('useCommandBus must be used within a CommandBusProvider');
  return bus;
}

/** Returns a stable `dispatch` function for write-only components. */
export function useDispatch(): (cmd: Command) => Promise<CommandResult> {
  const bus = useCommandBus();
  return useCallback((cmd: Command) => bus.dispatch(cmd), [bus]);
}

/**
 * Subscribes to the bus and exposes the latest {@link Snapshot} plus a
 * `dispatch` helper. Hydrates once via a `getState` command on mount, then
 * tracks every subsequent change the bus reports.
 */
export function useSnapshot(): {
  snapshot: Snapshot | null;
  dispatch: (cmd: Command) => Promise<CommandResult>;
} {
  const bus = useCommandBus();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);

  useEffect(() => {
    let active = true;
    void bus.dispatch({ type: 'getState' }).then((result) => {
      if (active && result.ok) setSnapshot(result.snapshot);
    });
    const unsubscribe = bus.subscribe((next) => setSnapshot(next));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [bus]);

  const dispatch = useCallback((cmd: Command) => bus.dispatch(cmd), [bus]);
  return { snapshot, dispatch };
}
