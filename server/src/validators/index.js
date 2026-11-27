const { z } = require('zod');
const {
  PRODUCT_CATEGORIES,
  INVENTORY_CATEGORIES,
  INVENTORY_UNITS,
  CONTAINER_SIZES,
  CONTAINER_STATUS,
  CUSTOMER_TYPES,
  PAYMENT_METHODS,
  CONTAINER_HANDLING,
  ORDER_STATUS,
  EMPLOYEE_ROLES,
  EMPLOYEE_STATUS,
  SHIFT_NAMES,
} = require('../config/constants');

const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid 24-character id');

/** Accepts an ObjectId, an empty string or null — for optional relations. */
const optionalObjectId = z
  .union([objectId, z.literal(''), z.null()])
  .optional()
  .transform((v) => (v === '' ? undefined : v));

/** `?flag=true` → boolean, used by the list endpoints. */
const boolQuery = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

/**
 * Boolean for request bodies. `z.coerce.boolean()` would turn the string
 * "false" into `true`, which is a nasty footgun for form/JSON payloads.
 */
const bool = (def) => {
  const base = z.union([z.boolean(), z.enum(['true', 'false', '0', '1'])]).transform(
    (v) => v === true || v === 'true' || v === '1',
  );
  return def === undefined ? base.optional() : base.default(def);
};

/* ------------------------------------------------------------------ auth */
const auth = {
  login: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  }),
  register: z.object({
    name: z.string().min(2).max(80),
    email: z.string().email(),
    password: z.string().min(6),
    role: z.enum([...EMPLOYEE_ROLES, 'manager']).default('clerk'),
  }),
};

/* --------------------------------------------------------------- products */
const products = {
  create: z.object({
    name: z.string().min(2, 'Name is required').max(120),
    sku: z.string().max(40).optional(),
    category: z.enum(PRODUCT_CATEGORIES).default('refill'),
    price: z.coerce.number().min(0, 'Price cannot be negative'),
    icon: z.string().max(40).optional(),
    description: z.string().max(240).optional(),
    gallons: z.coerce.number().min(0).default(0),
    yieldsContainer: bool(false),
    containerSize: z.string().max(40).optional(),
    inventoryItem: optionalObjectId,
    trackStock: bool(true),
    isActive: bool(true),
  }),
  update: z.object({
    name: z.string().min(2).max(120).optional(),
    sku: z.string().max(40).optional(),
    category: z.enum(PRODUCT_CATEGORIES).optional(),
    price: z.coerce.number().min(0).optional(),
    icon: z.string().max(40).optional(),
    description: z.string().max(240).optional(),
    gallons: z.coerce.number().min(0).optional(),
    yieldsContainer: bool(),
    containerSize: z.string().max(40).optional(),
    inventoryItem: optionalObjectId,
    trackStock: bool(),
    isActive: bool(),
  }),
  list: z.object({
    category: z.enum(PRODUCT_CATEGORIES).optional(),
    search: z.string().max(80).optional(),
    isActive: boolQuery,
  }),
};

/* -------------------------------------------------------------- inventory */
const inventoryCreate = z.object({
  name: z.string().min(2, 'Item name is required').max(120),
  category: z.enum(INVENTORY_CATEGORIES).default('Raw Supplies'),
  stockLevel: z.coerce.number().min(0).default(0),
  reorderPoint: z.coerce.number().min(0).default(0),
  unitPrice: z.coerce.number().min(0).default(0),
  unit: z.enum(INVENTORY_UNITS).default('pcs'),
  // --- Point of Sale: an item is sellable by default; `sellPrice` falls
  // back to the unit cost when left at 0 (see inventory.service.create).
  sellPrice: z.coerce.number().min(0).default(0),
  isSellable: bool(true),
  icon: z.string().max(40).optional(),
  supplier: z.string().max(120).optional(),
  notes: z.string().max(240).optional(),
});

const inventory = {
  create: inventoryCreate,
  // Declared separately: referencing `inventory` inside its own `const`
  // initializer would hit the temporal dead zone.
  update: inventoryCreate
    .partial()
    .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' }),
  restock: z.object({
    // Negative quantity is allowed — it records a write-off/adjustment.
    quantity: z.coerce
      .number()
      .refine((n) => n !== 0, 'Quantity cannot be zero'),
    note: z.string().max(240).optional(),
  }),
  list: z.object({
    category: z.enum(INVENTORY_CATEGORIES).optional(),
    status: z.enum(['In Stock', 'Low Stock', 'Critical', 'Out of Stock']).optional(),
    search: z.string().max(80).optional(),
    lowOnly: boolQuery,
    // `true` returns only archived items; omitted returns only active ones.
    archived: boolQuery,
  }),
  posSupplies: z.object({
    search: z.string().max(80).optional(),
    category: z.enum(INVENTORY_CATEGORIES).optional(),
  }),
};

/* -------------------------------------------------------------- containers */
const containers = {
  create: z.object({
    // Optional — the service auto-generates the next CNT-#### code.
    code: z.string().min(3).max(30).optional(),
    size: z.enum(CONTAINER_SIZES).default('5-Gallon Round'),
    status: z.enum(Object.values(CONTAINER_STATUS)).default('in_station'),
    customer: optionalObjectId,
    condition: z.string().max(120).optional(),
    notes: z.string().max(240).optional(),
  }),
  update: z
    .object({
      size: z.enum(CONTAINER_SIZES).optional(),
      status: z.enum(Object.values(CONTAINER_STATUS)).optional(),
      customer: optionalObjectId,
      condition: z.string().max(120).optional(),
      notes: z.string().max(240).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' }),
  returnMany: z.object({
    containerIds: z.array(objectId).min(1, 'Select at least one container'),
    condition: z.string().max(120).optional(),
  }),
  list: z.object({
    status: z.enum(Object.values(CONTAINER_STATUS)).optional(),
    size: z.enum(CONTAINER_SIZES).optional(),
    customer: optionalObjectId,
    search: z.string().max(60).optional(),
  }),
};

/* --------------------------------------------------------------- customers */
const customers = {
  create: z.object({
    name: z.string().min(2, 'Customer name is required').max(120),
    type: z.enum(CUSTOMER_TYPES).default('regular'),
    phone: z.string().max(30).optional(),
    address: z.string().max(240).optional(),
    creditLimit: z.coerce.number().min(0).default(0),
    notes: z.string().max(240).optional(),
  }),
  update: z
    .object({
      name: z.string().min(2).max(120).optional(),
      type: z.enum(CUSTOMER_TYPES).optional(),
      phone: z.string().max(30).optional(),
      address: z.string().max(240).optional(),
      creditLimit: z.coerce.number().min(0).optional(),
      balance: z.coerce.number().min(0).optional(),
      notes: z.string().max(240).optional(),
      isActive: bool(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' }),
};

/* ----------------------------------------------------------------- orders */
/**
 * A POS line is either a catalog product (refills, packages, supplies) or an
 * Inventory & Stock item sold off the Supplies grid. Exactly one id is set —
 * the exclusive `refine` rejects a line carrying both or neither.
 */
const orderLine = z
  .object({
    product: optionalObjectId,
    inventoryItem: optionalObjectId,
    qty: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
  })
  .refine((v) => Boolean(v.product) !== Boolean(v.inventoryItem), {
    message: 'Each line must reference either a product or an inventory item',
  });

const orders = {
  create: z.object({
    customerType: z.enum(CUSTOMER_TYPES).default('walk_in'),
    customer: optionalObjectId,
    customerName: z.string().max(120).optional(),
    staff: optionalObjectId,
    rider: optionalObjectId,
    items: z.array(orderLine).min(1, 'Add at least one item to the order'),
    containerHandling: z.enum(CONTAINER_HANDLING).default('exchange_1to1'),
    discount: z.coerce.number().min(0).default(0),
    paymentMethod: z.enum(PAYMENT_METHODS).default('cash'),
    cashReceived: z.coerce.number().min(0).default(0),
    note: z.string().max(240).optional(),
  }),
  list: z.object({
    status: z.enum(ORDER_STATUS).optional(),
    paymentMethod: z.enum(PAYMENT_METHODS).optional(),
    customerType: z.enum(CUSTOMER_TYPES).optional(),
    staff: optionalObjectId,
    search: z.string().max(60).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    // Paging is part of the list contract, so merge it in here rather
    // than reading `req.query` separately in the controller.
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(20),
  }),
  updateStatus: z.object({ status: z.enum(ORDER_STATUS) }),
};

/* -------------------------------------------------------------- employees */
const employees = {
  create: z.object({
    name: z.string().min(2, 'Name is required').max(80),
    role: z.enum(EMPLOYEE_ROLES).default('clerk'),
    status: z.enum(EMPLOYEE_STATUS).default('active'),
    phone: z.string().max(30).optional(),
    quotaTarget: z.coerce.number().min(0).default(0),
    commissionRate: z.coerce.number().min(0).max(100).default(5),
    shift: z.string().max(40).default('Morning'),
  }),
  update: z
    .object({
      name: z.string().min(2).max(80).optional(),
      role: z.enum(EMPLOYEE_ROLES).optional(),
      status: z.enum(EMPLOYEE_STATUS).optional(),
      phone: z.string().max(30).optional(),
      quotaTarget: z.coerce.number().min(0).optional(),
      commissionRate: z.coerce.number().min(0).max(100).optional(),
      shift: z.string().max(40).optional(),
    })
    .refine((v) => Object.keys(v).length > 0, { message: 'No fields to update' }),
  setTargets: z.object({
    targets: z
      .array(
        z.object({
          employee: objectId,
          quotaTarget: z.coerce.number().min(0),
        }),
      )
      .min(1, 'Provide at least one target'),
  }),
  list: z.object({
    role: z.enum(EMPLOYEE_ROLES).optional(),
    status: z.enum(EMPLOYEE_STATUS).optional(),
    search: z.string().max(80).optional(),
    date: z.string().datetime().or(z.string().date()).optional(),
    // `true` returns only archived staff; omitted returns only active ones.
    archived: boolQuery,
  }),
};

/* ----------------------------------------------------------------- shifts */
const shifts = {
  create: z.object({
    name: z.enum(SHIFT_NAMES),
    operator: optionalObjectId,
    openingFloat: z.coerce.number().min(0).default(0),
  }),
  reconcile: z.object({
    actualCash: z.coerce.number().min(0),
    countedBy: z.string().max(80).optional(),
  }),
  list: z.object({
    status: z.enum(['active', 'closed']).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

/* --------------------------------------------------------------- common qs */
const common = {
  id: z.object({ id: objectId }),
  paging: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(200).default(20),
  }),
  dateRange: z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  }),
};

/* --------------------------------------------------------------- reports qs */
/** Reporting Engine — GET /reports/summary?period=&date= */
const reports = {
  summary: z.object({
    period: z.enum(['daily', 'weekly', 'monthly', 'yearly']).default('daily'),
    date: z.coerce.date().optional(),
  }),
};

module.exports = {
  objectId,
  optionalObjectId,
  boolQuery,
  auth,
  products,
  inventory,
  containers,
  customers,
  orders,
  employees,
  shifts,
  reports,
  common,
  bool,
};
