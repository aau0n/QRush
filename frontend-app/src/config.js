const env = import.meta.env;

export const API_BASE_URL =
  (env.VITE_API_BASE_URL || '').replace(/\/$/, '') ||
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : 'http://localhost:3000');
