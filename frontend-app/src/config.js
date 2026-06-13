const env = import.meta.env;

function inferApiBaseUrl() {
  if (typeof window === 'undefined') return '';

  const { hostname } = window.location;
  if (!hostname) return '';

  return `http://${hostname}:3000`;
}

export const API_BASE_URL = (env.VITE_API_BASE_URL || inferApiBaseUrl()).replace(/\/$/, '');
export const API_BASE_URL_SOURCE = env.VITE_API_BASE_URL ? 'env' : 'auto';
export const IS_MOCK = !API_BASE_URL;
