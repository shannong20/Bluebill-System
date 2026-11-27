'use client';

import { useRouter } from 'next/navigation';
import { useFetch } from '@/hooks/useFetch';
import { containerApi, dashboardApi } from '@/lib/endpoints';
import { useToast } from '@/providers/ToastProvider';
import {
  peso,
  pesoShort,
  num,
  deltaText,
  deltaTone,
  quotaTone,
  paymentLabel,
  time,
  roleLabel,
} from '@/lib/format';
import { Avatar, Button, Card, Chip, Kpi, Progress, State } from '@/components/ui';
import {
  IconContainer,
  IconTruck,
  IconWarning,
} from '@/components/ui/Icons';

/** Renders the "Stock Alerts" banner from the design. */
function StockAlerts({ alerts }) {
  if (!alerts?.length) return null;
  return (
    <div className="alert-banner">
      <span className="alert-banner__icon">
        <IconWarning size={15} style={{ color: '#fff' }} />
      </span>
      <div style={{ flex: 1 }}>
        <div className="alert-banner__title">Stock Alerts</div>
        <div className="alert-banner__list">
          {alerts.map((a) => (
            <span className="alert-banner__item" key={a._id}>
              {a.status === 'Critical' ? '●' : '△'} {a.name}:{' '}
              <strong>
                {a.status === 'Critical'
                  ? `critically low (${a.stockLevel} units)`
                  : a.daysRemaining != null
                    ? `needs replacement in ~${a.daysRemaining} days`
                    : `only ${a.stockLevel} remaining (reorder point: ${a.reorderPoint})`}
              </strong>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => dashboardApi.summary(), []);
  const { data: containerList, reload: reloadContainers } = useFetch(
    () => containerApi.list({ status: 'with_customer' }),
    [],
  );

  if (loading) {
    return (
      <div className="state">
        <span className="spinner spinner--dark" />
        <div>Loading dashboard…</div>
      </div>
    );
  }

  if (error) {
    return (
      <State
        icon={<IconWarning size={34} style={{ color: 'var(--danger)' }} />}
        title="Could not load the dashboard"
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

  const { kpis, quotaProgress, containers, recentOrders, stockAlerts } = data;

  const revenueSplit = [
    ['Walk-in', kpis.revenue.walkIn],
    ['Delivery', kpis.revenue.delivery],
  ].filter(([, v]) => v > 0);

  const receiveContainers = async () => {
    const ids = (containerList || []).map((c) => c._id);
    if (!ids.length) {
      toast.info('Nothing to receive', 'No containers are currently out with customers.');
      return;
    }
    try {
      const res = await containerApi.returnMany(ids);
      toast.success(`Received ${res.data.returned} containers`);
      reload();
      reloadContainers();
    } catch (err) {
      toast.error('Receive failed', err.message);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      <StockAlerts alerts={stockAlerts} />

      {/* ------------------------------------------------ KPI row */}
      <div className="grid grid--kpi">
        <Kpi
          label="Today's Revenue"
          chip={
            kpis.revenue.delta !== null && (
              <Chip tone={deltaTone(kpis.revenue.delta)}>
                ↑ {deltaText(kpis.revenue.delta, '%')} {kpis.revenue.deltaLabel}
              </Chip>
            )
          }
          value={pesoShort(kpis.revenue.value)}
          foot={revenueSplit.map(([l, v]) => `${l} ${pesoShort(v)}`).join(' · ') || '—'}
        />

        <Kpi
          label="Units Refilled Today"
          chip={
            kpis.unitsRefilled.delta !== null && (
              <Chip tone={deltaTone(kpis.unitsRefilled.delta)}>
                ↑ {deltaText(kpis.unitsRefilled.delta, '%')} {kpis.unitsRefilled.deltaLabel}
              </Chip>
            )
          }
          value={`${num(kpis.unitsRefilled.value)} / ${num(kpis.unitsRefilled.target)}`}
          foot={`${kpis.unitsRefilled.targetPercent}% of daily target reached`}
        >
          <div style={{ marginTop: 8 }}>
            <Progress value={kpis.unitsRefilled.targetPercent} tone="info" />
          </div>
        </Kpi>

        <Kpi
          label="Unreturned Containers"
          chip={
            kpis.unreturned.newToday > 0 && (
              <Chip tone="danger">↓ {kpis.unreturned.newToday} new today</Chip>
            )
          }
          value={num(kpis.unreturned.value)}
          foot={`${kpis.unreturned.regular} with regular, ${kpis.unreturned.newCustomers} with new customers`}
        />

        <Kpi
          label="Top Employee"
          value={kpis.topEmployee?.name || '—'}
          foot={
            kpis.topEmployee
              ? `${roleLabel(kpis.topEmployee.role)} · ${num(kpis.topEmployee.units)} gallons · ${kpis.topEmployee.status}`
              : 'No activity yet today'
          }
        />
      </div>

      {/* ------------------------------------------------ Quota + side rail */}
      <div className="grid grid--main">
        <Card
          title="Employee Quota Progress"
          sub={`${data.shift?.name || 'Today'} shift · ${num(quotaProgress.achieved)} / ${num(quotaProgress.target)} gal`}
          actions={<Chip tone="info">{quotaProgress.percent}% overall</Chip>}
          flush
        >
          {quotaProgress.staff.length === 0 ? (
            <State title="No active staff" message="Add employees to track daily quotas." />
          ) : (
            quotaProgress.staff.map((e) => (
              <div className="quota-row" key={e.id}>
                <Avatar name={e.name} size="sm" />
                <div>
                  <span className="quota-row__name">{e.name}</span>
                  <span className="quota-row__role">{roleLabel(e.role)}</span>
                </div>
                <div className="quota-row__meter">
                  <span className="quota-row__gal">
                    {num(Math.round(e.achieved))}/{num(e.quotaTarget)} gal
                  </span>
                  <div style={{ flex: 1 }}>
                    <Progress value={e.progress} tone={quotaTone(e.status)} />
                  </div>
                  <span className="quota-row__pct">{e.progress}%</span>
                  <Chip tone={quotaTone(e.status)}>{e.status}</Chip>
                </div>
              </div>
            ))
          )}
        </Card>

        <div className="grid" style={{ gap: 16 }}>
          <Card title="Quick Actions" flush>
            <div className="card__body quick-actions">
              <Button
                variant="primary"
                size="lg"
                onClick={() => router.push('/point-of-sale')}
              >
                ＋ New Walk-in Sale
              </Button>
              <Button variant="action" size="lg" onClick={() => router.push('/point-of-sale')}>
                <IconTruck size={17} /> Dispatch Delivery
              </Button>
              <Button variant="ghost" size="lg" onClick={receiveContainers}>
                <IconContainer size={17} /> Receive Empty Containers
              </Button>
            </div>
          </Card>

          <Card title="Container Assets" flush>
            <div className="card__body">
              <div className="asset-cards">
                <div className="asset asset--success">
                  <div className="asset__num">{containers.inStation}</div>
                  <div className="asset__label">In Station</div>
                  <div className="asset__hint">Ready for use</div>
                </div>
                <div className="asset asset--warning">
                  <div className="asset__num">{containers.withCustomer}</div>
                  <div className="asset__label">With Customers</div>
                  <div className="asset__hint">Awaiting return</div>
                </div>
                <div className="asset asset--danger">
                  <div className="asset__num">{containers.damaged}</div>
                  <div className="asset__label">Damaged / Scrapped</div>
                  <div className="asset__hint">Write-off queue</div>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div className="asset-row">
                  <span className="dot" style={{ background: 'var(--success)' }} />
                  In Station (Ready)
                  <span className="asset-row__num">{containers.inStation}</span>
                </div>
                <div className="asset-row">
                  <span className="dot" style={{ background: 'var(--warning)' }} />
                  Out with Customers
                  <span className="asset-row__num">{containers.withCustomer}</span>
                </div>
                <div className="asset-row">
                  <span className="dot" style={{ background: 'var(--danger)' }} />
                  Damaged / Scrapped
                  <span className="asset-row__num">{containers.damaged}</span>
                </div>
                <div className="asset-row asset-row__total">
                  Total
                  <span className="asset-row__num">{containers.total}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>



      {/* ------------------------------------------------ Recent transactions */}
      <Card
        title="Recent Transactions"
        sub={`Today · ${num(data.transactionCount)} transactions`}
        actions={
          <Button variant="soft" size="sm" onClick={() => router.push('/reports')}>
            View report
          </Button>
        }
        flush
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Items</th>
                <th className="num">Total</th>
                <th>Method</th>
                <th>Staff</th>
                <th className="num">Time</th>
              </tr>
            </thead>
            <tbody>
              {recentOrders.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <State title="No transactions yet" message="Sales will appear here." />
                  </td>
                </tr>
              ) : (
                recentOrders.map((o) => (
                  <tr key={o.id}>
                    <td style={{ color: 'var(--action)', fontWeight: 700 }}>{o.orderId}</td>
                    <td>{o.customerName}</td>
                    <td className="table__muted">{o.items}</td>
                    <td className="num" style={{ fontWeight: 700 }}>{peso(o.total, 0)}</td>
                    <td>
                      <Chip tone={o.paymentMethod === 'cash' ? 'neutral' : 'info'}>
                        {paymentLabel(o.paymentMethod)}
                      </Chip>
                    </td>
                    <td className="table__muted">{o.staffName || '—'}</td>
                    <td className="num table__muted">{time(o.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
