const express = require('express');
const controller = require('../controllers/report.controller');
const validate = require('../middleware/validate');
const { common, shifts, reports } = require('../validators');

const router = express.Router();

router.get('/daily', controller.daily);
// Reporting Engine — period analytics behind the Analytics Reports tabs.
router.get('/summary', validate(reports.summary, 'query'), controller.engineSummary);
router.get('/reconciliation', controller.reconciliation);

router.get('/shifts', validate(shifts.list, 'query'), controller.shifts);
router.get('/shifts/active', controller.activeShift);
router.post('/shifts', validate(shifts.create), controller.startShift);
router.patch(
  '/shifts/:id/reconcile',
  validate(common.id, 'params'),
  validate(shifts.reconcile),
  controller.reconcile,
);

router.get('/export/orders.csv', controller.exportOrders);
router.get('/export/employees.csv', controller.exportEmployees);

module.exports = router;
