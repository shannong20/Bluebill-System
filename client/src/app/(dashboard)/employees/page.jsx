'use client';

import { useCallback, useEffect, useState } from 'react';
import { useFetch } from '@/hooks/useFetch';
import { employeeApi } from '@/lib/endpoints';
import { useToast } from '@/providers/ToastProvider';
import { peso, num, quotaTone, roleLabel } from '@/lib/format';
import {
  Avatar,
  Button,
  Card,
  Chip,
  ConfirmModal,
  Field,
  Kpi,
  Modal,
  Progress,
  State,
} from '@/components/ui';
import { Ring } from '@/components/ui/Charts';
import {
  IconArchive,
  IconEdit,
  IconPlus,
  IconTrash,
  IconUndo,
} from '@/components/ui/Icons';

const ROLES = ['clerk', 'driver', 'operator', 'admin'];
const STATUSES = ['active', 'inactive', 'on_leave'];

/** Sentinel for "the Add Employee form is open" — distinct from editing one. */
const NEW = Symbol('new-employee');

export default function EmployeesPage() {
  const toast = useToast();
  const [settingTargets, setSettingTargets] = useState(false);
  // Holds the employee being edited, or `NEW` when the Add form is open.
  const [editing, setEditing] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  // Employee pending archive / permanent-delete confirmation.
  const [confirming, setConfirming] = useState(null);

  const { data, loading, error, reload } = useFetch(() => employeeApi.performance(), []);
  // Archived staff get their own call so the KPI payload keeps its shape.
  const { data: archived, reload: reloadArchived } = useFetch(
    () => (showArchived ? employeeApi.list({ archived: true }) : Promise.resolve(null)),
    [showArchived],
  );

  const refresh = useCallback(() => {
    reload();
    reloadArchived();
  }, [reload, reloadArchived]);

  if (loading) {
    return (
      <div className="state">
        <span className="spinner spinner--dark" />
        <div>Loading staff performance…</div>
      </div>
    );
  }

  if (error) {
    return (
      <State
        title="Could not load employees"
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

  const { staff, kpis } = data;
  const active = staff.filter((s) => s.status === 'active');
  const archivedList = archived || [];
  const archivedCount = kpis.archivedCount ?? archivedList.length;

  const archiveEmployee = async (employee) => {
    try {
      await employeeApi.archive(employee._id);
      toast.success(`${employee.name} archived`);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConfirming(null);
    }
  };

  const restoreEmployee = async (employee) => {
    try {
      await employeeApi.restore(employee._id);
      toast.success(`${employee.name} restored`);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const deleteForever = async (employee) => {
    try {
      await employeeApi.remove(employee._id);
      toast.success(`${employee.name} permanently deleted`);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setConfirming(null);
    }
  };

  return (
    <div className="grid" style={{ gap: 16 }}>
      {/* ------------------------------------------------ KPI row */}
      <div className="grid grid--kpi">
        <Kpi
          label="Active Staff Today"
          value={num(kpis.activeStaff)}
          foot={`${kpis.byRole.clerk} clerks · ${kpis.byRole.driver} drivers · ${kpis.byRole.operator} operator`}
        />
        <Kpi
          label="Quotas Met"
          value={`${kpis.quotasMet} / ${kpis.activeStaff}`}
          chip={kpis.quotasMet > 0 && <Chip tone="success">{kpis.quotaNames.join(', ')}</Chip>}
          foot="Staff at 100% of target"
        />
        <Kpi
          label="Total Units Delivered"
          value={`${num(kpis.totalUnits)} gal`}
          foot="Across all staff"
        />
        <Kpi
          label="Total Commissions"
          value={peso(kpis.totalCommission)}
          foot="Earned this shift"
        />
      </div>

      {/* ------------------------------------------------ Quota table */}
      <Card
        title="Daily Quota & Performance"
        sub={`${active[0]?.shift || 'Morning'} shift · ${new Date(data.date).toLocaleDateString('en-CA')}`}
        actions={
          <div className="actions__row">
            <Button variant="action" size="sm" onClick={() => setEditing(NEW)}>
              <IconPlus size={14} /> Add Employee
            </Button>
            <Button
              variant="action"
              size="sm"
              disabled={!staff.length}
              onClick={() => setSettingTargets(true)}
            >
              <IconEdit size={14} /> Set Targets
            </Button>
          </div>
        }
        flush
      >
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Employee</th>
                <th>Role</th>
                <th className="num">Target</th>
                <th className="num">Achieved</th>
                <th>Progress</th>
                <th className="num">Revenue</th>
                <th className="num">Commission</th>
                <th>Status</th>
                <th className="actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {active.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <State
                      title="No active staff"
                      message="Add employees to track quotas."
                      action={
                        <Button variant="action" onClick={() => setEditing(NEW)}>
                          <IconPlus size={14} /> Add Employee
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                active.map((e) => (
                  <tr key={e._id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <Avatar name={e.name} size="sm" />
                        <span className="table__name">{e.name}</span>
                      </div>
                    </td>
                    <td>
                      <Chip tone="neutral">{roleLabel(e.role)}</Chip>
                    </td>
                    <td className="num">{num(e.quotaTarget)} gal</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {num(Math.round(e.achieved))} gal
                    </td>
                    <td style={{ minWidth: 150 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <div style={{ flex: 1 }}>
                          <Progress value={e.progress} tone={quotaTone(e.performanceStatus)} />
                        </div>
                        <span className="table__muted" style={{ width: 36, textAlign: 'right' }}>
                          {e.progress}%
                        </span>
                      </div>
                    </td>
                    <td className="num">{peso(e.revenue, 0)}</td>
                    <td className="num" style={{ color: 'var(--success)', fontWeight: 700 }}>
                      {peso(e.commission)}
                    </td>
                    <td>
                      <Chip tone={quotaTone(e.performanceStatus)}>{e.performanceStatus}</Chip>
                    </td>
                    <td className="actions">
                      <div className="actions__row">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditing(e)}
                          aria-label={`Edit ${e.name}`}
                        >
                          <IconEdit size={13} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirming({ type: 'archive', employee: e })}
                          aria-label={`Archive ${e.name}`}
                        >
                          <IconArchive size={13} />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ------------------------------------------------ Archived staff */}
      <Card
        title="Archived Staff"
        sub={`${archivedCount} ${archivedCount === 1 ? 'person' : 'people'} off the roster`}
        actions={
          <Button size="sm" onClick={() => setShowArchived((v) => !v)}>
            <IconArchive size={13} />
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>
        }
        flush
      >
        {showArchived ? (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Archived</th>
                  <th className="actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {archivedList.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <State
                        title="No archived staff"
                        message="Employees you archive appear here so you can restore them."
                      />
                    </td>
                  </tr>
                ) : (
                  archivedList.map((e) => (
                    <tr key={e._id}>
                      <td>
                        <div className="cell-user">
                          <Avatar name={e.name} size="sm" />
                          <div>
                            <div className="cell-user__name">{e.name}</div>
                            {e.phone && <div className="cell-user__sub">{e.phone}</div>}
                          </div>
                        </div>
                      </td>
                      <td>
                        <Chip>{roleLabel(e.role)}</Chip>
                      </td>
                      <td>
                        <Chip tone="muted">{String(e.status).replace('_', ' ')}</Chip>
                      </td>
                      <td>
                        {e.archivedAt ? new Date(e.archivedAt).toLocaleDateString('en-CA') : '—'}
                      </td>
                      <td className="actions">
                        <div className="actions__row">
                          <Button variant="ghost" size="sm" onClick={() => restoreEmployee(e)}>
                            <IconUndo size={13} /> Restore
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setConfirming({ type: 'delete', employee: e })}
                            aria-label={`Delete ${e.name} permanently`}
                          >
                            <IconTrash size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <State
            title="Archived staff hidden"
            message="Archived employees are excluded from quotas and KPIs."
          />
        )}
      </Card>

      {/* ------------------------------------------------ Quota rings */}
      <Card title="Quota Completion at a Glance" flush>
        <div className="rings">
          {active.length === 0 ? (
            <State title="Nothing to show" />
          ) : (
            active.map((e) => (
              <div className="ring" key={e._id}>
                <Ring value={e.progress} tone={quotaTone(e.performanceStatus)} />
                <div className="ring__name">{e.name.split(' ')[0]}</div>
                <div className="ring__meta">
                  {num(Math.round(e.achieved))}/{num(e.quotaTarget)}
                </div>
              </div>
            ))
          )}
        </div>
      </Card>

      <TargetsModal
        open={settingTargets}
        staff={active}
        onClose={() => setSettingTargets(false)}
        onSaved={() => {
          setSettingTargets(false);
          reload();
          toast.success('Quota targets updated');
        }}
      />

      <EmployeeModal
        employee={editing === NEW ? null : editing}
        isNew={editing === NEW}
        onClose={() => setEditing(null)}
        onSaved={(name, wasNew) => {
          setEditing(null);
          refresh();
          toast.success(wasNew ? `${name} added` : `${name} updated`);
        }}
      />

      <ConfirmModal
        open={confirming?.type === 'archive'}
        title="Archive employee"
        confirmLabel="Archive"
        body={
          confirming?.type === 'archive' ? (
            <>
              Archive <strong>{confirming.employee.name}</strong>? They are removed from the
              roster, the quota table and the KPIs. Their past sales and commission history is
              kept, and you can restore them at any time.
            </>
          ) : null
        }
        onCancel={() => setConfirming(null)}
        onConfirm={() => archiveEmployee(confirming.employee)}
      />

      <ConfirmModal
        open={confirming?.type === 'delete'}
        title="Delete permanently"
        confirmLabel="Delete forever"
        danger
        body={
          confirming?.type === 'delete' ? (
            <>
              This permanently deletes <strong>{confirming.employee.name}</strong> and cannot
              be undone. Consider archiving instead.
            </>
          ) : null
        }
        onCancel={() => setConfirming(null)}
        onConfirm={() => deleteForever(confirming.employee)}
      />
    </div>
  );
}


/**
 * Bulk "Set Targets" dialog.
 *
 * `open` must come from the parent: the dialog stays mounted so its inputs
 * survive, and without the explicit flag it would render on page load.
 */
function TargetsModal({ open, staff, onClose, onSaved }) {
  const [targets, setTargets] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Re-seed the inputs from the roster each time the dialog opens.
  useEffect(() => {
    if (!open || !staff?.length) return;
    setTargets(Object.fromEntries(staff.map((s) => [s._id, s.quotaTarget])));
    setError(null);
  }, [open, staff]);

  if (!open || !staff?.length) return null;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await employeeApi.setTargets(
        staff.map((s) => ({ employee: s._id, quotaTarget: Number(targets[s._id]) || 0 })),
      );
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
      title="Set daily quota targets"
      wide
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="action" loading={busy} onClick={save}>
            Save targets
          </Button>
        </>
      }
    >
      {error && <div className="error-box">{error}</div>}
      <div style={{ display: 'grid', gap: 12 }}>
        {staff.map((s) => (
          <div
            key={s._id}
            style={{ display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <Avatar name={s.name} size="sm" />
            <div style={{ flex: 1 }}>
              <div className="table__name">{s.name}</div>
              <div className="table__muted">
                {roleLabel(s.role)} · {num(Math.round(s.achieved))} gal achieved
              </div>
            </div>
            <input
              className="input input--mono"
              style={{ width: 110 }}
              type="number"
              min="0"
              value={targets[s._id] ?? 0}
              onChange={(e) =>
                setTargets((t) => ({ ...t, [s._id]: e.target.value }))
              }
              aria-label={`Quota target for ${s.name}`}
            />
            <span className="table__muted" style={{ width: 34 }}>
              gal
            </span>
          </div>
        ))}
      </div>
    </Modal>
  );
}

/**
 * Add or edit an employee. `isNew` switches between POST and PUT and swaps
 * the copy; every field is shared between both modes.
 */
function EmployeeModal({ employee, isNew, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isNew) {
      setForm({
        name: '',
        role: 'clerk',
        status: 'active',
        phone: '',
        quotaTarget: 20,
        commissionRate: 5,
        shift: 'Morning',
      });
      setError(null);
    } else if (employee) {
      setForm({
        name: employee.name,
        role: employee.role,
        status: employee.status,
        phone: employee.phone || '',
        quotaTarget: employee.quotaTarget,
        commissionRate: employee.commissionRate,
        shift: employee.shift || 'Morning',
      });
      setError(null);
    }
  }, [employee, isNew]);

  if (!isNew && !employee) return null;

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name,
      role: form.role,
      status: form.status,
      phone: form.phone || undefined,
      quotaTarget: Number(form.quotaTarget) || 0,
      commissionRate: Number(form.commissionRate) || 0,
      shift: form.shift,
    };
    try {
      if (isNew) {
        await employeeApi.create(payload);
      } else {
        await employeeApi.update(employee._id, payload);
      }
      onSaved(form.name, isNew);
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
      title={isNew ? 'Add employee' : `Edit — ${employee.name}`}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="action" loading={busy} onClick={save}>
            {isNew ? 'Add employee' : 'Save changes'}
          </Button>
        </>
      }
    >
      {error && <div className="error-box">{error}</div>}

      <Field label="Name">
        <input
          className="input"
          value={form.name || ''}
          onChange={set('name')}
          placeholder="e.g. Ana Cruz"
          autoFocus
        />
      </Field>

      <div style={{ marginTop: 18 }}>
        <Field label="Phone (optional)">
          <input
            className="input"
            value={form.phone || ''}
            onChange={set('phone')}
            placeholder="0917 000 0000"
          />
        </Field>
      </div>

      <div className="grid grid--2" style={{ marginTop: 18 }}>
        <Field label="Role">
          <select className="select" value={form.role} onChange={set('role')}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select className="select" value={form.status} onChange={set('status')}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid--2" style={{ marginTop: 18 }}>
        <Field label="Quota target (gal)">
          <input
            className="input input--mono"
            type="number"
            min="0"
            value={form.quotaTarget}
            onChange={set('quotaTarget')}
          />
        </Field>
        <Field label="Commission rate (%)">
          <input
            className="input input--mono"
            type="number"
            min="0"
            max="100"
            step="0.5"
            value={form.commissionRate}
            onChange={set('commissionRate')}
          />
        </Field>
      </div>
    </Modal>
  );
}

