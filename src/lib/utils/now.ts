/**
 * Request time for Server Components. Pages that call this have already read
 * cookies, so they render per request and the value is never baked into a cache.
 */
export function requestTime(): number {
  return Date.now();
}
