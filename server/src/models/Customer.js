const mongoose = require('mongoose');
const {
  CONTAINER_SIZES,
  CONTAINER_STATUS,
  CONTAINER_STATUS_LABELS,
  CUSTOMER_TYPES,
} = require('../config/constants');

/** A customer account. Walk-in sales are stored on the order only. */
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Customer name is required'], trim: true, maxlength: 120 },
    type: { type: String, enum: CUSTOMER_TYPES, default: 'regular' },
    phone: { type: String, trim: true, maxlength: 30 },
    address: { type: String, trim: true, maxlength: 240 },
    // Outstanding balance for on-account customers (₱).
    balance: { type: Number, default: 0, min: 0 },
    creditLimit: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true, maxlength: 240 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

customerSchema.virtual('containersOut', {
  ref: 'Container',
  localField: '_id',
  foreignField: 'customer',
  count: { $match: { status: CONTAINER_STATUS.WITH_CUSTOMER } },
});

customerSchema.index({ name: 'text', phone: 'text' });
customerSchema.index({ type: 1, isActive: 1 });

module.exports = mongoose.model('Customer', customerSchema);
module.exports.CONTAINER_STATUS_LABELS = CONTAINER_STATUS_LABELS;
module.exports.CONTAINER_SIZES = CONTAINER_SIZES;
