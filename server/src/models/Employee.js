const mongoose = require('mongoose');
const {
  EMPLOYEE_ROLES,
  EMPLOYEE_STATUS,
  quotaStatus,
} = require('../config/constants');
const { initials, round2, startOfDay } = require('../utils/helpers');

/**
 * Staff performance record. Daily figures (`achieved`, `revenue`) are reset
 * by the shift-rotation job; `quotaTarget` is what management sets.
 */
const employeeSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    role: { type: String, enum: EMPLOYEE_ROLES, required: true, default: 'clerk' },
    status: { type: String, enum: EMPLOYEE_STATUS, default: 'active', index: true },
    phone: { type: String, trim: true, maxlength: 30 },

    // Daily targets & achievements
    quotaTarget: { type: Number, default: 0, min: 0 },
    achieved: { type: Number, default: 0, min: 0 },
    revenue: { type: Number, default: 0, min: 0 },
    orderCount: { type: Number, default: 0, min: 0 },

    // Commission: a percentage of revenue, applied to met quota.
    commissionRate: { type: Number, default: 5, min: 0, max: 100 },

    shift: { type: String, trim: true, default: 'Morning' },
    // Daily figures are bucketed by calendar day, so the default must be
    // midnight — otherwise "today's staff" queries would miss the record.
    date: { type: Date, default: () => startOfDay(), index: true },

    // Soft delete. `null` means the employee is active; a date means they were
    // archived and should be hidden from rosters, KPIs and quota tables while
    // their historical sales attribution stays intact.
    archivedAt: { type: Date, default: null },

    // --- Derived (recomputed in the pre-save hook) ---
    progress: { type: Number, default: 0, min: 0, max: 100 },
    commission: { type: Number, default: 0, min: 0 },
    performanceStatus: { type: String, default: 'Lagging' },
  },
  { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } },
);

// Recompute the derived performance fields whenever the numbers change.
employeeSchema.pre('save', function computePerformance(next) {
  this.progress = this.quotaTarget > 0 ? Math.round((this.achieved / this.quotaTarget) * 100) : 0;
  this.progress = Math.min(this.progress, 100);
  this.commission =
    this.progress >= 100 ? round2((this.revenue * this.commissionRate) / 100) : 0;
  this.performanceStatus = quotaStatus(this.progress);
  next();
});

employeeSchema.virtual('initials').get(function empInitials() {
  return initials(this.name);
});

employeeSchema.virtual('isArchived').get(function isArchived() {
  return Boolean(this.archivedAt);
});

employeeSchema.index({ date: 1, status: 1 });
employeeSchema.index({ name: 1 });
employeeSchema.index({ archivedAt: 1 });

module.exports = mongoose.model('Employee', employeeSchema);
