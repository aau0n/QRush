const SELECTED_TICKET_KEY = "q_rush_selected_ticket";

export function saveSelectedTicket(ticket) {
  localStorage.setItem(SELECTED_TICKET_KEY, JSON.stringify(ticket));
}

export function getSelectedTicket() {
  const raw = localStorage.getItem(SELECTED_TICKET_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearSelectedTicket() {
  localStorage.removeItem(SELECTED_TICKET_KEY);
}