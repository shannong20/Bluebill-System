const mongoose = require('mongoose');
const {
  INVENTORY_CATEGORIES,
  INVENTORY_STATUS,
  INVENTORY_UNITS,
  stockStatus,
} = require('../config/constants');

/**
 * Stock keeping unit: finished goods, raw supplies, container assets, equipment.
 * `status` is derived from stockLevel vs reorderPoint but is also stored so it
 * can be filtered/sorted in MongoDB.
 */
const inventoryItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Item name is required'], trim: true, maxlength: 120 },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: INVENTORY_CATEGORIES,
      default: 'Raw Supplies',
    },
    stockLevel: { type: Number, required: true, min: 0, default: 0 },
    reorderPoint: { type: Number, required: true, min: 0, default: 0 },
    unitPrice: { type: Number, required: true, min: 0, default: 0 },
    unit: { type: String, enum: INVENTORY_UNITS, default: 'pcs' },

    // --- Point of Sale -----------------------------------------------------
    // `unitPrice` stays the *cost* used for the inventory valuation.
    // `sellPrice` is what the customer is charged — anything in stock can be
    // rung up at the POS, and selling one decrements its `stockLevel`.
    // `isSellable` defaults to true so a newly added item is immediately
    // sellable; untick it to keep an item off the till.
    sellPrice: { type: Number, min: 0, default: 0 },
    isSellable: { type: Boolean, default: true },
    icon: { type: String, trim: true, maxlength: 40, default: 'box' },

    status: {
      type: String,
      enum: Object.values(INVENTORY_STATUS),
      default: INVENTORY_STATUS.IN_STOCK,
    },
    supplier: { type: String, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 240 },
    lastRestockedAt: Date,
    // Soft delete. `null` means the item is active; a date means it was
    // archived and should be hidden from lists, KPIs and alerts.
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

// Keep `status` in sync whenever the levels change.
// Note: `insertMany` does NOT run save() middleware, so bulk inserts
// (the seed scripts) derive `status` explicitly with the same helper.
inventoryItemSchema.pre('save', function syncStatus(next) {
  this.status = stockStatus(this.stockLevel, this.reorderPoint);
  next();
});

inventoryItemSchema.virtual('inventoryValue').get(function value() {
  return Math.round(this.stockLevel * this.unitPrice * 100) / 100;
});

inventoryItemSchema.virtual('isLow').get(function isLow() {
  return this.stockLevel <= this.reorderPoint;
});

inventoryItemSchema.virtual('isArchived').get(function isArchived() {
  return Boolean(this.archivedAt);
});

inventoryItemSchema.index({ category: 1, status: 1 });
inventoryItemSchema.index({ name: 1 });
inventoryItemSchema.index({ archivedAt: 1 });
// Backs the POS Supplies grid lookup.
inventoryItemSchema.index({ isSellable: 1, archivedAt: 1 });

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
