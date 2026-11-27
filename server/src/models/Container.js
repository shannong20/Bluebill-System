const mongoose = require('mongoose');
const {
  CONTAINER_SIZES,
  CONTAINER_STATUS,
  CONTAINER_STATUS_LABELS,
} = require('../config/constants');

/**
 * Tracks every refillable container as an asset.
 * status: in_station | with_customer | damaged
 */
const containerSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, trim: true, uppercase: true },
    size: { type: String, enum: CONTAINER_SIZES, default: '5-Gallon Round' },
    status: {
      type: String,
      enum: Object.values(CONTAINER_STATUS),
      default: CONTAINER_STATUS.IN_STATION,
      index: true,
    },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer' },
    // Denormalised so the dashboard can count without a join.
    customerName: { type: String, trim: true },
    lastOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
    issuedAt: Date,
    returnedAt: Date,
    condition: { type: String, trim: true, maxlength: 120 },
    notes: { type: String, trim: true, maxlength: 240 },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

containerSchema.virtual('statusLabel').get(function statusLabel() {
  return CONTAINER_STATUS_LABELS[this.status] || this.status;
});

containerSchema.index({ status: 1, size: 1 });
containerSchema.index({ customer: 1, status: 1 });

module.exports = mongoose.model('Container', containerSchema);
