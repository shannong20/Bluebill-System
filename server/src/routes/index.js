const express = require('express');
const { notFound } = require('../middleware/errorHandler');
const { protect } = require('../middleware/auth');

const router = express.Router();

/**
 * API surface. Every resource is mounted here so the URL map lives in
 * exactly one place.
 *
 *   /api/health              liveness
 *   /api/auth                login / register / me
 *   /api/dashboard           overview aggregates
 *   /api/products            POS product catalogue
 *   /api/orders              transactions
 *   /api/inventory           stock levels
 *   /api/containers          container assets
 *   /api/customers           customer accounts
 *   /api/employees           staff & quotas
 *   /api/reports             shifts, X-Read, CSV exports
 */
router.get('/health', (req, res) =>
  res.json({
    success: true,
    data: {
      status: 'ok',
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    },
  }),
);

// Public: auth must be reachable without a token. `/auth/me` protects itself.
router.use('/auth', require('./auth.routes'));

// Everything below this line requires a valid bearer token.
router.use(protect);

router.use('/dashboard', require('./dashboard.routes'));
router.use('/products', require('./product.routes'));
router.use('/orders', require('./order.routes'));
router.use('/inventory', require('./inventory.routes'));
router.use('/containers', require('./container.routes'));
router.use('/customers', require('./customer.routes'));
router.use('/employees', require('./employee.routes'));
router.use('/reports', require('./report.routes'));

router.use(notFound);

module.exports = router;
