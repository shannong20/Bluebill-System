'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFetch } from '@/hooks/useFetch';
import { customerApi, employeeApi, inventoryApi, orderApi, productApi } from '@/lib/endpoints';
import { useToast } from '@/providers/ToastProvider';
import {
  peso,
  num,
  customerTypeLabel,
  paymentLabel,
  containerHandlingLabel,
} from '@/lib/format';
import { Button, Card, Field, Modal, State, Stepper, Tabs } from '@/components/ui';
import { PRODUCT_ICONS, IconCart, IconPrinter, IconTrash, IconWarning } from '@/components/ui/Icons';

const CUSTOMER_TYPES = [
  { key: 'walk_in', label: 'Walk-in' },
  { key: 'delivery', label: 'Delivery' },
];

const PAYMENTS = [
  { key: 'cash', label: 'Cash' },
  // Not every delivery customer pays at the door — this charges the total to
  // the customer's account (a new one is opened if the name is not saved yet)
  // and leaves it sitting in receivables until they settle up.
  { key: 'on_account', label: 'Pay Later' },
];

const HANDLING = [
  { key: 'exchange_1to1', label: '1:1 Exchange' },
  { key: 'new_container', label: 'New Container' },
  { key: 'borrowing', label: 'Borrowing' },
];

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'refill', label: 'Refills' },
  { key: 'package', label: 'Packages' },
  { key: 'supply', label: 'Supplies' },
];

/** Stock at or under this many units gets the "running low" treatment. */
const LOW_STOCK = 10;

/**
 * Collapses a typed name so "  maria   dela  cruz " and "Maria Dela Cruz"
 * compare equal. The cashier types free text, so matching has to be forgiving
 * about spacing and case — but never about partial names.
 */
const normaliseName = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();

export default function PosPage() {
  const toast = useToast();

  /* ---------------------------------------------------- data */
  const { data: products, loading: loadingProducts } = useFetch(
    () => productApi.list({ isActive: true }),
    [],
  );
  // The Supplies half of the grid is read straight from Inventory & Stock, so
  // an item added there (and flagged "Sell at POS") shows up here with no
  // second record to maintain. Reloaded after each sale because selling
  // changes the stock level.
  const {
    data: supplies,
    loading: loadingSupplies,
    reload: reloadSupplies,
  } = useFetch(() => inventoryApi.posSupplies(), []);
  const { data: staff } = useFetch(() => employeeApi.list({}), []);
  const {
    data: customers,
    reload: reloadCustomers,
  } = useFetch(() => customerApi.list({}), []);

  /* ---------------------------------------------------- cart state */
  const [cart, setCart] = useState([]);
  const [tab, setTab] = useState('all');
  const [customerType, setCustomerType] = useState('walk_in');
  // Free text, not a picked id — most sales are for someone who has no saved
  // account. The text is matched against the customer list below so a real
  // account still gets linked when one exists.
  const [customerName, setCustomerName] = useState('');
  const [staffId, setStaffId] = useState('');
  const [handling, setHandling] = useState('exchange_1to1');
  const [payment, setPayment] = useState('cash');
  const [discount, setDiscount] = useState(0);
  const [cashReceived, setCashReceived] = useState('');
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const loading = loadingProducts || loadingSupplies;

  /**
   * One flat list of everything the cashier can ring up, from both sources.
   * `stock` is `null` for a product that tracks no stock at all, and a number
   * for everything that does — the grid uses it to grey out sold-out cards and
   * the cart uses it to cap the quantity.
   */
  const grid = useMemo(() => {
    const fromProducts = (products || []).map((p) => ({
      key: `product:${p._id}`,
      source: 'product',
      ref: p._id,
      name: p.name,
      price: p.price,
      icon: p.icon,
      category: p.category,
      unit: null,
      stock: p.inventoryItem ? p.inventoryItem.stockLevel : null,
    }));

    const fromStock = (supplies || []).map((s) => ({
      key: `inventory:${s._id}`,
      source: 'inventory',
      ref: s._id,
      name: s.name,
      price: s.price,
      icon: s.icon,
      // Sellable stock items always belong to the Supplies tab.
      category: 'supply',
      unit: s.unit,
      stock: s.stockLevel,
    }));

    return [...fromProducts, ...fromStock];
  }, [products, supplies]);

  const visible = useMemo(() => {
    if (tab === 'all') return grid;
    return grid.filter((g) => g.category === tab);
  }, [grid, tab]);

  /**
   * The saved account the typed name refers to, if any.
   *
   * Deliberately an exact match: linking an account moves money and assigns
   * containers, so a near-miss ("Maria" vs "Maria Cruz") must fall back to
   * plain text rather than silently posting to the wrong ledger.
   */
  const matchedCustomer = useMemo(() => {
    const target = normaliseName(customerName);
    if (!target) return null;
    return (customers || []).find((c) => normaliseName(c.name) === target) || null;
  }, [customerName, customers]);

  /* ---------------------------------------------------- cart ops */
  const addItem = useCallback((entry) => {
    setCart((list) => {
      const found = list.find((l) => l.key === entry.key);
      if (found) {
        // Never let a tap push the line past what is physically on hand.
        if (entry.stock !== null && found.qty + 1 > entry.stock) return list;
        return list.map((l) => (l.key === entry.key ? { ...l, qty: l.qty + 1 } : l));
      }
      return [...list, { ...entry, qty: 1 }];
    });
  }, []);

  const changeQty = (key, delta) =>
    setCart((list) =>
      list
        .map((l) => {
          if (l.key !== key) return l;
          const next = l.qty + delta;
          if (l.stock !== null && next > l.stock) return l;
          return { ...l, qty: next };
        })
        .filter((l) => l.qty > 0),
    );

  /**
   * Drops a whole line from the ticket. The stepper can only reach qty 1, so
   * without this a mistakenly added product has no way out of the order.
   */
  const removeItem = useCallback((key) => {
    setCart((list) => list.filter((l) => l.key !== key));
  }, []);

  /** Empties the ticket in one go — useful after ringing up the wrong customer. */
  const clearCart = useCallback(() => {
    setCart([]);
    setDiscount(0);
  }, []);

  /* ---------------------------------------------------- totals */
  const subtotal = cart.reduce((s, l) => s + l.price * l.qty, 0);
  const safeDiscount = Math.min(Math.max(0, Number(discount) || 0), subtotal);
  const total = subtotal - safeDiscount;
  const tendered = Number(cashReceived) || 0;
  const change = Math.max(0, tendered - total);

  // A walk-in cash sale needs no customer at all. Anything else must be
  // attributable to somebody — the delivery/consignment lines have to say who
  // the gallons went to, and a pay-later sale needs a name to hang the debt
  // on (the server links the account, or opens one when it is still new).
  const needsName = payment === 'on_account' || customerType !== 'walk_in';
  const accountLinked = Boolean(matchedCustomer);

  // Charging a saved account must respect its credit limit. The server
  // refuses the sale anyway, so it is flagged here before the cashier taps
  // Complete instead of after a failed request.
  const creditHeadroom =
    payment === 'on_account' && accountLinked && matchedCustomer.creditLimit > 0
      ? matchedCustomer.creditLimit - (matchedCustomer.balance + total)
      : null;
  const withinCreditLimit = creditHeadroom === null || creditHeadroom >= 0;

  const canSubmit =
    cart.length > 0 &&
    !busy &&
    (payment !== 'cash' || tendered >= total) &&
    (!needsName || customerName.trim().length > 0) &&
    withinCreditLimit;

  const completeSale = async () => {
    setBusy(true);
    try {
      const res = await orderApi.create({
        customerType,
        // The server prefers the linked account's name and falls back to this
        // one, so walk-in and unlinked names still land on the ticket.
        customer: accountLinked ? matchedCustomer._id : undefined,
        customerName: customerName.trim() || undefined,
        staff: staffId || undefined,
        // A line references either a product or a stock item — the server
        // prices it and draws the stock down either way.
        items: cart.map((l) => ({
          ...(l.source === 'inventory' ? { inventoryItem: l.ref } : { product: l.ref }),
          qty: l.qty,
        })),
        containerHandling: handling,
        discount: safeDiscount,
        paymentMethod: payment,
        cashReceived: payment === 'cash' ? tendered : 0,
      });

      setReceipt(res.data);
      if (payment === 'on_account') {
        toast.success(
          'Charged to account',
          `${res.data.orderId} · ${peso(res.data.total)} due from ${res.data.customerName}`,
        );
      } else {
        toast.success('Sale completed', `${res.data.orderId} · ${peso(res.data.total)}`);
      }

      // Stock levels and customer balances just changed — pull both so the
      // grid badges and the "owes ₱…" hints stay truthful.
      reloadSupplies();
      reloadCustomers();

      // Reset the ticket for the next customer. The name and payment method go
      // back to their defaults too — a leftover "Pay Later" would otherwise put
      // the next customer on debt by accident, and a stale name would keep
      // charging the previous account.
      setCart([]);
      setDiscount(0);
      setCashReceived('');
      setCustomerName('');
      setPayment('cash');
    } catch (err) {
      toast.error('Sale failed', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="pos">
      {/* ---------------------------------------------- product grid */}
      <Card flush>
        <div className="pos-catalog-head">
          <div className="pos-catalog-head__eyebrow">Product Catalog</div>
          <h2>Choose items</h2>
        </div>
        <Tabs tabs={TABS} active={tab} onChange={setTab} />
        {loading ? (
          <div className="pos-grid">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="skeleton" style={{ height: 150 }} />
            ))}
          </div>
        ) : visible.length === 0 ? (
          <State
            title="No products"
            message="Nothing in this category yet."
          />
        ) : (
          <div className="pos-grid">
            {visible.map((g) => {
              const Icon = PRODUCT_ICONS[g.icon] || PRODUCT_ICONS.droplet;
              const inCart = cart.find((l) => l.key === g.key);
              // `stock` is null for a product that tracks no stock at all.
              const left = g.stock === null ? null : Math.max(0, g.stock - (inCart?.qty || 0));
              const outOfStock = left === 0;
              return (
                <button
                  key={g.key}
                  type="button"
                  className={`product-card ${outOfStock ? 'product-card--out' : ''}`}
                  onClick={() => !outOfStock && addItem(g)}
                  disabled={outOfStock}
                  title={
                    g.source === 'inventory'
                      ? 'Stock item — selling this reduces its inventory level'
                      : undefined
                  }
                >
                  {inCart && <span className="product-card__qty">{inCart.qty}</span>}
                  <span className="product-card__category">
                    {TABS.find((item) => item.key === g.category)?.label || g.category}
                  </span>
                  <span className="product-card__icon">
                    <Icon size={26} />
                  </span>
                  <div className="product-card__name">{g.name}</div>
                  <div className="product-card__price">{peso(g.price, 0)}</div>
                  {left !== null && (
                    <div
                      className={`product-card__stock ${
                        outOfStock ? 'is-out' : left <= LOW_STOCK ? 'is-low' : ''
                      }`}
                    >
                      {outOfStock
                        ? 'Out of stock'
                        : `${num(left)} ${g.unit || 'pcs'} left`}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}

        <div
          className="pos-handling"
          style={{ borderTop: '1px solid var(--border)', padding: '16px 18px' }}
        >
          <div className="field-label" style={{ margin: 0 }}>
            Container Handling
          </div>
          <div className="handling-row" style={{ marginTop: 9 }}>
            {HANDLING.map((h) => (
              <button
                key={h.key}
                type="button"
                className={handling === h.key ? 'on' : ''}
                onClick={() => setHandling(h.key)}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* ---------------------------------------------- order panel */}
      <div className="pos-panel">
        <Card title="Current Order" flush>
          <div className="pos-panel__body">
            <div className="field-label">Customer Type</div>
            <div className="segmented">
              {CUSTOMER_TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={customerType === t.key ? 'on--dark' : ''}
                  onClick={() => setCustomerType(t.key)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {needsName && (
              <>
                <div className="field-label">Customer</div>
                <CustomerField
                  value={customerName}
                  onChange={setCustomerName}
                  customers={customers}
                  matched={matchedCustomer}
                  onAccount={payment === 'on_account'}
                />
              </>
            )}

            <div className="field-label">Assigned Staff / Rider</div>
            <select
              className="select"
              value={staffId}
              onChange={(e) => setStaffId(e.target.value)}
            >
              <option value="">Unassigned</option>
              {(staff || []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>

            <div className="field-label-row">
              <div className="field-label">
                Items ({cart.length ? `${cart.length} line${cart.length > 1 ? 's' : ''}` : 'none'})
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  className="cart-clear"
                  onClick={clearCart}
                  aria-label="Clear every item from the order"
                >
                  <IconTrash size={12} /> Clear order
                </button>
              )}
            </div>

            {cart.length === 0 ? (
              <div className="empty-cart">
                <IconCart size={38} className="empty-cart__icon" />
                <div>No items yet — tap products to add</div>
              </div>
            ) : (
              cart.map((l) => (
                <div className="cart-line" key={l.key}>
                  <div>
                    <div className="cart-line__name">{l.name}</div>
                    <div className="cart-line__meta">
                      {peso(l.price)} × {l.qty} = {peso(l.price * l.qty)}
                    </div>
                    {l.source === 'inventory' && (
                      <div className="cart-line__tag">Stock item</div>
                    )}
                  </div>
                  <Stepper
                    value={l.qty}
                    onDecrement={() => changeQty(l.key, -1)}
                    onIncrement={() => changeQty(l.key, 1)}
                  />
                  <div className="cart-line__right">
                    <strong>{peso(l.price * l.qty, 0)}</strong>
                    <button
                      type="button"
                      className="cart-line__remove"
                      onClick={() => removeItem(l.key)}
                      aria-label={`Remove ${l.name} from the order`}
                      title={`Remove ${l.name}`}
                    >
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}


            <div className="totals">
              <div className="totals__row">
                <span>Subtotal</span>
                <span className="totals__val">{peso(subtotal)}</span>
              </div>
              <div className="totals__row">
                <span>Discount</span>
                <span className="totals__val">−{peso(safeDiscount)}</span>
              </div>
              <div style={{ marginTop: 6 }}>
                <input
                  className="input input--mono"
                  type="number"
                  min="0"
                  step="1"
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  placeholder="Discount amount"
                  aria-label="Discount amount"
                />
              </div>
              <div className="totals__row totals__row--grand">
                <span>Total</span>
                <span className="totals__val">{peso(total)}</span>
              </div>
            </div>

            <div className="field-label">Payment Method</div>
            <div className="segmented">
              {PAYMENTS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={payment === p.key ? 'on--teal' : ''}
                  onClick={() => setPayment(p.key)}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {payment === 'cash' && (
              <>
                <div className="field-label">Cash Received</div>
                <input
                  className="input input--mono"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Cash received…"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                />
                {tendered > 0 && tendered >= total && (
                  <div
                    className="totals__row"
                    style={{ marginTop: 8, fontWeight: 700, color: 'var(--success)' }}
                  >
                    <span>Change</span>
                    <span className="totals__val">{peso(change)}</span>
                  </div>
                )}
              </>
            )}

            {needsName && !customerName.trim() && (
              <div className="error-box" style={{ marginTop: 14, marginBottom: 0, fontSize: 12.5 }}>
                Enter a customer name for this {customerTypeLabel(customerType).toLowerCase()} /{' '}
                {paymentLabel(payment).toLowerCase()} sale.
              </div>
            )}

            {payment === 'on_account' && !withinCreditLimit && (
              <div className="error-box" style={{ marginTop: 14, marginBottom: 0, fontSize: 12.5 }}>
                Credit limit reached for {matchedCustomer.name} — limit{' '}
                {peso(matchedCustomer.creditLimit)}, this sale would reach{' '}
                {peso(matchedCustomer.balance + total)}. Take payment now, or settle
                some of the balance first.
              </div>
            )}

            {payment === 'on_account' && withinCreditLimit && (
              <div className="credit-note">
                {accountLinked ? (
                  <>
                    Charging <strong>{matchedCustomer.name}</strong> · balance{' '}
                    {peso(matchedCustomer.balance)} → {peso(matchedCustomer.balance + total)}{' '}
                    after this sale.
                  </>
                ) : (
                  <>
                    No saved account yet — <strong>{customerName.trim()}</strong> will be
                    opened automatically and {peso(total)} added to their balance. Collect
                    it later from Reports → Unpaid Receivables.
                  </>
                )}
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <Button
                variant="action"
                size="lg"
                loading={busy}
                disabled={!canSubmit}
                onClick={completeSale}
              >
                {busy ? 'Completing…' : 'Complete Sale & Print Receipt'}
              </Button>
            </div>
          </div>
        </Card>
      </div>

      <ReceiptModal order={receipt} onClose={() => setReceipt(null)} />
    </div>
  );
}


/** Printable receipt shown after a completed sale. */
function ReceiptModal({ order, onClose }) {
  if (!order) return null;

  const print = () => {
    const w = window.open('', '_blank', 'width=380,height=640');
    if (!w) return;
    const rows = order.items
      .map(
        (i) =>
          `<tr><td>${i.qty}x ${i.name}</td><td align="right">₱${Number(i.lineTotal).toFixed(2)}</td></tr>`,
      )
      .join('');

    w.document.write(`
      <html><head><title>${order.orderId}</title>
      <style>
        body{font-family:Segoe UI,Arial,sans-serif;padding:22px;font-size:13px;color:#111}
        h1{font-size:17px;margin:0 0 2px;text-align:center}
        .c{text-align:center;color:#555;font-size:11px;margin-bottom:14px}
        table{width:100%;border-collapse:collapse;margin:10px 0}
        td{padding:3px 0}
        .r{text-align:right}
        .tot{border-top:1px solid #000;font-weight:700;font-size:15px}
        .meta{color:#555;font-size:11px;line-height:1.6}
      </style></head><body>
      <h1>BLUEBILL</h1>
      <div class="c">Refilling Station</div>
      <div class="meta">
        ${order.orderId}<br/>
        ${new Date(order.createdAt).toLocaleString()}<br/>
        ${order.customerName} &middot; ${customerTypeLabel(order.customerType)}<br/>
        Staff: ${order.staffName || '-'}<br/>
        ${containerHandlingLabel(order.containerHandling)}<br/>
        ${paymentLabel(order.paymentMethod)}
      </div>
      <table>${rows}</table>
      <table>
        <tr><td>Subtotal</td><td class="r">₱${Number(order.subtotal).toFixed(2)}</td></tr>
        <tr><td>Discount</td><td class="r">-₱${Number(order.discount).toFixed(2)}</td></tr>
        <tr class="tot"><td>TOTAL</td><td class="r">₱${Number(order.total).toFixed(2)}</td></tr>
        ${order.paymentMethod === 'cash'
            ? `<tr><td>Cash</td><td class="r">₱${Number(order.cashReceived).toFixed(2)}</td></tr>
               <tr><td>Change</td><td class="r">₱${Number(order.change).toFixed(2)}</td></tr>`
            : ''
        }
        ${order.paymentMethod === 'on_account'
            ? `<tr><td>Paid now</td><td class="r">₱0.00</td></tr>
               <tr><td>Balance due</td><td class="r">₱${Number(order.total).toFixed(2)}</td></tr>
               <tr><td colspan="2" style="color:#555;font-size:11px">Pay later — settle at the station</td></tr>`
            : ''
        }
      </table>
      <div class="c" style="margin-top:16px">Thank you &mdash; come again!</div>
      </body></html>`);
    w.document.close();
    w.print();
  };

  const line = (label, value, strong = false) => (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: strong ? 16 : 13.5,
        fontWeight: strong ? 800 : 500,
        ...(strong
          ? { borderTop: '1px solid var(--border)', paddingTop: 10, marginTop: 4 }
          : {}),
      }}
    >
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Sale complete — ${order.orderId}`}
      footer={
        <>
          <Button onClick={onClose}>Close</Button>
          <Button variant="action" onClick={print}>
            <IconPrinter size={16} /> Print Receipt
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 7 }}>
        {order.items.map((i) => line(`${i.qty}x ${i.name}`, peso(i.lineTotal)))}
        {line('Subtotal', peso(order.subtotal))}
        {order.discount > 0 && line('Discount', `−${peso(order.discount)}`)}
        {line(`Total (${paymentLabel(order.paymentMethod)})`, peso(order.total), true)}
        {order.paymentMethod === 'cash' && line('Cash received', peso(order.cashReceived))}
        {order.paymentMethod === 'cash' && line('Change', peso(order.change))}
        {order.paymentMethod === 'on_account' && line('Paid now', peso(0))}
        {order.paymentMethod === 'on_account' && line('Balance due', peso(order.total))}
        <div
          style={{
            marginTop: 8,
            paddingTop: 10,
            borderTop: '1px dashed var(--border)',
            fontSize: 12.5,
            color: 'var(--text-3)',
            lineHeight: 1.7,
          }}
        >
          {order.customerName} · {customerTypeLabel(order.customerType)}
          <br />
          {containerHandlingLabel(order.containerHandling)} · Staff: {order.staffName || '—'}
        </div>
      </div>
    </Modal>
  );
}


/**
 * Free-text customer field with suggestions from the saved accounts.
 *
 * The cashier types a name — that alone is enough for a cash sale, so a guest
 * with no account never has to be registered first. Saved accounts are offered
 * as suggestions and, when the typed text matches one exactly, the parent links
 * the order to it. `matched` is passed in so this stays a view: it never
 * decides which account is selected. `onAccount` only changes the wording —
 * a pay-later sale opens an account for an unmatched name instead of leaving
 * it on the ticket alone.
 */
function CustomerField({ value, onChange, customers, matched, onAccount = false }) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const boxRef = useRef(null);

  const query = normaliseName(value);

  /** Accounts whose name or phone contains what has been typed so far. */
  const suggestions = useMemo(() => {
    if (!query) return [];
    return (customers || [])
      .filter(
        (c) => normaliseName(c.name).includes(query) || normaliseName(c.phone).includes(query),
      )
      .slice(0, 6);
  }, [customers, query]);

  // Dismiss on an outside click. Listening on mousedown (not click) so the
  // list closes before the click reaches whatever is underneath it.
  useEffect(() => {
    if (!open) return undefined;
    const onMouseDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [open]);

  // Keep the highlighted row inside the list as it shrinks while typing.
  useEffect(() => {
    if (highlight > suggestions.length - 1) setHighlight(0);
  }, [suggestions.length, highlight]);

  const pick = (customer) => {
    onChange(customer.name);
    setOpen(false);
    setHighlight(0);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!suggestions.length) return;
      e.preventDefault();
      setOpen(true);
      setHighlight((i) => {
        const next = e.key === 'ArrowDown' ? i + 1 : i - 1;
        return (next + suggestions.length) % suggestions.length;
      });
      return;
    }
    if (e.key === 'Enter' && open && suggestions[highlight]) {
      e.preventDefault();
      pick(suggestions[highlight]);
    }
  };

  const showList = open && suggestions.length > 0;

  return (
    <div className="autocomplete" ref={boxRef}>
      <input
        className="input"
        type="text"
        value={value}
        placeholder="Type a customer name…"
        aria-label="Customer name"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-autocomplete="list"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(0);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />

      {showList && (
        <ul className="autocomplete__list" role="listbox">
          {suggestions.map((c, i) => (
            <li key={c._id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={`autocomplete__item ${i === highlight ? 'is-active' : ''}`}
                // mousedown, not click — the outside-click listener above would
                // otherwise close the list and swallow this press.
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(c)}
              >
                <span className="autocomplete__name">{c.name}</span>
                <span className="autocomplete__meta">
                  {c.balance > 0
                    ? `owes ${peso(c.balance)}`
                    : c.phone || c.type}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {matched ? (
        <div className="autocomplete__hint autocomplete__hint--linked">
          Linked to saved account · balance {peso(matched.balance)}
        </div>
      ) : (
        query && (
          <div className="autocomplete__hint">
            {onAccount
              ? 'No saved account yet — one will be opened when the sale is completed.'
              : 'New customer — saved on this order only.'}
          </div>
        )
      )}
    </div>
  );
}
