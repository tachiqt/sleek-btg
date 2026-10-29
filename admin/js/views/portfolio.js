import {
  listPortfolio,
  savePortfolioItem,
  deletePortfolioItem,
} from '../../../js/firebase/api.js?v=20260921a';
import { portfolioPublicUrl } from '../../../js/r2/client.js';
import { escapeHtml, formData } from '../utils.js';
import { runAction } from '../feedback.js';
import { paginate, paginationHtml, bindPager, readPage, writePage } from '../pagination.js';

const PAGE_SIZE = 4;

export async function renderPortfolio(root) {
  root.innerHTML = `<p class="empty">Loading portfolio…</p>`;
  writePage(root, 1);
  await draw(root);
}

async function draw(root) {
  const items = await listPortfolio();
  const page = paginate(items, readPage(root), PAGE_SIZE);
  writePage(root, page.current);

  root.innerHTML = `
    <section class="panel">
      <div class="panel-head"><div><h2>Upload portfolio images</h2><p>Images upload to Cloudflare R2, then appear on the public gallery</p></div></div>
      <form id="portfolio-form" class="form-grid">
        <label class="full">Image file<input name="file" type="file" accept="image/*" required/></label>
        <label>Label<input name="label" required placeholder="e.g. SOFT ALMOND GLOSS" style="text-transform:uppercase"/></label>
        <label>Alt text<input name="alt" placeholder="Describe the set for accessibility"/></label>
        <label>Order<input name="order" type="number" value="${items.length + 1}" min="0"/></label>
        <div class="full"><button class="btn" type="submit">Upload to R2 gallery</button></div>
      </form>
    </section>
    <section class="panel">
      <div class="panel-head"><div><h2>Live gallery</h2><p>${items.length} photo(s) · shown on the landing page · ${PAGE_SIZE} per page</p></div></div>
      <div class="portfolio-grid">
        ${
          page.slice.length
            ? page.slice
                .map((item) => {
                  const src = escapeHtml(portfolioPublicUrl(item.image || item.storagePath));
                  return `<article class="portfolio-card">
                    <img src="${src}" alt="${escapeHtml(item.alt || item.label)}" loading="lazy"/>
                    <div class="meta">
                      <strong>${escapeHtml(String(item.label || '').toUpperCase())}</strong>
                      <div class="row-actions">
                        <button type="button" class="btn btn-danger btn-sm" data-del-port="${item.id}" data-path="${escapeHtml(item.storagePath || '')}" data-provider="${escapeHtml(item.storageProvider || 'r2')}">Delete</button>
                      </div>
                    </div>
                  </article>`;
                })
                .join('')
            : `<p class="empty">No portfolio images yet. Upload your first set.</p>`
        }
      </div>
      ${paginationHtml(page, { noun: 'photos' })}
    </section>
  `;

  bindPager(root, (next) => {
    writePage(root, next);
    draw(root);
  });

  root.querySelector('#portfolio-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    try {
      await runAction(
        btn,
        async () => {
          const data = formData(e.target);
          const file = e.target.file.files[0];
          await savePortfolioItem({
            file,
            label: data.label,
            alt: data.alt || data.label,
            order: data.order,
          });
          writePage(root, 1);
          await draw(root);
        },
        { loading: 'Uploading…', success: 'Portfolio image uploaded successfully' }
      );
    } catch {
      /* toast already shown */
    }
  });

  root.querySelectorAll('[data-del-port]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this portfolio image?')) return;
      try {
        await runAction(
          btn,
          async () => {
            await deletePortfolioItem(btn.dataset.delPort, btn.dataset.path || null, btn.dataset.provider || 'r2');
            await draw(root);
          },
          { loading: 'Removing…', success: 'Portfolio image removed successfully' }
        );
      } catch {
        /* toast already shown */
      }
    });
  });
}
