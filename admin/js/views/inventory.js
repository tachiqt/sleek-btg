import {
  listInventory,
  saveInventoryItem,
  deleteInventoryItem,
  listServices,
  saveService,
  seedDefaultServices,
  listBundles,
  saveBundle,
  seedDefaultBundles,
  inventoryValue,
  serviceMargin,
} from '../../../js/firebase/api.js?v=20260921a';
import { peso, pct, escapeHtml, formData } from '../utils.js';
import { runAction } from '../feedback.js';

const DEFAULT_SERVICES = [
  { key: 'gel', label: 'Gel manicure', price: 400, materialCost: 120, duration: '1–2 hours' },
  { key: 'extensions', label: 'Soft gel extensions', price: 550, materialCost: 180, duration: '1½–3 hours' },
  { key: 'removal', label: 'Removal', price: 200, materialCost: 40, duration: 'Up to 1 hour' },
];

const DEFAULT_BUNDLES = [
  {
    key: 'a',
    label: 'Bundle A',
    description: '1 color + 1 design or accessory',
    price: 0,
    quoteOnly: true,
    order: 1,
    featured: false,
  },
  {
    key: 'b',
    label: 'Bundle B',
    description: '2 colors + 1 design or accessory',
    price: 0,
    quoteOnly: true,
    order: 2,
    featured: false,
  },
  {
    key: 'c',
    label: 'Bundle C',
    description: '1 color + 2 designs or accessories',
    price: 0,
    quoteOnly: true,
    order: 3,
    featured: false,
  },
  {
    key: 'd',
    label: 'Bundle D',
    description: '2 colors + 2 designs or accessories',
    price: 0,
    quoteOnly: true,
    order: 4,
    featured: false,
  },
  {
    key: 'glam',
    label: 'All-Out Glam',
    description: 'Client’s call — higher color count, designs, and complexity',
    price: 0,
    quoteOnly: true,
    order: 5,
    featured: true,
  },
];

async function safeLoad(label, fn, fallback = []) {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[inventory] ${label} failed`, err);
    return { error: err?.message || `Could not load ${label}`, data: fallback };
  }
}

function unwrap(result, fallback = []) {
  if (result && typeof result === 'object' && 'error' in result) {
    return { rows: result.data ?? fallback, error: result.error };
  }
  return { rows: result ?? fallback, error: null };
}

export async function renderInventory(root) {
  root.innerHTML = `<div class="inventory"><p class="inventory-loading">Loading inventory…</p></div>`;
  await draw(root);
}

async function draw(root) {
  const [rawItems, rawServices, rawBundles] = await Promise.all([
    safeLoad('inventory', listInventory),
    safeLoad('services', listServices),
    safeLoad('bundles', listBundles),
  ]);

  let { rows: items, error: itemsError } = unwrap(rawItems);
  let { rows: services, error: servicesError } = unwrap(rawServices);
  let { rows: bundles, error: bundlesError } = unwrap(rawBundles);

  try {
    if (!servicesError && !services.length) {
      services = await seedDefaultServices(DEFAULT_SERVICES);
    }
  } catch (err) {
    servicesError = err?.message || 'Could not seed services';
  }

  try {
    if (!bundlesError && !bundles.length) {
      bundles = await seedDefaultBundles(DEFAULT_BUNDLES);
    }
  } catch (err) {
    bundlesError = err?.message || 'Could not seed bundles';
    if (!bundles.length) {
      bundles = DEFAULT_BUNDLES.map((b, i) => ({ ...b, id: `local-${b.key || i}` }));
    }
  }

  const loadErrors = [
    itemsError && `Supplies: ${itemsError}`,
    servicesError && `Services: ${servicesError}`,
    bundlesError && `Bundles: ${bundlesError}`,
  ].filter(Boolean);

  const value = inventoryValue(items);
  const lowStock = items.filter((i) => Number(i.quantity) <= Number(i.reorderLevel || 0));
  const avgMargin =
    services.reduce((a, s) => a + serviceMargin(s).marginPct, 0) / (services.length || 1);

  root.innerHTML = `
    <div class="inventory">
      ${
        loadErrors.length
          ? `<div class="inventory-alert" role="alert">
              <strong>Some data could not load</strong>
              <p>${escapeHtml(loadErrors.join(' · '))}</p>
            </div>`
          : ''
      }

      <section class="inventory-metrics" aria-label="Inventory summary">
        <article class="inv-metric">
          <span>Stock value</span>
          <strong>${peso(value)}</strong>
        </article>
        <article class="inv-metric">
          <span>SKU count</span>
          <strong>${items.length}</strong>
        </article>
        <article class="inv-metric">
          <span>Low stock</span>
          <strong class="${lowStock.length ? 'profit-negative' : ''}">${lowStock.length}</strong>
        </article>
        <article class="inv-metric">
          <span>Avg margin</span>
          <strong>${pct(avgMargin)}</strong>
        </article>
      </section>

      <div class="inventory-layout">
        <section class="panel inventory-panel inventory-supplies">
          <div class="panel-head">
            <div>
              <p class="inv-kicker">Supplies</p>
              <h2>Stock room</h2>
              <p>Gels, tips, and consumables with unit cost</p>
            </div>
          </div>

          <form id="inventory-form" class="inventory-form">
            <div class="inventory-form-grid">
              <label>Item name<input name="name" required placeholder="e.g. Soft gel tips"/></label>
              <label>Category<input name="category" placeholder="Gels / Tips / Tools"/></label>
              <label>Quantity<input name="quantity" type="number" min="0" step="1" value="0" required/></label>
              <label>Unit<input name="unit" value="pcs" placeholder="pcs / bottle / pack"/></label>
              <label>Unit cost (₱)<input name="unitCost" type="number" min="0" step="0.01" value="0" required/></label>
              <label>Reorder at<input name="reorderLevel" type="number" min="0" step="1" value="2"/></label>
              <label class="full">Notes<input name="notes" placeholder="Brand, shade, supplier…"/></label>
            </div>
            <div class="form-actions">
              <button class="btn" type="submit">Add supply item</button>
            </div>
          </form>

          <div class="table-wrap">
            <table class="inventory-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Unit cost</th>
                  <th>Line value</th>
                  <th>Status</th>
                  <th class="col-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${
                  items.length
                    ? items
                        .map((i) => {
                          const low = Number(i.quantity) <= Number(i.reorderLevel || 0);
                          const line = Number(i.quantity) * Number(i.unitCost);
                          return `<tr>
                            <td>
                              <strong>${escapeHtml(i.name)}</strong>
                              <div class="row-meta">${escapeHtml(i.category || 'General')}${
                                i.notes ? ` · ${escapeHtml(i.notes)}` : ''
                              }</div>
                            </td>
                            <td>${i.quantity} ${escapeHtml(i.unit || '')}</td>
                            <td>${peso(i.unitCost)}</td>
                            <td>${peso(line)}</td>
                            <td>${low ? '<span class="badge low">Reorder</span>' : '<span class="badge open">OK</span>'}</td>
                            <td class="col-actions">
                              <div class="row-actions">
                                <button type="button" class="btn btn-ghost btn-sm" data-edit-inv="${i.id}">Edit</button>
                                <button type="button" class="btn btn-danger btn-sm" data-del-inv="${i.id}">Delete</button>
                              </div>
                            </td>
                          </tr>`;
                        })
                        .join('')
                    : `<tr><td colspan="6" class="empty">No supplies yet. Add your first stock item above.</td></tr>`
                }
              </tbody>
            </table>
          </div>
        </section>

        <aside class="inventory-pricing">
          <section class="panel inventory-panel">
            <div class="panel-head">
              <div>
                <p class="inv-kicker">Public site</p>
                <h2>Service pricing</h2>
                <p>Sell price shows on the website. Material cost is for your margin only.</p>
              </div>
            </div>

            <div class="price-card-list">
              ${
                services.length
                  ? services
                      .map((s) => {
                        const m = serviceMargin(s);
                        return `<article class="price-card" data-service-id="${s.id}">
                          <header class="price-card-head">
                            <div>
                              <strong>${escapeHtml(s.label)}</strong>
                              <span>${escapeHtml(s.key || '')}${s.duration ? ` · ${escapeHtml(s.duration)}` : ''}</span>
                            </div>
                            <div class="price-card-profit">
                              <em class="${m.profit >= 0 ? 'profit-positive' : 'profit-negative'}">${peso(m.profit)}</em>
                              <small>${pct(m.marginPct)} margin</small>
                            </div>
                          </header>
                          <div class="price-card-fields">
                            <label>Sell price (₱)
                              <input data-field="price" type="number" min="0" step="1" value="${m.price}"/>
                            </label>
                            <label>Material (₱)
                              <input data-field="materialCost" type="number" min="0" step="1" value="${m.cost}"/>
                            </label>
                          </div>
                          <footer class="price-card-actions">
                            <button type="button" class="btn btn-sm" data-save-service="${s.id}">Save price</button>
                          </footer>
                        </article>`;
                      })
                      .join('')
                  : `<p class="empty">No services yet.</p>`
              }
            </div>
          </section>

          <section class="panel inventory-panel">
            <div class="panel-head">
              <div>
                <p class="inv-kicker">Add-ons</p>
                <h2>Design bundles</h2>
                <p>Shown on services &amp; booking. Use Quote until you set a from-price.</p>
              </div>
            </div>

            <div class="price-card-list">
              ${
                bundles.length
                  ? bundles
                      .map((b) => {
                        const price = Number(b.price) || 0;
                        const quoteOnly = b.quoteOnly === true || price <= 0;
                        const display = quoteOnly ? 'Quote' : peso(price);
                        const localOnly = String(b.id || '').startsWith('local-');
                        return `<article class="price-card${b.featured ? ' is-featured' : ''}" data-bundle-id="${b.id}">
                          <header class="price-card-head">
                            <div>
                              <strong>${escapeHtml(b.label)}${b.featured ? ' <span class="inv-chip">Featured</span>' : ''}</strong>
                              <span>${escapeHtml(b.description || b.key || '')}</span>
                            </div>
                            <div class="price-card-profit">
                              <em>${display}</em>
                              <small>Public display</small>
                            </div>
                          </header>
                          <div class="price-card-fields price-card-fields-bundle">
                            <label>From price (₱)
                              <input data-field="price" type="number" min="0" step="1" value="${price}" ${localOnly ? 'disabled' : ''}/>
                            </label>
                            <label class="price-check">
                              <input data-field="quoteOnly" type="checkbox" ${quoteOnly ? 'checked' : ''} ${localOnly ? 'disabled' : ''}/>
                              <span>Show as Quote</span>
                            </label>
                          </div>
                          <footer class="price-card-actions">
                            <button type="button" class="btn btn-sm" data-save-bundle="${b.id}" ${localOnly ? 'disabled title="Fix permissions, then refresh"' : ''}>Save bundle</button>
                          </footer>
                        </article>`;
                      })
                      .join('')
                  : `<p class="empty">No bundles yet.</p>`
              }
            </div>
          </section>
        </aside>
      </div>
    </div>
  `;

  root.querySelector('#inventory-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    try {
      await runAction(
        btn,
        async () => {
          await saveInventoryItem(formData(e.target));
          await draw(root);
        },
        { loading: 'Saving…', success: 'Inventory item saved successfully' }
      );
    } catch {
      /* toast already shown */
    }
  });

  root.querySelectorAll('[data-del-inv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this inventory item?')) return;
      try {
        await runAction(
          btn,
          async () => {
            await deleteInventoryItem(btn.dataset.delInv);
            await draw(root);
          },
          { loading: 'Deleting…', success: 'Inventory item deleted successfully' }
        );
      } catch {
        /* toast already shown */
      }
    });
  });

  root.querySelectorAll('[data-edit-inv]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const item = items.find((i) => i.id === btn.dataset.editInv);
      if (!item) return;
      const quantity = prompt('New quantity', String(item.quantity));
      if (quantity === null) return;
      const unitCost = prompt('Unit cost (₱)', String(item.unitCost));
      if (unitCost === null) return;
      try {
        await runAction(
          btn,
          async () => {
            await saveInventoryItem(
              {
                name: item.name,
                category: item.category,
                quantity,
                unit: item.unit,
                unitCost,
                reorderLevel: item.reorderLevel,
                notes: item.notes,
              },
              item.id
            );
            await draw(root);
          },
          { loading: 'Updating…', success: 'Inventory item updated successfully' }
        );
      } catch {
        /* toast already shown */
      }
    });
  });

  root.querySelectorAll('[data-save-service]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-service-id]');
      const service = services.find((s) => s.id === btn.dataset.saveService);
      if (!service || !row) return;
      try {
        await runAction(
          btn,
          async () => {
            await saveService(
              {
                ...service,
                price: row.querySelector('[data-field="price"]').value,
                materialCost: row.querySelector('[data-field="materialCost"]').value,
              },
              service.id
            );
            await draw(root);
          },
          { loading: 'Saving…', success: 'Service pricing saved successfully' }
        );
      } catch {
        /* toast already shown */
      }
    });
  });

  root.querySelectorAll('[data-save-bundle]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const row = btn.closest('[data-bundle-id]');
      const bundle = bundles.find((b) => b.id === btn.dataset.saveBundle);
      if (!bundle || !row || String(bundle.id).startsWith('local-')) return;
      const priceInput = row.querySelector('[data-field="price"]');
      const quoteInput = row.querySelector('[data-field="quoteOnly"]');
      const price = Number(priceInput?.value) || 0;
      const quoteOnly = Boolean(quoteInput?.checked) || price <= 0;
      try {
        await runAction(
          btn,
          async () => {
            await saveBundle(
              {
                ...bundle,
                price: quoteOnly ? 0 : price,
                quoteOnly,
              },
              bundle.id
            );
            await draw(root);
          },
          { loading: 'Saving…', success: 'Bundle pricing saved successfully' }
        );
      } catch {
        /* toast already shown */
      }
    });
  });

  root.querySelectorAll('[data-bundle-id] [data-field="price"]').forEach((input) => {
    input.addEventListener('input', () => {
      const row = input.closest('[data-bundle-id]');
      const quote = row?.querySelector('[data-field="quoteOnly"]');
      if (!quote) return;
      if (Number(input.value) > 0) quote.checked = false;
    });
  });
}
