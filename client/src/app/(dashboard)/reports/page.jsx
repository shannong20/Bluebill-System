'use client';

import { useState } from 'react';
import { useFetch } from '@/hooks/useFetch';
import { downloadCsv, reportApi } from '@/lib/endpoints';
import { useToast } from '@/providers/ToastProvider';
import {
  peso,
  pesoCompact,
  num,
  longDate,
  quotaTone,
  paymentLabel,
} from '@/lib/format';
import { Avatar, Button, Card, Chip, Field, Modal, Progress, State, Tabs } from '@/components/ui';
import { DonutWithLegend } from '@/components/ui/Charts';
import { IconCheck, IconDownload, IconWarning } from '@/components/ui/Icons';
import AnalyticsReports from './analytics';

/** The Reports screen hosts two tools: the shift X-Read and the Reporting Engine. */
const VIEWS = [
  { key: 'xread', label: 'Shift X-Read' },
  { key: 'analytics', label: 'Analytics Reports' },
];

export default function ReportsPage() {
  const [view, setView] = useState('xread');

  return (
    <div className="grid" style={{ gap: 16 }}>
      <Tabs tabs={VIEWS} active={view} onChange={setView} />
      {view === 'xread' ? <ShiftXRead /> : <AnalyticsReports />}
    </div>
  );
}

/** End-of-shift X-Read: cash drawer, per-employee sales, payment mix. */
function ShiftXRead() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => reportApi.daily(), []);
  const [counting, setCounting] = useState(false);

  if (loading) {
    return (
      <div className="state">
        <span className="spinner spinner--dark" />
        <div>Building the shift report…</div>
      </div>
    );
  }

  if (error) {
    return (
      <State
        title="Could not load the report"
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

  const { shift, headline, reconciliation: rec, paymentBreakdown, perEmployee, totals } = data;

  const exportCsv = async (kind) => {
    try {
      await downloadCsv(`/reports/export/${kind}.csv`, `aquapure-${kind}.csv`);
      toast.success('Export downloaded');
    } catch (err) {
      toast.error('Export failed', err.message);
    }
  };

  const slices = paymentBreakdown.map((m) => ({
    label: paymentLabel(m.method),
    value: m.amount,
    percent: m.percent,
  }));

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* ------------------------------------------------ X-Read hero */}
      <div className="hero">
        <div>
          <div className="hero__eyebrow">End-of-Shift Report</div>
          <div className="hero__title">
            {shift?.label || `${shift?.name || 'Day'} Shift X-Read`}
          </div>
          <div className="hero__meta">
            {shift
              ? `${longDate(shift.startTime || data.date)} · ${shift.window} · Operator: ${shift.operator}`
              : 'No shift recorded for today'}
          </div>
        </div>

        <div className="hero__actions">
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <IconDownload size={15} /> Export PDF
          </Button>
          <Button variant="ghost" size="sm" onClick={() => exportCsv('orders')}>
            <IconDownload size={15} /> Export CSV
          </Button>
          {shift && !rec.reconciled && (
            <Button variant="action" size="sm" onClick={() => setCounting(true)}>
              Count cash drawer
            </Button>
          )}
        </div>

        <div className="hero__stats">
          <div className="hero__stat">
            <div className="hero__stat-label">Gross Revenue</div>
            <div className="hero__stat-value">{peso(headline.grossRevenue)}</div>
          </div>
          <div className="hero__stat">
            <div className="hero__stat-label">Total Transactions</div>
            <div className="hero__stat-value">{num(headline.totalTransactions)}</div>
          </div>
          <div className="hero__stat">
            <div className="hero__stat-label">Units Refilled</div>
            <div className="hero__stat-value">{num(headline.unitsRefilled)} gal</div>
          </div>
          <div className="hero__stat">
            <div className="hero__stat-label">Containers Returned</div>
            <div className="hero__stat-value">{num(headline.containersReturned)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid--main">
        {/* ------------------------------------------- reconciliation */}
        <div className="grid" style={{ gap: 16 }}>
          <Card title="Cash Drawer Reconciliation" flush>
            <div className="drawer-row">
              <div>
                <div className="drawer-row__label">Opening Float</div>
                <div className="drawer-row__hint">Starting cash</div>
              </div>
              <div className="drawer-row__val">{peso(rec.openingFloat)}</div>
            </div>

            <div className="drawer-row">
              <div>
                <div className="drawer-row__label">Cash Sales</div>
                <div className="drawer-row__hint">{rec.cashCount} cash transactions</div>
              </div>
              <div className="drawer-row__val">{peso(rec.cashSales)}</div>
            </div>

            <div className="drawer-row">
              <div>
                <div className="drawer-row__label">Cash Refunds</div>
                <div className="drawer-row__hint">
                  {rec.cashRefunds ? 'Refunds issued' : 'No refunds'}
                </div>
              </div>
              <div className={`drawer-row__val ${rec.cashRefunds ? 'drawer-row--neg' : ''}`}>
                {rec.cashRefunds ? `−${peso(rec.cashRefunds)}` : peso(0)}
              </div>
            </div>

            <div className="drawer-row drawer-row--expected">
              <div className="drawer-row__label">Expected in Drawer</div>
              <div className="drawer-row__val">{peso(rec.expectedCash)}</div>
            </div>

            <div className="drawer-row">
              <div>
                <div className="drawer-row__label">Actual Cash Counted</div>
                <div className="drawer-row__hint">
                  {rec.countedBy ? `Counted by ${rec.countedBy}` : 'Not counted yet'}
                </div>
              </div>
              <div className="drawer-row__val">{peso(rec.actualCash)}</div>
            </div>

            <div
              className={`banner-ok ${
                rec.reconciled && Math.abs(rec.variance) >= 0.01 ? 'banner-warn' : ''
              }`}
            >
              {rec.reconciled && Math.abs(rec.variance) < 0.01 ? (
                <IconCheck size={18} />
              ) : (
                <IconWarning size={18} />
              )}
              {rec.reconciled
                ? Math.abs(rec.variance) < 0.01
                  ? 'Cash Balanced'
                  : 'Variance detected'
                : 'Awaiting cash count'}
              <span className="banner-ok__var">{peso(rec.variance)} Variance</span>
            </div>
          </Card>


          {/* --------------------------------------- per-employee table */}
          <Card
            title="Per-Employee Sales Summary"
            actions={
              <Button variant="soft" size="sm" onClick={() => exportCsv('employees')}>
                <IconDownload size={14} /> CSV
              </Button>
            }
            flush
          >
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th className="num">Units</th>
                    <th className="num">Revenue</th>
                    <th className="num">Commission</th>
                    <th>Quota Progress</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {perEmployee.length === 0 ? (
                    <tr>
                      <td colSpan={6}>
                        <State title="No staff sales today" />
                      </td>
                    </tr>
                  ) : (
                    perEmployee.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <Avatar name={e.name} size="sm" />
                            <span className="table__name">{e.name}</span>
                          </div>
                        </td>
                        <td className="num">{num(Math.round(e.units))}</td>
                        <td className="num">{peso(e.revenue, 0)}</td>
                        <td className="num" style={{ color: 'var(--success)', fontWeight: 700 }}>
                          {peso(e.commission)}
                        </td>
                        <td style={{ minWidth: 160 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                            <div style={{ flex: 1 }}>
                              <Progress value={e.progress} tone={quotaTone(e.status)} />
                            </div>
                            <span
                              className="table__muted"
                              style={{ width: 36, textAlign: 'right' }}
                            >
                              {e.progress}%
                            </span>
                          </div>
                        </td>
                        <td>
                          <Chip tone={quotaTone(e.status)}>{e.status}</Chip>
                        </td>
                      </tr>
                    ))
                  )}
                  <tr style={{ background: 'var(--surface-2)', fontWeight: 800 }}>
                    <td>Totals</td>
                    <td className="num">{num(totals.units)}</td>
                    <td className="num">{peso(totals.revenue, 0)}</td>
                    <td className="num" style={{ color: 'var(--success)' }}>
                      {peso(totals.commission)}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* ------------------------------------------- payment mix */}
        <Card title="Payment Method Breakdown" flush>
          {slices.length === 0 ? (
            <State title="No sales yet" message="Payment mix appears once sales are recorded." />
          ) : (
            <DonutWithLegend
              slices={slices}
              centerValue={pesoCompact(headline.grossRevenue)}
              centerLabel="Total"
              formatValue={(v) => peso(v, 0)}
            />
          )}
        </Card>
      </div>

      <CountCashModal
        open={counting}
        expected={rec.expectedCash}
        onClose={() => setCounting(false)}
        onSaved={() => {
          setCounting(false);
          reload();
          toast.success('Cash drawer reconciled');
        }}
      />
    </div>
  );
}


/** Record the physical cash count against the active shift. */
function CountCashModal({ open, expected, onClose, onSaved }) {
  const { data: shiftData } = useFetch(() => reportApi.activeShift(), [], { skip: !open });
  const [amount, setAmount] = useState('');
  const [countedBy, setCountedBy] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const value = Number(amount);
  const valid = amount !== '' && Number.isFinite(value) && value >= 0;
  const variance = valid ? Math.round((value - expected) * 100) / 100 : 0;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await reportApi.reconcile(shiftData._id, { actualCash: value, countedBy: countedBy || undefined });
      setAmount('');
      setCountedBy('');
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Count the cash drawer"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="action" loading={busy} disabled={!valid || !shiftData} onClick={save}>
            Save count
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
        <span>Expected in drawer</span>
        <strong>{peso(expected)}</strong>
      </div>

      <Field label="Actual cash counted (₱)">
        <input
          className="input input--mono"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          autoFocus
        />
      </Field>

      <Field label="Counted by">
        <input
          className="input"
          value={countedBy}
          onChange={(e) => setCountedBy(e.target.value)}
          placeholder="Your name"
        />
      </Field>

      {valid && (
        <div
          className={`banner-ok ${Math.abs(variance) >= 0.01 ? 'banner-warn' : ''}`}
          style={{ margin: '18px 0 0' }}
        >
          {Math.abs(variance) < 0.01 ? <IconCheck size={18} /> : <IconWarning size={18} />}
          {Math.abs(variance) < 0.01 ? 'Drawer balances' : 'Variance detected'}
          <span className="banner-ok__var">{peso(variance)}</span>
        </div>
      )}
    </Modal>
  );
}

