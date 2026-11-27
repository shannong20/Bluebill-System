const mongoose = require('mongoose');
const {
  CUSTOMER_TYPES,
  PAYMENT_METHODS,
  CONTAINER_HANDLING,
  ORDER_STATUS,
  ORDER_LINE_SOURCE,
} = require('../config/constants');
const { round2 } = require('../utils/helpers');

const orderItemSchema = new mongoose.Schema(
  {
    // A line points at either a catalog `product` or an `inventoryItem` sold
    // straight off the POS Supplies grid. Exactly one is set — the validator
    // below enforces it — and both paths decrement their stock on sale.
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
    source: {
      type: String,
      enum: Object.values(ORDER_LINE_SOURCE),
      default: ORDER_LINE_SOURCE.PRODUCT,
    },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
    gallons: { type: Number, default: 0, min: 0 },
    // Stock unit ("pcs", "roll", …) — only carried for inventory lines.
    unit: { type: String, trim: true },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  {
    _id: false,
    validate: {
      validator: (line) => Boolean(line.product) !== Boolean(line.inventoryItem),
      message:
        'A line item must reference either a product or an inventory item, not both',
    },
  },
);

/** A completed Point-of-Sale transaction. */
const orderSchema = new mongoose.Schema(
  {
    orderId: { type: String, required: true, unique: true, index: true },
    customerType: { type: String, enum: CUSTOMER_TYPES, default: 'walk_in' },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    customerName: { type: String, default: 'Walk-In', trim: true },

    staff: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    staffName: { type: String, trim: true },
    rider: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

    items: {
      type: [orderItemSchema],
      validate: [(v) => v.length > 0, 'An order must contain at least one item'],
    },

    containerHandling: { type: String, enum: CONTAINER_HANDLING, default: 'exchange_1to1' },
    containersIssued: { type: Number, default: 0, min: 0 },

    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },

    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: 'cash' },
    paymentStatus: { type: String, enum: ['unpaid', 'paid'] },
    cashReceived: { type: Number, default: 0, min: 0 },
    change: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: ORDER_STATUS, default: 'completed', index: true },
    shift: { type: mongoose.Schema.Types.ObjectId, ref: 'Shift' },
    note: { type: String, trim: true, maxlength: 240 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

orderSchema.virtual('itemSummary').get(function itemSummary() {
  return this.items.map((i) => `${i.qty}x ${i.name}`).join(', ');
});

orderSchema.virtual('totalGallons').get(function totalGallons() {
  return this.items.reduce((sum, i) => sum + (i.gallons || 0) * i.qty, 0);
});

orderSchema.pre('validate', function normalizeTotals(next) {
  this.subtotal = round2(
    this.items.reduce((sum, i) => sum + (i.lineTotal ?? i.price * i.qty), 0),
  );
  this.discount = round2(Math.min(this.discount || 0, this.subtotal));
  this.total = round2(this.subtotal - this.discount);
  if (this.paymentMethod === 'cash') {
    this.change = round2(Math.max(0, (this.cashReceived || 0) - this.total));
  }
  next();
});

orderSchema.index({ createdAt: -1 });
orderSchema.index({ 'staff._id': 1, createdAt: -1 });
orderSchema.index({ paymentMethod: 1, createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
