const mongoose = require('mongoose');
const { SHIFT_NAMES, SHIFT_STATUS } = require('../config/constants');
const { round2 } = require('../utils/helpers');

/**
 * A work shift. Doubles as the cash-drawer reconciliation record:
 * openingFloat + cashSales - cashRefunds must equal `actualCash`.
 */
const shiftSchema = new mongoose.Schema(
  {
    name: { type: String, enum: SHIFT_NAMES, required: true },
    label: { type: String, trim: true }, // e.g. "Morning Shift X-Read"
    date: { type: Date, default: Date.now, index: true },
    startTime: { type: Date, default: Date.now },
    endTime: Date,
    operator: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    operatorName: { type: String, trim: true },
    status: { type: String, enum: SHIFT_STATUS, default: 'active', index: true },

    // --- Cash drawer ---
    openingFloat: { type: Number, default: 0, min: 0 },
    cashSales: { type: Number, default: 0, min: 0 },
    cashRefunds: { type: Number, default: 0, min: 0 },
    expectedCash: { type: Number, default: 0, min: 0 },
    actualCash: { type: Number, default: 0, min: 0 },
    variance: { type: Number, default: 0 },
    reconciled: { type: Boolean, default: false },
    countedBy: { type: String, trim: true },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

shiftSchema.pre('save', function computeDrawer(next) {
  this.expectedCash = round2(this.openingFloat + this.cashSales - this.cashRefunds);
  this.variance = round2((this.actualCash || 0) - this.expectedCash);
  next();
});

shiftSchema.virtual('isBalanced').get(function balanced() {
  return this.reconciled && Math.abs(this.variance) < 0.01;
});

shiftSchema.index({ date: -1, status: 1 });

module.exports = mongoose.model('Shift', shiftSchema);
