/**
 * Client-side pagination helpers for admin list views.
 */
export function paginate(items, page = 1, pageSize = 10) {
  const list = Array.isArray(items) ? items : [];
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize) || 1);
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (current - 1) * pageSize;
  const slice = list.slice(start, start + pageSize);
  return {
    slice,
    current,
    totalPages,
    total,
    start,
    end: start + slice.length,
    pageSize,
  };
}

export function paginationHtml(page, { noun = 'items' } = {}) {
  const { current, totalPages, total, start, end, pageSize } = page;
  if (total <= pageSize) return '';

  return `<nav class="pager" aria-label="Pagination">
    <p class="pager-meta">Showing ${start + 1}–${end} of ${total} ${noun}</p>
    <div class="pager-controls">
      <button type="button" class="btn btn-ghost btn-sm" data-page="${current - 1}" ${current <= 1 ? 'disabled' : ''}>Previous</button>
      <span class="pager-page">Page ${current} of ${totalPages}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-page="${current + 1}" ${current >= totalPages ? 'disabled' : ''}>Next</button>
    </div>
  </nav>`;
}

export function bindPager(root, onPage) {
  root.querySelectorAll('.pager [data-page]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const next = Number(btn.dataset.page);
      if (!Number.isFinite(next) || next < 1) return;
      onPage(next);
    });
  });
}

export function readPage(root, key = 'page') {
  return Math.max(1, Number(root.dataset[key]) || 1);
}

export function writePage(root, page, key = 'page') {
  root.dataset[key] = String(Math.max(1, page || 1));
}
