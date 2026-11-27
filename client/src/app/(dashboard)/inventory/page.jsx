'use client';

import { useEffect, useMemo, useState } from 'react';
import { useFetch, useDebounced } from '@/hooks/useFetch';
import { containerApi, inventoryApi } from '@/lib/endpoints';
import { useToast } from '@/providers/ToastProvider';
import { peso, pesoShort, num, stockTone } from '@/lib/format';
import { Button, Card, Chip, ConfirmModal, Field, Kpi, Modal, State, Tabs } from '@/components/ui';
import {
  IconArchive,
  IconEdit,
  IconFilter,
  IconPlus,
  IconRefresh,
  IconTrash,
  IconUndo,
} from '@/components/ui/Icons';

const TABS = [
  { key: 'All Items', label: 'All Items' },
  { key: 'Finished Stock', label: 'Finished Stock' },
  { key: 'Raw Supplies', label: 'Raw Supplies' },
  { key: 'Container Assets', label: 'Container Assets' },
  { key: 'Equipment', label: 'Equipment' },
];

export const blankItem = {
  name: '',
  category: 'Raw Supplies',
  stockLevel: 0,
  reorderPoint: 0,
  unitPrice: 0,
  unit: 'pcs',
  supplier: '',
  // --- Point of Sale: everything in stock can be rung up by default, and
  // every sale decrements the stock level above.
  sellPrice: 0,
  isSellable: true,
  icon: 'box',
};

export default function InventoryPage() {
  const toast = useToast();
  const [tab, setTab] = useState('All Items');
  const [search, setSearch] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [editing, setEditing] = useState(null);
  const [restocking, setRestocking] = useState(null);
  const [archiving, setArchiving] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const query = useDebounced(search, 300);

  const params = useMemo(
    () => ({
      category: tab === 'All Items' ? undefined : tab,
      search: query || undefined,
      lowOnly: lowOnly ? 'true' : undefined,
      archived: showArchived ? 'true' : undefined,
    }),
    [tab, query, lowOnly, showArchived],
  );

  const { data: items, meta, loading, error, reload } = useFetch(
    () => inventoryApi.list(params),
    [params.category, params.search, params.lowOnly, params.archived],
  );

  const { data: containerSummary } = useFetch(() => containerApi.summary(), []);
  const summary = meta?.summary;

  /** Un-archive from the archived list. */
  const restore = async (item) => {
    try {
      await inventoryApi.restore(item._id);
      reload();
      toast.success(`${item.name} restored`);
    } catch (err) {
      toast.error('Could not restore item', err.message);
    }
  };

  if (error) {
    return (
      <State
        title="Could not load inventory"
        message={error.message}
        action={
          <Button variant="action" onClick={reload}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* ------------------------------------------------ KPI row */}
      <div className="grid grid--kpi">
        <Kpi
          label="Total SKUs Tracked"
          value={summary ? num(summary.totalSkus) : '—'}
          foot={`Across ${summary?.categoryCount ?? 0} categories`}
        />
        <Kpi
          label="Low / Critical Items"
          chip={
            summary?.criticalCount > 0 && (
              <Chip tone="danger">↓ {summary.criticalCount} critical</Chip>
            )
          }
          value={summary ? num(summary.lowOrCritical) : '—'}
          foot="Requires immediate action"
        />
        <Kpi
          label="Container In-Station"
          value={summary ? num(summary.containerInStation) : '—'}
          foot="Ready for refilling"
        />
        <Kpi
          label="Est. Inventory Value"
          value={summary ? pesoShort(summary.estimatedValue) : '—'}
          foot="Based on unit cost"
        />
      </div>

      {/* ------------------------------------------------ Table */}
      <Card
        flush
        title={showArchived ? 'Archived Items' : 'Stock Levels'}
        sub={items ? `${items.length} item${items.length === 1 ? '' : 's'}` : undefined}
        actions={
          <>
            <input
              className="input"
              style={{ width: 185, padding: '7px 11px' }}
              placeholder="Search items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search items"
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLowOnly((v) => !v)}
              style={lowOnly ? { background: 'var(--info-bg)', color: '#0b62b3' } : undefined}
            >
              <IconFilter size={14} /> {lowOnly ? 'Low only' : 'Filter'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowArchived((v) => !v)}
              aria-pressed={showArchived}
              style={
                showArchived
                  ? { background: 'var(--surface-3)', color: 'var(--text)' }
                  : undefined
              }
            >
              <IconArchive size={14} />
              {showArchived ? 'Back to active items' : 'Show archived items'}
              {summary?.archivedCount > 0 && !showArchived && (
                <span style={{ opacity: 0.7 }}>({summary.archivedCount})</span>
              )}
            </Button>
            {!showArchived && (
              <Button variant="action" size="sm" onClick={() => setEditing({ ...blankItem })}>
                <IconPlus size={15} /> Add Item
              </Button>
            )}
          </>
        }
      >
        <Tabs tabs={TABS} active={tab} onChange={setTab} />

        {loading ? (
          <div style={{ padding: 18, display: 'grid', gap: 10 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 38 }} />
            ))}
          </div>
        ) : !items || items.length === 0 ? (
          showArchived ? (
            <State
              title="No archived items"
              message="Items you archive will appear here so you can restore or delete them."
            />
          ) : (
            <State title="No items" message="Nothing matches this filter." />
          )
        ) : (
          <div className="table-wrap">
            <table className="table table--actions-spread">
              <thead>
                <tr>
                  <th>Item Name</th>
                  <th>Category</th>
                  <th className="num">Stock Level</th>
                  <th className="num">Reorder Pt.</th>
                  <th className="num">Unit Price</th>
                  <th>Status</th>
                  <th>Point of Sale</th>
                  <th className="actions">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item._id} className={item.isArchived ? 'row--archived' : undefined}>
                    <td className="table__name">{item.name}</td>
                    <td className="table__muted">{item.category}</td>
                    <td
                      className="num"
                      style={{
                        fontWeight: 700,
                        color:
                          item.status === 'Critical'
                            ? 'var(--danger)'
                            : item.status === 'Low Stock'
                              ? 'var(--warning)'
                              : undefined,
                      }}
                    >
                      {num(item.stockLevel)}
                      <span className="table__muted"> {item.unit}</span>
                    </td>
                    <td className="num table__muted">{num(item.reorderPoint)}</td>
                    <td className="num">{peso(item.unitPrice, 2)}</td>
                    <td>
                      {item.isArchived ? (
                        <Chip tone="neutral">Archived</Chip>
                      ) : (
                        <Chip tone={stockTone(item.status)}>{item.status}</Chip>
                      )}
                    </td>
                    <td>
                      {item.isSellable ? (
                        <div>
                          <Chip tone="info">On POS</Chip>
                          <div className="table__muted" style={{ marginTop: 4 }}>
                            {peso(posPrice(item), 2)}
                          </div>
                        </div>
                      ) : (
                        <span className="table__muted">Not sold</span>
                      )}
                    </td>
                    <td className="actions">
                      <div className="actions__row">
                        {item.isArchived ? (
                          <>
                            <Button
                              variant="soft"
                              size="sm"
                              onClick={() => restore(item)}
                              aria-label={`Unarchive ${item.name}`}
                            >
                              <IconUndo size={13} /> Unarchive
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleting(item)}
                              aria-label={`Delete ${item.name} permanently`}
                            >
                              <IconTrash size={13} />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              variant="soft"
                              size="sm"
                              onClick={() => setRestocking(item)}
                            >
                              <IconRefresh size={13} /> Restock
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditing(item)}
                              aria-label={`Edit ${item.name}`}
                            >
                              <IconEdit size={13} />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setArchiving(item)}
                              aria-label={`Archive ${item.name}`}
                            >
                              <IconArchive size={13} />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}


        {/* ------------------------------------------ asset tracker */}
        {containerSummary && (
          <div style={{ padding: 18, borderTop: '1px solid var(--border)' }}>
            <div className="table__name" style={{ marginBottom: 12 }}>
              Container Asset Tracker
            </div>
            <div className="asset-cards">
              <div className="asset asset--success">
                <div className="asset__num">{num(containerSummary.inStation)}</div>
                <div className="asset__label">In Station</div>
                <div className="asset__hint">Ready for use</div>
              </div>
              <div className="asset asset--warning">
                <div className="asset__num">{num(containerSummary.withCustomer)}</div>
                <div className="asset__label">With Customers</div>
                <div className="asset__hint">Awaiting return</div>
              </div>
              <div className="asset asset--danger">
                <div className="asset__num">{num(containerSummary.damaged)}</div>
                <div className="asset__label">Damaged / Scrap</div>
                <div className="asset__hint">Write-off queue</div>
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="asset-row">
                <span className="dot" style={{ background: 'var(--success)' }} />
                In Station (Ready)
                <span className="asset-row__num">{num(containerSummary.inStation)}</span>
              </div>
              <div className="asset-row">
                <span className="dot" style={{ background: 'var(--warning)' }} />
                Out with Customers
                <span className="asset-row__num">{num(containerSummary.withCustomer)}</span>
              </div>
              <div className="asset-row">
                <span className="dot" style={{ background: 'var(--danger)' }} />
                Damaged / Scrapped
                <span className="asset-row__num">{num(containerSummary.damaged)}</span>
              </div>
              <div className="asset-row asset-row__total">
                Total
                <span className="asset-row__num">{num(containerSummary.total)}</span>
              </div>
            </div>
          </div>
        )}
      </Card>

      <ItemModal
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          reload();
          toast.success('Inventory saved');
        }}
      />

      <RestockModal
        item={restocking}
        onClose={() => setRestocking(null)}
        onSaved={(msg) => {
          setRestocking(null);
          reload();
          toast.success(msg);
        }}
      />

      <ConfirmModal
        open={Boolean(archiving)}
        title="Archive item"
        body={
          <>
            <p style={{ marginTop: 0 }}>
              Archive <strong>{archiving?.name}</strong>?
            </p>
            <p style={{ margin: '8px 0 0', color: 'var(--text-3)', fontSize: 13 }}>
              It will be hidden from stock levels, the KPI row and low-stock alerts.
              You can restore or delete it later under &ldquo;Show archived items&rdquo;.
            </p>
          </>
        }
        confirmLabel="Archive item"
        onCancel={() => setArchiving(null)}
        onConfirm={async () => {
          try {
            await inventoryApi.archive(archiving._id);
            setArchiving(null);
            reload();
            toast.success(`${archiving.name} archived`);
          } catch (err) {
            toast.error('Could not archive item', err.message);
          }
        }}
      />

      <ConfirmModal
        open={Boolean(deleting)}
        danger
        title="Delete permanently"
        body={
          <>
            <p style={{ marginTop: 0 }}>
              Delete <strong>{deleting?.name}</strong> for good?
            </p>
            <p style={{ margin: '8px 0 0', color: 'var(--text-3)', fontSize: 13 }}>
              This removes the item and its stock history. This cannot be undone.
            </p>
          </>
        }
        confirmLabel="Delete item"
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          try {
            await inventoryApi.remove(deleting._id);
            setDeleting(null);
            reload();
            toast.success(`${deleting.name} deleted`);
          } catch (err) {
            toast.error('Could not delete item', err.message);
          }
        }}
      />
    </div>
  );
}


const CATEGORIES = ['Finished Stock', 'Raw Supplies', 'Container Assets', 'Equipment'];
const UNITS = ['pcs', 'roll', 'set', 'box', 'gallon', 'litre'];
// Mirrors PRODUCT_ICONS in components/ui/Icons.jsx.
const ICONS = ['box', 'droplet', 'container', 'tank', 'pouch', 'truck'];

/**
 * What the POS will actually charge: the retail price, or the unit cost when
 * none is set. Mirrors the fallback in inventory.service.posSupplies so the
 * table and the till never disagree.
 */
const posPrice = (item) => (Number(item.sellPrice) > 0 ? item.sellPrice : item.unitPrice);

/** Add / edit an inventory item. */
function ItemModal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(blankItem);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Re-seed the form whenever a different row is opened.
  useEffect(() => {
    if (item) {
      setForm({
        ...blankItem,
        ...item,
        stockLevel: Number(item.stockLevel) || 0,
        reorderPoint: Number(item.reorderPoint) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        sellPrice: Number(item.sellPrice) || 0,
        isSellable: Boolean(item.isSellable),
        icon: item.icon || blankItem.icon,
      });
      setError(null);
    }
  }, [item]);

  if (!item) return null;

  const isEdit = Boolean(item._id);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const toggle = (key) => () =>
    setForm((f) => ({ ...f, [key]: !f[key] }));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: form.name,
        category: form.category,
        stockLevel: Number(form.stockLevel) || 0,
        reorderPoint: Number(form.reorderPoint) || 0,
        unitPrice: Number(form.unitPrice) || 0,
        unit: form.unit,
        supplier: form.supplier || undefined,
        sellPrice: Number(form.sellPrice) || 0,
        isSellable: form.isSellable,
        icon: form.icon || 'box',
      };
      if (isEdit) await inventoryApi.update(item._id, payload);
      else await inventoryApi.create(payload);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isEdit ? `Edit — ${item.name}` : 'Add inventory item'}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="action" loading={busy} disabled={!form.name.trim()} onClick={save}>
            {isEdit ? 'Save changes' : 'Add item'}
          </Button>
        </>
      }
    >
      {error && <div className="error-box">{error}</div>}

      <Field label="Item name">
        <input
          className="input"
          value={form.name}
          onChange={set('name')}
          placeholder="e.g. Membrane RO Filter"
        />
      </Field>

      <Field label="Category">
        <select className="select" value={form.category} onChange={set('category')}>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid--2" style={{ marginTop: 18 }}>
        <Field label="Stock level">
          <input
            className="input input--mono"
            type="number"
            min="0"
            value={form.stockLevel}
            onChange={set('stockLevel')}
          />
        </Field>
        <Field label="Reorder point">
          <input
            className="input input--mono"
            type="number"
            min="0"
            value={form.reorderPoint}
            onChange={set('reorderPoint')}
          />
        </Field>
      </div>

      <div className="grid grid--2" style={{ marginTop: 18 }}>
        <Field label="Unit price (₱)">
          <input
            className="input input--mono"
            type="number"
            min="0"
            step="0.01"
            value={form.unitPrice}
            onChange={set('unitPrice')}
          />
        </Field>
        <Field label="Unit">
          <select className="select" value={form.unit} onChange={set('unit')}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {/* ------------------------------------------- point of sale */}
      <div className="pos-box" style={{ marginTop: 18 }}>
        <div className="pos-box__head">
          <div>
            <div className="pos-box__title">Sell at the Point of Sale</div>
            <div className="pos-box__sub">
              This item shows up on the POS <strong>Supplies</strong> grid, and
              every sale reduces its stock level automatically.
            </div>
          </div>
          <button
            type="button"
            className={`switch ${form.isSellable ? 'on' : ''}`}
            onClick={toggle('isSellable')}
            role="switch"
            aria-checked={form.isSellable}
            aria-label="Sell at the Point of Sale"
          >
            <span className="switch__knob" />
          </button>
        </div>

        {form.isSellable && (
          <div className="grid grid--2" style={{ marginTop: 14 }}>
            <Field label="Selling price (₱)">
              <input
                className="input input--mono"
                type="number"
                min="0"
                step="0.01"
                value={form.sellPrice}
                onChange={set('sellPrice')}
              />
            </Field>
            <Field label="POS icon">
              <select className="select" value={form.icon} onChange={set('icon')}>
                {ICONS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
      </div>

      <Field label="Supplier">
        <input
          className="input"
          value={form.supplier || ''}
          onChange={set('supplier')}
          placeholder="Optional"
        />
      </Field>
    </Modal>
  );
}


/** Restock dialog. A negative quantity records a write-off. */
function RestockModal({ item, onClose, onSaved }) {
  const [quantity, setQuantity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (item) {
      setQuantity('');
      setError(null);
    }
  }, [item]);

  if (!item) return null;

  const qty = Number(quantity);
  const valid = quantity !== '' && Number.isFinite(qty) && qty !== 0;
  const projected = (Number(item.stockLevel) || 0) + (Number.isFinite(qty) ? qty : 0);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await inventoryApi.restock(item._id, qty);
      onSaved(
        qty > 0
          ? `${item.name} restocked by ${qty}`
          : `${item.name} written off by ${Math.abs(qty)}`,
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Restock — ${item.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="action" loading={busy} disabled={!valid || projected < 0} onClick={submit}>
            Apply
          </Button>
        </>
      }
    >
      {error && <div className="error-box">{error}</div>}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '12px 14px',
          background: 'var(--surface-2)',
          borderRadius: 'var(--radius)',
          marginBottom: 18,
          fontSize: 13,
        }}
      >
        <span>Current stock</span>
        <strong>
          {num(item.stockLevel)} {item.unit}
        </strong>
      </div>

      <Field label="Quantity to add (negative writes stock off)">
        <input
          className="input input--mono"
          type="number"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          placeholder="e.g. 50"
          autoFocus
        />
      </Field>

      {valid && (
        <div
          style={{
            marginTop: 16,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 13.5,
            fontWeight: 700,
          }}
        >
          <span>New stock level</span>
          <span style={{ color: projected < 0 ? 'var(--danger)' : undefined }}>
            {projected < 0 ? 'Cannot go below zero' : num(projected)}
          </span>
        </div>
      )}
    </Modal>
  );
}

