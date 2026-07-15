/* global Alpine, esc */
(function() { // Baton Filter — dropdown filter for epic and status

const _batonFilter = { epic: '', status: '' };

function getBatonFilter() { return _batonFilter; }
function setBatonFilter(key, val) {
  _batonFilter[key] = val;
  const el = document.querySelector('[x-data]');
  if (el && typeof Alpine !== 'undefined') {
    const data = Alpine.$data(el);
    if (data) data.batonState = [...data.batonState];
  }
}

function applyBatonFilter(tickets) {
  const filter = _batonFilter;
  return tickets.filter(t =>
    (!filter.epic || String(t.epic) === filter.epic) &&
    (!filter.status || t.status === filter.status));
}

function renderBatonFilterBar(tickets) {
  const epics = [...new Set(tickets.map(t => t.epic).filter(Boolean))].sort();
  const statuses = [...new Set(tickets.map(t => t.status).filter(Boolean))];
  const filter = _batonFilter;
  const epicOpts = epics.map(e =>
    `<option value="${e}" ${filter.epic === String(e) ? 'selected' : ''}>Epic #${e}</option>`
  ).join('');
  const statusOpts = statuses.map(s =>
    `<option value="${s}" ${filter.status === s ? 'selected' : ''}>${esc(s)}</option>`
  ).join('');
  return `<div class="baton-filter-bar">
    <select onchange="setBatonFilter('epic',this.value)" title="Filter by epic">
      <option value="">All epics</option>${epicOpts}</select>
    <select onchange="setBatonFilter('status',this.value)" title="Filter by status">
      <option value="">All statuses</option>${statusOpts}</select>
  </div>`;
}
if(typeof module!=="undefined")module.exports={getBatonFilter,setBatonFilter,applyBatonFilter,renderBatonFilterBar};else Object.assign(window,{getBatonFilter,setBatonFilter,applyBatonFilter,renderBatonFilterBar});
})();
