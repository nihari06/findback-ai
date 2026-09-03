/**
 * Unified API client utility for FindBack AI
 * Handles production URLs, fallbacks, and error reporting
 */

export function getApiUrl(endpoint: string): string {
  const base = (import.meta as any).env?.VITE_API_URL || (import.meta as any).env?.VITE_APP_URL || '';
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  if (base && typeof base === 'string' && base.startsWith('http')) {
    const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${cleanBase}${cleanEndpoint}`;
  }
  return cleanEndpoint;
}
