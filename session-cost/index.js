/**
 * Host half of the session-cost bundle and the bundle row the patch inserts.
 *
 * The capability is entirely a browser-side decoration: the cost reading comes
 * from the existing `tokenUsage` Session projection and the balance from the
 * existing `account` Remote namespace, so no Host service, route, tool, or
 * config is registered here.
 */
export function apply() {}
