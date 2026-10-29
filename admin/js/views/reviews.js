import { listReviews, saveReview, deleteReview } from '../../../js/firebase/api.js?v=20260921a';
import { escapeHtml, peso } from '../utils.js';
import { runAction } from '../feedback.js';
import { paginate, paginationHtml, bindPager, readPage, writePage } from '../pagination.js';

const PAGE_SIZE = 10;

export async function renderReviews(root) {
  root.innerHTML = `<p class="empty">Loading reviews…</p>`;
  writePage(root, 1);
  await draw(root);
}

async function draw(root) {
  const reviews = await listReviews();
  const published = reviews.filter((r) => r.published !== false).length;
  const page = paginate(reviews, readPage(root), PAGE_SIZE);
  writePage(root, page.current);

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Customer reviews</h2>
          <p>Reviews arrive when clients scan the QR after a completed visit · ${published} published · ${reviews.length} total</p>
        </div>
      </div>
      <div class="table-wrap">
        <table class="inventory-table">
          <thead>
            <tr>
              <th>Client</th>
              <th>Quote</th>
              <th>Visit</th>
              <th>Status</th>
              <th class="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${
              page.slice.length
                ? page.slice
                    .map(
                      (r) => `<tr>
                        <td>
                          <strong>${escapeHtml(r.name)}</strong>
                          <div class="row-meta">${escapeHtml(r.role || '')} · ${'★'.repeat(r.rating || 5)}</div>
                        </td>
                        <td>${escapeHtml(r.quote)}</td>
                        <td>
                          <div class="row-meta">
                            ${r.visitDate ? escapeHtml(r.visitDate) : '—'}
                            ${r.countsTowardProfit ? `<br/>${peso(r.quotedPrice)} counted` : ''}
                          </div>
                        </td>
                        <td><span class="badge ${r.published !== false ? 'confirmed' : 'cancelled'}">${r.published !== false ? 'Published' : 'Hidden'}</span></td>
                        <td class="col-actions">
                          <div class="row-actions">
                            <button type="button" class="btn btn-ghost btn-sm" data-toggle="${r.id}" data-pub="${r.published !== false}">${r.published !== false ? 'Hide' : 'Publish'}</button>
                            <button type="button" class="btn btn-danger btn-sm" data-del-rev="${r.id}">Delete</button>
                          </div>
                        </td>
                      </tr>`
                    )
                    .join('')
                : `<tr><td colspan="5" class="empty">No reviews yet. Complete a booking and have the client scan the QR.</td></tr>`
            }
          </tbody>
        </table>
      </div>
      ${paginationHtml(page, { noun: 'reviews' })}
    </section>
  `;

  bindPager(root, (next) => {
    writePage(root, next);
    draw(root);
  });

  root.querySelectorAll('[data-del-rev]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this review?')) return;
      try {
        await runAction(
          btn,
          async () => {
            await deleteReview(btn.dataset.delRev);
            await draw(root);
          },
          { loading: 'Deleting…', success: 'Review deleted successfully' }
        );
      } catch {
        /* toast already shown */
      }
    });
  });

  root.querySelectorAll('[data-toggle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const review = reviews.find((r) => r.id === btn.dataset.toggle);
      if (!review) return;
      const publishing = !(btn.dataset.pub === 'true');
      try {
        await runAction(
          btn,
          async () => {
            await saveReview({ ...review, published: publishing }, review.id);
            await draw(root);
          },
          {
            loading: publishing ? 'Publishing…' : 'Hiding…',
            success: publishing ? 'Review published successfully' : 'Review hidden successfully',
          }
        );
      } catch {
        /* toast already shown */
      }
    });
  });
}
