const Container = require('../models/Container');
const Customer = require('../models/Customer');
const ApiError = require('../utils/ApiError');
const { CONTAINER_STATUS, CONTAINER_STATUS_LABELS } = require('../config/constants');
const { nextContainerId } = require('../models/Counter');
const { startOfDay } = require('../utils/helpers');

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildFilter({ status, size, customer, search } = {}) {
  const filter = {};
  if (status) filter.status = status;
  if (size) filter.size = size;
  if (customer) filter.customer = customer;
  if (search) {
    const rx = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ code: rx }, { customerName: rx }];
  }
  return filter;
}

async function list(query) {
  return Container.find(buildFilter(query)).sort({ status: 1, code: 1 }).lean();
}

async function getById(id) {
  const container = await Container.findById(id).populate('customer', 'name phone type');
  if (!container) throw ApiError.notFound('Container not found');
  return container;
}

async function create(payload) {
  const code = (payload.code || (await nextContainerId())).toUpperCase();
  if (await Container.exists({ code })) {
    throw ApiError.conflict(`Container "${code}" already exists`);
  }

  const customer = payload.customer
    ? await Customer.findById(payload.customer)
    : null;
  if (payload.customer && !customer) throw ApiError.notFound('Customer not found');

  const container = await Container.create({
    ...payload,
    code,
    customerName: customer?.name,
    issuedAt: payload.status === CONTAINER_STATUS.WITH_CUSTOMER ? new Date() : null,
  });
  return container;
}

async function update(id, payload) {
  const container = await Container.findById(id);
  if (!container) throw ApiError.notFound('Container not found');

  if (payload.customer) {
    const customer = await Customer.findById(payload.customer);
    if (!customer) throw ApiError.notFound('Customer not found');
    container.customerName = customer.name;
  }
  Object.assign(container, payload);
  await container.save();
  return container;
}

async function remove(id) {
  const container = await Container.findByIdAndDelete(id);
  if (!container) throw ApiError.notFound('Container not found');
  return { id };
}

/**
 * Marks containers as returned to the station.
 * Handles a write-off by recording `condition` and moving to `damaged`.
 */
async function returnContainers(ids, { condition, asDamaged = false } = {}) {
  const now = new Date();
  const update = {
    status: asDamaged ? CONTAINER_STATUS.DAMAGED : CONTAINER_STATUS.IN_STATION,
    customer: null,
    customerName: null,
    returnedAt: now,
  };
  if (condition) update.condition = condition;

  const result = await Container.updateMany({ _id: { $in: ids } }, update);
  return { returned: result.modifiedCount, ids };
}

/** Pulls `n` idle containers out of the station for a customer. */
async function issueContainers(n, customer, order, { session } = {}) {
  if (n <= 0) return [];
  const opts = session ? { session } : {};

  const containers = await Container.find({ status: CONTAINER_STATUS.IN_STATION })
    .session(session)
    .limit(n);

  if (containers.length < n) {
    throw ApiError.conflict(
      `Not enough containers in station. Need ${n}, only ${containers.length} available.`,
    );
  }

  await Container.updateMany(
    { _id: { $in: containers.map((c) => c._id) } },
    {
      status: CONTAINER_STATUS.WITH_CUSTOMER,
      customer: customer?._id,
      customerName: customer?.name,
      issuedAt: new Date(),
      returnedAt: null,
      lastOrder: order,
    },
    opts,
  );
  return containers;
}

/** Counts for the Container Asset Tracker cards. */
async function summary() {
  const rows = await Container.aggregate([
    { $group: { _id: '$status', count: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const inStation = counts[CONTAINER_STATUS.IN_STATION] || 0;
  const withCustomer = counts[CONTAINER_STATUS.WITH_CUSTOMER] || 0;
  const damaged = counts[CONTAINER_STATUS.DAMAGED] || 0;

  const returnedToday = await Container.countDocuments({
    returnedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
  });

  return {
    inStation,
    withCustomer,
    damaged,
    total: inStation + withCustomer + damaged,
    returnedToday,
    labels: CONTAINER_STATUS_LABELS,
  };
}

/**
 * Splits unreturned containers into "with regular customers" vs "with new
 * customers" (a customer who has only ever had one order), and counts how
 * many went out today.
 */
async function outstandingBreakdown() {
  const [withCustomer, issuedToday] = await Promise.all([
    Container.aggregate([
      { $match: { status: CONTAINER_STATUS.WITH_CUSTOMER } },
      {
        $group: {
          _id: '$customer',
          count: { $sum: 1 },
          orders: { $addToSet: '$lastOrder' },
        },
      },
    ]),
    Container.countDocuments({
      status: CONTAINER_STATUS.WITH_CUSTOMER,
      issuedAt: { $gte: startOfDay() },
    }),
  ]);

  // "Regular" = has received a container more than once.
  const regular = withCustomer
    .filter((c) => c.orders.filter(Boolean).length > 1)
    .reduce((s, c) => s + c.count, 0);
  const total = withCustomer.reduce((s, c) => s + c.count, 0);

  return { regular, newCustomers: total - regular, total, newToday: issuedToday };
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
  returnContainers,
  issueContainers,
  summary,
  outstandingBreakdown,
};
