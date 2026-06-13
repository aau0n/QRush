const KEYS = {
  holderProfile: 'qrush_holder_profile',
  savedVc: 'qrush_saved_vc',
  tickets: 'qrush_saved_tickets',
  selectedTicket: 'qrush_selected_ticket',
  lastVp: 'qrush_last_vp',
  lastEntryProof: 'qrush_last_entry_proof',
};

export function saveJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function loadJson(key, fallback = null) {
  const raw = localStorage.getItem(key);
  if (!raw) return fallback;

  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function removeItem(key) {
  localStorage.removeItem(key);
}

export function saveHolderProfile(profile) {
  saveJson(KEYS.holderProfile, profile);
}

export function loadHolderProfile(fallback = null) {
  return loadJson(KEYS.holderProfile, fallback);
}

export function saveVc(payload) {
  saveJson(KEYS.savedVc, payload);
}

export function loadVc(fallback = null) {
  return loadJson(KEYS.savedVc, fallback);
}

export function clearVc() {
  removeItem(KEYS.savedVc);
}

export function saveTickets(tickets) {
  saveJson(KEYS.tickets, tickets);
}

export function loadTickets(fallback = []) {
  return loadJson(KEYS.tickets, fallback);
}

export function saveLastVp(vpPayload) {
  saveJson(KEYS.lastVp, vpPayload);
}

export function loadLastVp(fallback = null) {
  return loadJson(KEYS.lastVp, fallback);
}

export function saveLastEntryProof(proofPayload) {
  saveJson(KEYS.lastEntryProof, proofPayload);
}

export function loadLastEntryProof(fallback = null) {
  return loadJson(KEYS.lastEntryProof, fallback);
}

export function saveSelectedTicket(ticket) {
  saveJson(KEYS.selectedTicket, ticket);
}

export function loadSelectedTicket(fallback = null) {
  return loadJson(KEYS.selectedTicket, fallback);
}

export function clearSelectedTicket() {
  removeItem(KEYS.selectedTicket);
}