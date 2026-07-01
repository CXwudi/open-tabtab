import { browser } from 'wxt/browser';

type ChromeEvent<T extends (...args: never[]) => void> = {
  addListener(listener: T): void;
  removeListener(listener: T): void;
};

type Unsubscribe = () => void;

const TAB_CHANGE_DEBOUNCE_MS = 50;

/** Subscribes to browser tab changes and debounces rapid event bursts. */
export function subscribeToTabChanges(cb: () => void): Unsubscribe {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(cb, TAB_CHANGE_DEBOUNCE_MS);
  };
  const removers: Unsubscribe[] = [];

  addListener(browser.tabs.onCreated, schedule, removers);
  addListener(browser.tabs.onRemoved, schedule, removers);
  addListener(browser.tabs.onUpdated, schedule, removers);
  addListener((browser.tabs as unknown as { onMoved?: ChromeEvent<() => void> }).onMoved, schedule, removers);
  addListener(browser.tabs.onActivated, schedule, removers);

  return () => {
    if (timer) {
      clearTimeout(timer);
    }

    removers.forEach((remove) => remove());
  };
}

function addListener<T extends (...args: never[]) => void>(
  event: ChromeEvent<T> | undefined,
  listener: T,
  removers: Unsubscribe[],
): void {
  if (!event) {
    return;
  }

  try {
    event.addListener(listener);
    removers.push(() => event.removeListener(listener));
  } catch {
    // fake-browser exposes some Chrome events, such as onMoved, as unimplemented stubs.
  }
}
