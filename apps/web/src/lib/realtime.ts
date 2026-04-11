export const REQUESTS_UPDATED_EVENT = "vlink-requests-updated";
export const REQUESTS_UPDATED_STORAGE_KEY = "vlink_requests_updated_at";

export const PENDING_COUNT_UPDATED_EVENT = "vlink-pending-count-updated";
export const PENDING_COUNT_UPDATED_STORAGE_KEY = "vlink_pending_count_updated_at";

function notify(eventName: string, storageKey: string) {
  if (typeof window === "undefined") {
    return;
  }

  const stamp = Date.now().toString();
  window.localStorage.setItem(storageKey, stamp);
  window.dispatchEvent(new Event(eventName));
}

export function notifyRequestsUpdated() {
  notify(REQUESTS_UPDATED_EVENT, REQUESTS_UPDATED_STORAGE_KEY);
}

export function notifyPendingCountUpdated() {
  notify(PENDING_COUNT_UPDATED_EVENT, PENDING_COUNT_UPDATED_STORAGE_KEY);
}
