'use client';

/**
 * Reporting Engine UI — Daily / Weekly / Monthly / Yearly visual reports for
 *   1. Sales Revenue & Unpaid Receivables
 *   2. Order Volume & Delivery Fulfillment
 *   3. Gallon Inventory Balances (In Store, Delivered, Returned, Damaged)
 *
 * Rendered inside the Reports screen next to the shift X-Read.
 */
import { useEffect, useState } from 'react';
import { useFetch } from '@/hooks/useFetch';
import { customerApi, reportApi } from '@/lib/endpoints';
import { useToast } from '@/providers/ToastProvider';
import { peso, pesoCompact, num } from '@/lib/format';
import { Button, Card, Chip, Field, Kpi, Modal, State, Tabs } from '@/components/ui';
import { BarChart, ChartLegend, DonutWithLegend, LineChart } from '@/components/ui/Charts';
import ReportLedgers from './ledgers';

const PERIODS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'yearly', label: 'Yearly' },
];

const COLORS = {
  revenue: '#14b8a6',
  onAccount: '#f59e0b',
  delivered: '#1a8df0',
  returned: '#14b8a6',
  damaged: '#ef4444',
  inStore: '#8b5cf6',
  fulfilled: '#10b981',
  missed: '#ef4444',
  collected: '#14b8a6',
  orders: '#1a8df0',
  deliveries: '#8b5cf6',
};

/** `yyyy-mm-dd` for `<input type="date">`, in local time. */
const isoDay = (date = new Date()) => {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export default function AnalyticsReports() {
  const [period, setPeriod] = useState('weekly');
  const [date, setDate] = useState(isoDay());

  const { data, loading, error, reload } = useFetch(
    () => reportApi.summary({ period, date }),
    [period, date],
  );

  if (loading) {
    return (
      <div className="state">
        <span className="spinner spinner--dark" />
        <div>Crunching the numbers…</div>
      </div>
    );
  }

  if (error) {
    return (
      <State
        title="Could not build the report"
        message={error.message}
        action={
          <Button variant="action" onClick={reload}>
            Try again
          </Button>
        }
      />
    );
  }

  if (!data) return null;
  return (
    <AnalyticsBody
      data={data}
      period={period}
      date={date}
      setDate={setDate}
      setPeriod={setPeriod}
      reload={reload}
    />
  );
}

function AnalyticsBody({ data, period, date, setDate, setPeriod, reload }) {
  const { labels, sales, orders, gallons } = data;
  const rec = sales.receivables;
  const [settling, setSettling] = useState(false);

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* ------------------------------------------------ period picker */}
      <div className="engine-bar">
        <div>
          <div className="engine-bar__eyebrow">Reporting Engine</div>
          <div className="engine-bar__title">{data.periodLabel} Performance Report</div>
        </div>
        <div className="engine-bar__tools">
          <input
            className="input engine-bar__date"
            type="date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Report date"
          />
          <Tabs tabs={PERIODS} active={period} onChange={setPeriod} />
        </div>
      </div>

      {/* -------------------------------------------------------- KPIs */}
      <div className="grid grid--kpi">
        <Kpi
          label="Sales Revenue"
          value={peso(sales.totals.revenue)}
          foot={`${sales.totals.collectionRate}% collected · ${peso(sales.totals.onAccount)} on account`}
        />
        <Kpi
          label="Unpaid Receivables"
          value={peso(rec.outstanding)}
          foot={`${num(rec.customersWithBalance)} account(s) with an open balance`}
        />
        <Kpi
          label="Orders"
          value={num(orders.totals.orders)}
          foot={`${num(orders.totals.deliveryOrders)} delivery · avg ${peso(orders.totals.avgOrderValue, 0)}`}
        />
        <Kpi
          label="Delivery Fulfillment"
          value={`${orders.totals.fulfillmentRate}%`}
          foot={`${num(orders.totals.deliveryFulfilled)} of ${num(orders.totals.deliveryOrders)} deliveries completed`}
          chip={
            <Chip tone={orders.totals.fulfillmentRate >= 80 ? 'success' : 'warning'}>
              {orders.totals.deliveryMissed} missed
            </Chip>
          }
        />
      </div>
      {/* ---------------------------- 1. sales revenue & unpaid receivables */}
      <div className="grid grid--2">
        <Card
          title="Sales Revenue Trend"
          sub={`Revenue vs on-account credit · ${data.periodLabel.toLowerCase()}`}
          flush
        >
          <div className="chart-body">
            <LineChart
              labels={labels}
              formatValue={(v) => peso(v, 0)}
              series={[
                {
                  label: 'Revenue',
                  data: sales.series.map((s) => s.revenue),
                  color: COLORS.revenue,
                  area: true,
                },
                {
                  label: 'On-Account',
                  data: sales.series.map((s) => s.onAccount),
                  color: COLORS.onAccount,
                },
              ]}
            />
          </div>
          <ChartLegend
            items={[
              { label: 'Revenue', color: COLORS.revenue, value: peso(sales.totals.revenue) },
              { label: 'Collected', color: COLORS.collected, value: peso(sales.totals.collected) },
              { label: 'On-Account', color: COLORS.onAccount, value: peso(sales.totals.onAccount) },
              { label: 'Refunds', color: COLORS.missed, value: peso(sales.totals.refunds) },
            ]}
          />
        </Card>

        <Card
          title="Unpaid Receivables"
          sub={`${num(rec.customersWithBalance)} account(s) owe ${peso(rec.outstanding)}`}
          flush
          actions={
            <Button variant="soft" size="sm" onClick={() => setSettling(true)}>
              Record payment
            </Button>
          }
        >
          <DonutWithLegend
            slices={[
              { label: 'Collected', value: sales.totals.collected, color: COLORS.collected },
              { label: 'On-Account (period)', value: sales.totals.onAccount, color: COLORS.onAccount },
            ]}
            centerValue={pesoCompact(rec.outstanding)}
            centerLabel="Outstanding"
            formatValue={(v) => peso(v, 0)}
          />
          {rec.topDebtors.length > 0 && (
            <div className="engine-debtors">
              <div className="engine-debtors__head">Largest open balances</div>
              {rec.topDebtors.map((c) => (
                <div className="asset-row" key={c.id}>
                  {c.name}
                  <span className="asset-row__num">{peso(c.balance)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* --------------------------- 2. order volume & delivery fulfillment */}
      <div className="grid grid--2">
        <Card title="Order Volume" sub="Orders placed vs delivery orders" flush>
          <div className="chart-body">
            <BarChart
              labels={labels}
              formatValue={(v) => num(v)}
              series={[
                { label: 'Orders', data: orders.series.map((s) => s.orders), color: COLORS.orders },
                {
                  label: 'Deliveries',
                  data: orders.series.map((s) => s.deliveries),
                  color: COLORS.deliveries,
                },
              ]}
            />
          </div>
          <ChartLegend
            items={[
              { label: 'Orders', color: COLORS.orders, value: num(orders.totals.orders) },
              {
                label: 'Completed',
                color: COLORS.fulfilled,
                value: `${num(orders.totals.completed)} (${orders.totals.fillRate}%)`,
              },
              { label: 'Cancelled', color: COLORS.missed, value: num(orders.totals.cancelled) },
              { label: 'Refunded', color: COLORS.onAccount, value: num(orders.totals.refunded) },
            ]}
          />
        </Card>

        <Card
          title="Delivery Fulfillment"
          sub={`${orders.totals.deliveryFulfilled} of ${orders.totals.deliveryOrders} deliveries completed`}
          flush
        >
          {orders.totals.deliveryOrders === 0 ? (
            <State
              title="No deliveries yet"
              message="Delivery orders in this period will show the fulfillment rate here."
            />
          ) : (
            <DonutWithLegend
              slices={[
                {
                  label: 'Fulfilled',
                  value: orders.totals.deliveryFulfilled,
                  color: COLORS.fulfilled,
                },
                { label: 'Missed', value: orders.totals.deliveryMissed, color: COLORS.missed },
              ]}
              centerValue={`${orders.totals.fulfillmentRate}%`}
              centerLabel="Fulfilled"
              formatValue={(v) => num(v)}
            />
          )}
        </Card>
      </div>
      {/* ----------------------------- 3. gallon inventory balances */}
      <div className="grid grid--2">
        <Card
          title="Gallon Movements"
          sub="Containers delivered, returned and written off"
          flush
        >
          <div className="chart-body">
            <BarChart
              labels={labels}
              formatValue={(v) => `${num(v)} gal`}
              series={[
                {
                  label: 'Delivered',
                  data: gallons.series.map((s) => s.delivered),
                  color: COLORS.delivered,
                },
                {
                  label: 'Returned',
                  data: gallons.series.map((s) => s.returned),
                  color: COLORS.returned,
                },
                {
                  label: 'Damaged',
                  data: gallons.series.map((s) => s.damaged),
                  color: COLORS.damaged,
                },
              ]}
            />
          </div>
          <ChartLegend
            items={[
              {
                label: 'Delivered',
                color: COLORS.delivered,
                value: `${num(gallons.totals.delivered)} gal`,
              },
              {
                label: 'Returned',
                color: COLORS.returned,
                value: `${num(gallons.totals.returned)} gal`,
              },
              {
                label: 'Damaged',
                color: COLORS.damaged,
                value: `${num(gallons.totals.damaged)} gal`,
              },
            ]}
          />
        </Card>

        <Card
          title="Gallon Inventory Balances"
          sub="Current balances and the in-store trend"
          flush
        >
          <DonutWithLegend
            slices={[
              { label: 'In Store', value: gallons.balances.inStore, color: COLORS.inStore },
              { label: 'Delivered (out)', value: gallons.balances.delivered, color: COLORS.delivered },
              { label: 'Damaged', value: gallons.balances.damaged, color: COLORS.damaged },
            ]}
            centerValue={num(gallons.balances.total)}
            centerLabel="Total gallons"
            formatValue={(v) => `${num(v)} gal`}
          />
          <div className="chart-body chart-body--tight">
            <div className="chart-body__caption">In-store balance trend</div>
            <LineChart
              labels={labels}
              height={140}
              formatValue={(v) => `${num(v)} gal`}
              series={[
                {
                  label: 'In Store',
                  data: gallons.series.map((s) => s.inStore),
                  color: COLORS.inStore,
                  area: true,
                },
              ]}
            />
          </div>
        </Card>
      </div>

      {/* ---------------------------------- 4. tabular ledgers (print layout) */}
      <ReportLedgers data={data} />

      {/* Collecting the debt raised by a Pay Later sale. */}
      <RecordPaymentModal
        open={settling}
        onClose={() => setSettling(false)}
        onSaved={reload}
      />
    </div>
  );
}

/**
 * Records and updates customer debt payments (Full or Partial) and status (Paid or Unpaid).
 * Allows choosing an existing customer account or typing a customer name directly.
 * Auto-creates the account on the fly if needed so pre-registration is never required.
 */
function RecordPaymentModal({ open, onClose, onSaved }) {
  const toast = useToast();
  const [customerId, setCustomerId] = useState('');
  const [paymentType, setPaymentType] = useState('full'); // 'full' | 'partial'
  const [status, setStatus] = useState('paid'); // 'paid' | 'unpaid'
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);

  const {
    data: creditCustomers,
    loading: customersLoading,
    error: customersError,
    reload: reloadCustomers,
  } = useFetch(
    () => customerApi.withCredit(),
    [],
    { skip: !open },
  );
  const allCustomers = creditCustomers || [];

  const selected = allCustomers.find((c) => c.name.toLowerCase() === customerId.toLowerCase()) || null;

  // Reset modal state when opened/closed
  useEffect(() => {
    if (!open) {
      setCustomerId('');
      setPaymentType('full');
      setStatus('paid');
      setAmount('');
    }
  }, [open]);

  // Auto-sync payment amount when a customer is selected
  useEffect(() => {
    if (selected) {
      setPaymentType('full');
      setStatus('paid');
      setAmount(String(selected.balance));
    } else {
      setAmount('');
    }
  }, [selected]);

  // Total due is always the selected customer's balance — not editable
  const effectiveDue = selected ? (selected.balance || 0) : 0;

  const handlePaymentTypeChange = (type) => {
    setPaymentType(type);
    if (type === 'full') {
      setStatus('paid');
      setAmount(effectiveDue > 0 ? String(effectiveDue) : '0');
    } else {
      setStatus('unpaid');
      setAmount('');
    }
  };

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    if (newStatus === 'paid') {
      setPaymentType('full');
      setAmount(effectiveDue > 0 ? String(effectiveDue) : '0');
    } else {
      setPaymentType('partial');
      setAmount('');
    }
  };

  if (!open) return null;

  const paymentValue =
    paymentType === 'full' || status === 'paid'
      ? effectiveDue
      : Number(amount) || 0;

  const remaining = Math.max(0, effectiveDue - paymentValue);
  const isResultPaid = status === 'paid' || paymentType === 'full' || remaining === 0;
  const currentDisplayName = selected?.name?.trim() || '';

  const submit = async () => {
    const finalName = currentDisplayName;
    if (!finalName || !selected) {
      toast.error('Select a customer', 'Please choose a customer from the dropdown.');
      return;
    }

    setBusy(true);
    try {
      // If the customer has a linked _id, use it directly.
      // If not (unlinked walk-in on-account), look up by name in Customer collection.
      let targetId = selected._id;
      if (!targetId) {
        // Search the full customer list for a match by name
        const allRes = await customerApi.list({});
        const match = (allRes?.data || []).find(
          (c) => c.name.trim().toLowerCase() === finalName.toLowerCase(),
        );
        if (match) {
          targetId = match._id;
        } else {
          // Auto-create a Customer record so we can settle against it
          const created = await customerApi.create({
            name: finalName,
            balance: isResultPaid ? 0 : effectiveDue,
          });
          targetId = created?.data?._id;
        }
      }

      if (!targetId) {
        toast.error('Customer not found', 'Could not locate the customer record.');
        setBusy(false);
        return;
      }

      if (isResultPaid) {
        await customerApi.settle(targetId, 0);
        toast.success(
          'Payment updated',
          `${finalName}'s balance has been marked as PAID (${peso(0)}).`,
        );
      } else {
        const val = Number(amount);
        if (!Number.isFinite(val) || val <= 0) {
          toast.error('Enter an amount', 'Please enter the partial payment amount received.');
          setBusy(false);
          return;
        }
        await customerApi.update(targetId, { balance: Math.max(0, effectiveDue - val) });
        toast.success(
          'Payment updated',
          `Partial payment of ${peso(val)} recorded — ${finalName} owes ${peso(Math.max(0, effectiveDue - val))}.`,
        );
      }

      onSaved?.();
      onClose();
    } catch (err) {
      toast.error('Could not update payment', err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Record Payment & Update Status"
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="action"
            loading={busy}
            disabled={!currentDisplayName}
            onClick={submit}
          >
            {isResultPaid ? 'Mark as Paid' : 'Update Payment'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 14 }}>
        {/* 1. Customer dropdown — only customers with credit (balance > 0) */}
        <Field label="Customer Name">
          {customersLoading ? (
            <div style={{ color: 'var(--text-3)', fontSize: 13 }}>Loading customers with credit…</div>
          ) : customersError ? (
            <div style={{ display: 'grid', gap: 8, color: 'var(--danger, #dc2626)', fontSize: 13 }}>
              <span>Could not load customers with outstanding credit: {customersError.message}</span>
              <Button size="sm" onClick={reloadCustomers}>Try again</Button>
            </div>
          ) : allCustomers.length === 0 ? (
            <div
              style={{
                padding: '10px 12px',
                background: 'var(--surface-sunken, #f8fafc)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 13,
                color: 'var(--text-3)',
              }}
            >
              No customers with outstanding credit found.
            </div>
          ) : (
            <select
              className="select"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
            >
              <option value="">— Select a customer —</option>
              {allCustomers.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name} — owes {peso(c.balance)}
                </option>
              ))}
            </select>
          )}
        </Field>

        {/* Total Amount Due — auto-filled from the selected customer's balance, read-only */}
        <Field label="Total Amount Due">
          <div
            style={{
              padding: '9px 12px',
              background: 'var(--surface-sunken, #f8fafc)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              fontFamily: 'monospace',
              fontSize: 15,
              fontWeight: 700,
              color: effectiveDue > 0 ? 'var(--warning, #b45309)' : 'var(--text-2)',
              letterSpacing: '0.02em',
            }}
          >
            {effectiveDue > 0 ? peso(effectiveDue) : selected ? peso(0) : '—'}
          </div>
        </Field>

        {/* 2. Payment Type selection (Full vs Partial) */}
        <Field label="Payment Type">
          <div className="segmented" style={{ width: '100%' }}>
            <button
              type="button"
              style={{ flex: 1, padding: '9px 12px', fontWeight: 600, fontSize: 13 }}
              className={paymentType === 'full' ? 'on--blue' : ''}
              onClick={() => handlePaymentTypeChange('full')}
            >
              Full Payment
            </button>
            <button
              type="button"
              style={{ flex: 1, padding: '9px 12px', fontWeight: 600, fontSize: 13 }}
              className={paymentType === 'partial' ? 'on--blue' : ''}
              onClick={() => handlePaymentTypeChange('partial')}
            >
              Partial Payment
            </button>
          </div>
        </Field>

        {/* 3. Payment Status selection (Paid vs Unpaid) */}
        <Field label="Payment Status">
          <div className="segmented" style={{ width: '100%' }}>
            <button
              type="button"
              style={{ flex: 1, padding: '9px 12px', fontWeight: 600, fontSize: 13 }}
              className={status === 'paid' ? 'on--teal' : ''}
              onClick={() => handleStatusChange('paid')}
            >
              ✓ Paid
            </button>
            <button
              type="button"
              style={{ flex: 1, padding: '9px 12px', fontWeight: 600, fontSize: 13 }}
              className={status === 'unpaid' ? 'on--dark' : ''}
              onClick={() => handleStatusChange('unpaid')}
            >
              ⏳ Unpaid
            </button>
          </div>
        </Field>

        {/* 4. Amount Received input (for Partial payments) */}
        {paymentType === 'partial' ? (
          <Field label="Amount Received (₱)">
            <input
              className="input input--mono"
              type="number"
              min="1"
              max={effectiveDue > 0 ? effectiveDue : undefined}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Enter partial amount received..."
              autoFocus
            />
          </Field>
        ) : (
          <div className="credit-note" style={{ marginTop: 0 }}>
            Full payment will settle the entire {peso(effectiveDue)} debt. The balance will be zeroed to ₱0.00.
          </div>
        )}

        {/* 5. Summary / Preview calculation */}
        <div
          style={{
            background: 'var(--surface-sunken, #f8fafc)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '12px 14px',
            display: 'grid',
            gap: 8,
            fontSize: 13,
          }}
        >
          {currentDisplayName && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-3)' }}>Customer:</span>
              <strong>{currentDisplayName}</strong>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-3)' }}>Total Amount Due:</span>
            <span>{peso(effectiveDue)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-3)' }}>Payment Applied:</span>
            <span style={{ color: 'var(--brand-1, #14b8a6)', fontWeight: 600 }}>
              {peso(paymentValue)}
            </span>
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              borderTop: '1px dashed var(--border)',
              paddingTop: 8,
              fontWeight: 600,
            }}
          >
            <span>New Remaining Balance:</span>
            <span style={{ color: remaining > 0 ? 'var(--warning, #b45309)' : 'var(--success, #047857)' }}>
              {peso(remaining)}
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <span style={{ color: 'var(--text-3)' }}>Status After Update:</span>
            <Chip tone={isResultPaid ? 'success' : 'warning'}>
              {isResultPaid ? 'PAID' : 'UNPAID'}
            </Chip>
          </div>
        </div>
      </div>
    </Modal>
  );
}