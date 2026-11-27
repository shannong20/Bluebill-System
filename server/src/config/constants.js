/**
 * Domain constants shared by models, services and the client.
 * Keeping them in one place stops typos and keeps enum values consistent.
 */

const PRODUCT_CATEGORIES = ['refill', 'package', 'supply'];
const PRODUCT_CATEGORY_LABELS = {
  refill: 'Refills',
  package: 'Packages',
  supply: 'Supplies',
};

const INVENTORY_CATEGORIES = [
  'Finished Stock',
  'Raw Supplies',
  'Container Assets',
  'Equipment',
];

const INVENTORY_STATUS = {
  IN_STOCK: 'In Stock',
  LOW_STOCK: 'Low Stock',
  CRITICAL: 'Critical',
  OUT_OF_STOCK: 'Out of Stock',
};

const INVENTORY_UNITS = ['pcs', 'roll', 'set', 'box', 'gallon', 'litre'];

const CONTAINER_SIZES = ['5-Gallon Round', '5-Gallon Slim', '1L Bottle', '2L Bottle', '10-Gallon'];
const CONTAINER_STATUS = {
  IN_STATION: 'in_station',
  WITH_CUSTOMER: 'with_customer',
  DAMAGED: 'damaged',
};
const CONTAINER_STATUS_LABELS = {
  in_station: 'In Station (Ready)',
  with_customer: 'Out with Customers',
  damaged: 'Damaged / Scrapped',
};

const CUSTOMER_TYPES = ['walk_in', 'regular', 'delivery'];
const PAYMENT_METHODS = ['cash', 'gcash', 'on_account'];
const CONTAINER_HANDLING = ['exchange_1to1', 'new_container', 'borrowing'];
const ORDER_STATUS = ['completed', 'cancelled', 'refunded'];

/**
 * Named aliases for the value arrays above. Using `PAYMENT_METHODS.ON_ACCOUNT`
 * on an array would silently yield `undefined` — always use these instead.
 */
const PAYMENT_METHOD = {
  CASH: 'cash',
  GCASH: 'gcash',
  ON_ACCOUNT: 'on_account',
};

const CONTAINER_HANDLING_MODE = {
  EXCHANGE_1TO1: 'exchange_1to1',
  NEW_CONTAINER: 'new_container',
  BORROWING: 'borrowing',
};

const ORDER_STATE = {
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
};

/**
 * Where an order line came from. `product` is a catalog entry (refills,
 * packages, supplies); `inventory` is a raw Inventory & Stock item sold
 * straight off the POS Supplies grid. Either way the sale draws the
 * corresponding stock down.
 */
const ORDER_LINE_SOURCE = {
  PRODUCT: 'product',
  INVENTORY: 'inventory',
};

const EMPLOYEE_ROLES = ['clerk', 'driver', 'operator', 'admin'];
const EMPLOYEE_STATUS = ['active', 'inactive', 'on_leave'];

const SHIFT_NAMES = ['Morning', 'Afternoon', 'Evening'];
const SHIFT_STATUS = ['active', 'closed'];

/** Quota progress thresholds -> label shown in the UI (design uses these). */
const QUOTA_THRESHOLDS = {
  MET: 100,
  ON_TRACK: 80,
  ALMOST_THERE: 50,
  LAGGING: 0,
};

function quotaStatus(percent) {
  if (percent >= QUOTA_THRESHOLDS.MET) return 'Quota Met';
  if (percent >= QUOTA_THRESHOLDS.ON_TRACK) return 'On Track';
  if (percent >= QUOTA_THRESHOLDS.ALMOST_THERE) return 'Almost There';
  return 'Lagging';
}

/**
 * Stock health, matching the labels used in the design:
 *   Critical  — effectively out (≤ 2 units) or ≤ 25% of the reorder point
 *   Low Stock — at or below the reorder point
 *   In Stock  — comfortably above it
 */
function stockStatus(stockLevel, reorderPoint) {
  if (stockLevel <= 0) return INVENTORY_STATUS.OUT_OF_STOCK;
  if (stockLevel <= 2 || stockLevel <= reorderPoint * 0.25) {
    return INVENTORY_STATUS.CRITICAL;
  }
  if (stockLevel <= reorderPoint) return INVENTORY_STATUS.LOW_STOCK;
  return INVENTORY_STATUS.IN_STOCK;
}

module.exports = {
  PRODUCT_CATEGORIES,
  PRODUCT_CATEGORY_LABELS,
  INVENTORY_CATEGORIES,
  INVENTORY_STATUS,
  INVENTORY_UNITS,
  CONTAINER_SIZES,
  CONTAINER_STATUS,
  CONTAINER_STATUS_LABELS,
  CUSTOMER_TYPES,
  PAYMENT_METHODS,
  PAYMENT_METHOD,
  CONTAINER_HANDLING,
  CONTAINER_HANDLING_MODE,
  ORDER_STATUS,
  ORDER_STATE,
  ORDER_LINE_SOURCE,
  EMPLOYEE_ROLES,
  EMPLOYEE_STATUS,
  SHIFT_NAMES,
  SHIFT_STATUS,
  QUOTA_THRESHOLDS,
  quotaStatus,
  stockStatus,
};
