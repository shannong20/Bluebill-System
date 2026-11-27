const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');

const signToken = (user) =>
  jwt.sign(
    { sub: String(user._id), role: user.role, name: user.name },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn },
  );

/** Verifies the bearer token and attaches the user document to `req.user`. */
const protect = async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) return next(ApiError.unauthorized('No token provided'));

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const user = await User.findById(payload.sub);
    if (!user) return next(ApiError.unauthorized('User no longer exists'));
    if (!user.isActive) return next(ApiError.forbidden('Account is deactivated'));
    req.user = user;
    return next();
  } catch (err) {
    return next(ApiError.unauthorized('Invalid or expired token'));
  }
};

/** Route guard — use after `protect`. */
const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (roles.length && !roles.includes(req.user.role)) {
      return next(ApiError.forbidden(`Requires role: ${roles.join(' or ')}`));
    }
    return next();
  };

module.exports = { protect, authorize, signToken };
