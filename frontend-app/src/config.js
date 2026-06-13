const env = import.meta.env;

export const API_BASE_URL = (env.VITE_API_BASE_URL || '').replace(/\/$/, '');
export const IS_MOCK = !API_BASE_URL;
