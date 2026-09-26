export const SESSION_REPLACED_QUERY = "session_replaced";
export const DEVICE_LIMIT_QUERY = "device_limit";
export const DEVICE_SETUP_QUERY = "device_setup";

export function getSessionIdFromAccessToken(accessToken?: string | null): string | null {
  if (!accessToken) return null;

  try {
    const encodedPayload = accessToken.split(".")[1];
    if (!encodedPayload) return null;

    const normalized = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const payload = JSON.parse(globalThis.atob(padded)) as { session_id?: unknown };

    return typeof payload.session_id === "string" && payload.session_id.trim()
      ? payload.session_id
      : null;
  } catch {
    return null;
  }
}
