const mongoose = require('mongoose');
const { PRODUCT_CATEGORIES, INVENTORY_CATEGORIES } = require('../config/constants');

/**
 * A sellable item on the Point of Sale grid.
 * `inventoryItem` links it to stock tracking — when set, completing an
 * order decrements the linked InventoryItem (see services/order.service.js).
 */
const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 120 },
    sku: { type: String, trim: true, uppercase: true, sparse: true, unique: true },
    category: {
      type: String,
      required: true,
      enum: PRODUCT_CATEGORIES,
      default: 'refill',
    },
    price: { type: Number, required: true, min: 0 },
    icon: { type: String, default: 'droplet' },
    description: { type: String, trim: true, maxlength: 240 },
    // Gallons of purified water produced/consumed per unit — drives quota math.
    gallons: { type: Number, default: 0, min: 0 },
    // Refills & new-container sales leave containers with the customer.
    yieldsContainer: { type: Boolean, default: false },
    containerSize: { type: String, trim: true },
    inventoryItem: { type: mongoose.Schema.Types.ObjectId, ref: 'InventoryItem' },
    trackStock: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

productSchema.index({ category: 1, isActive: 1 });
productSchema.index({ name: 'text', sku: 'text' });

module.exports = mongoose.model('Product', productSchema);
module.exports.CATEGORIES = PRODUCT_CATEGORIES;
module.exports.INVENTORY_CATEGORIES = INVENTORY_CATEGORIES;
