const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { initials } = require('../utils/helpers');
const { EMPLOYEE_ROLES, EMPLOYEE_STATUS } = require('../config/constants');

/**
 * Login identity. Kept separate from `Employee` so that operational staff
 * records (quota, revenue, commission) stay independent of auth concerns.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: [...EMPLOYEE_ROLES, 'manager'], default: 'clerk' },
    employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    isActive: { type: Boolean, default: true },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, env.bcryptRounds);
  return next();
});

userSchema.methods.verifyPassword = function verifyPassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.getInitials = function getUserInitials() {
  return initials(this.name);
};

module.exports = mongoose.model('User', userSchema);
