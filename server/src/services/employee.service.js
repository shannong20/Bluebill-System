const Employee = require('../models/Employee');
const Order = require('../models/Order');
const ApiError = require('../utils/ApiError');
const { EMPLOYEE_STATUS, ORDER_STATE, quotaStatus } = require('../config/constants');
const { round2, percent, startOfDay, daysAgo, initials } = require('../utils/helpers');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Scope helpers for the soft delete. `{ archivedAt: null }` also matches
 * documents written before the field existed, so legacy rows stay active.
 */
const ACTIVE = { archivedAt: null };
const ARCHIVED = { archivedAt: { $ne: null } };

function buildFilter({ role, status, search, date, archived } = {}) {
  // Archived staff are hidden unless `archived=true` is passed.
  const filter = archived ? { ...ARCHIVED } : { ...ACTIVE };
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (date) filter.date = date;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: rx }, { phone: rx }];
  }
  return filter;
}

/**
 * Staff roster enriched with the day rollup (defaults to today).
 *
 * `date` scopes the *figures* — revenue, units, commission — not the roster.
 * Filtering the roster by it would make staff disappear from the page on any
 * day other than the one stamped on their record, which is how the Employees
 * page and the POS staff picker both ended up empty.
 */
async function list(query = {}) {
  const day = query.date || startOfDay();
  // Strip `date` so the roster spans every active staff member.
  const { date, ...rosterQuery } = query;
  const filter = buildFilter(rosterQuery);

  const [employees, rollup] = await Promise.all([
    Employee.find(filter).sort({ role: 1, name: 1 }).lean(),
    revenueByEmployee(day),
  ]);

  return employees.map((e) => {
    const r = rollup.get(String(e._id)) || { revenue: 0, units: 0, orders: 0 };
    const progress = e.quotaTarget > 0 ? Math.min(100, percent(r.units, e.quotaTarget)) : 0;
    return {
      ...e,
      // Computed here rather than via a Mongoose virtual so the payload
      // is identical whether the document was loaded lean or not.
      initials: initials(e.name),
      revenue: r.revenue,
      orderCount: r.orders,
      achieved: r.units,
      progress,
      performanceStatus: quotaStatus(progress),
      commission:
        e.quotaTarget > 0 && r.units >= e.quotaTarget
          ? round2((r.revenue * e.commissionRate) / 100)
          : 0,
      isArchived: Boolean(e.archivedAt),
    };
  });
}

const getById = async (id) => {
  const employee = await Employee.findById(id).lean();
  if (!employee) throw ApiError.notFound('Employee not found');
  return {
    ...employee,
    initials: initials(employee.name),
    isArchived: Boolean(employee.archivedAt),
  };
}

/** Sets (or reassigns) an employee's active shift. */
async function activate(id) {
  const employee = await Employee.findById(id);
  if (!employee) throw ApiError.notFound('Employee not found');
  employee.status = 'active';
  await employee.save();
  return employee;
}

async function create(payload) {
  return new Employee(payload).save();
}

async function update(id, payload) {
  const employee = await Employee.findById(id);
  if (!employee) throw ApiError.notFound('Employee not found');
  Object.assign(employee, payload);
  await employee.save();
  return employee;
}

async function remove(id) {
  const employee = await Employee.findByIdAndDelete(id);
  if (!employee) throw ApiError.notFound('Employee not found');
  return { id };
}

/**
 * Soft-deletes an employee: they disappear from the roster, the KPI row and
 * the quota table, but past orders keep pointing at them so historical
 * revenue and commission figures stay correct.
 */
async function archive(id) {
  const employee = await Employee.findById(id);
  if (!employee) throw ApiError.notFound('Employee not found');
  if (employee.archivedAt) return employee.toJSON();

  employee.archivedAt = new Date();
  await employee.save();
  return employee.toJSON();
}

/** Undo of `archive` — the employee returns to the active roster. */
async function restore(id) {
  const employee = await Employee.findById(id);
  if (!employee) throw ApiError.notFound('Employee not found');
  if (!employee.archivedAt) return employee.toJSON();

  employee.archivedAt = null;
  await employee.save();
  return employee.toJSON();
}

/** Bulk quota update from the "Set Targets" button on the Employees page. */
async function setTargets(targets) {
  const ids = targets.map((t) => t.employee);
  // Scoped to active staff so an archived employee is reported as missing
  // rather than silently having a quota set behind the user's back.
  const found = await Employee.find({ _id: { $in: ids }, ...ACTIVE });
  const foundIds = new Set(found.map((e) => String(e._id)));

  const missing = ids.filter((id) => !foundIds.has(String(id)));
  if (missing.length) throw ApiError.notFound('One or more employees were not found');

  const byId = new Map(targets.map((t) => [String(t.employee), t.quotaTarget]));
  await Promise.all(
    found.map((e) => {
      e.quotaTarget = byId.get(String(e._id));
      return e.save();
    }),
  );
  return Employee.find({ _id: { $in: ids } })
    .lean()
    .then((docs) => docs.map((d) => ({ ...d, initials: initials(d.name) })));
}

/**
 * Recomputes revenue / units / orders per employee from the orders table.
 * This is the source of truth â€” the denormalised counters on the document
 * are a cache that can be rebuilt from here.
 */
async function revenueByEmployee(date = startOfDay()) {
  const day = startOfDay(date);
  const rows = await Order.aggregate([
    {
      $match: {
        status: ORDER_STATE.COMPLETED,
        createdAt: { $gte: day, $lt: new Date(day.getTime() + 24 * 60 * 60 * 1000) },
        'staff._id': { $ne: null },
      },
    },
    {
      $group: {
        _id: '$staff._id',
        revenue: { $sum: '$total' },
        orders: { $sum: 1 },
        units: {
          $sum: {
            $reduce: {
              input: '$items',
              initialValue: 0,
              in: { $add: ['$$value', { $multiply: ['$$this.gallons', '$$this.qty'] }] },
            },
          },
        },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), { ...r, revenue: round2(r.revenue) }]));
}

/** KPI row + quota ring data for the Employees page. */
async function performance({ date } = {}) {
  const day = date || startOfDay();
  // `list()` already scopes out archived staff, so every KPI below is
  // computed from active records only.
  const [staff, archivedCount] = await Promise.all([
    list({ date: day }),
    Employee.countDocuments(ARCHIVED),
  ]);

  const active = staff.filter((e) => e.status === 'active');
  const quotasMet = staff.filter((e) => e.progress >= 100);
  const totalUnits = active.reduce((s, e) => s + e.achieved, 0);
  const totalRevenue = active.reduce((s, e) => s + e.revenue, 0);
  const totalCommission = active.reduce((s, e) => s + e.commission, 0);

  const byRole = ['clerk', 'driver', 'operator'].reduce((acc, role) => {
    acc[role] = active.filter((e) => e.role === role).length;
    return acc;
  }, {});

  return {
    date: day,
    staff,
    kpis: {
      activeStaff: active.length,
      byRole,
      quotasMet: quotasMet.length,
      quotaNames: quotasMet.map((e) => e.name.split(' ')[0]),
      totalUnits,
      totalRevenue: round2(totalRevenue),
      totalCommission: round2(totalCommission),
      // Powers the "Show archived" badge on the Employees page.
      archivedCount,
    },
  };
}

/** Clears the daily counters so the next shift starts from zero. */
async function resetDailyMetrics(date = startOfDay()) {
  const result = await Employee.updateMany(
    { date, ...ACTIVE },
    { $set: { achieved: 0, revenue: 0, orderCount: 0 } },
  );
  return { reset: result.modifiedCount, date };
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  archive,
  restore,
  activate,
  setTargets,
  revenueByEmployee,
  performance,
  resetDailyMetrics,
  buildFilter,
  daysAgo,
};
