const User = require('../models/User');
const { signToken } = require('../middleware/auth');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/response');

const shape = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  initials: user.getInitials(),
  employee: user.employee,
});

/** POST /api/auth/login */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.verifyPassword(password))) {
    throw ApiError.unauthorized('Invalid email or password');
  }
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  return ok(res, { token: signToken(user), user: shape(user) });
});

/** POST /api/auth/register */
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  if (await User.exists({ email: email.toLowerCase() })) {
    throw ApiError.conflict('An account with that email already exists');
  }

  const user = await User.create({ name, email: email.toLowerCase(), password, role });
  return created(res, { token: signToken(user), user: shape(user) });
});

/** GET /api/auth/me */
const me = asyncHandler(async (req, res) => ok(res, shape(req.user)));

module.exports = { login, register, me };
