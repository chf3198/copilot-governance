// Baton Prune — filter done/cancelled tickets from baton display

function pruneStaleBaton(batonTickets, ticketLog) {
  if (!ticketLog || !ticketLog.length) return batonTickets;
  const closedIds = new Set(ticketLog
    .filter(t => ['done', 'cancelled'].includes(t.status))
    .map(t => String(t.issue)));
  return batonTickets.filter(t => !closedIds.has(String(t.issue)));
}
