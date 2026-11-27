const express = require('express');
const controller = require('../controllers/order.controller');
const validate = require('../middleware/validate');
const { orders, common } = require('../validators');

const router = express.Router();

router.get('/', validate(orders.list, 'query'), controller.list);
router.post('/', validate(orders.create), controller.create);

// Static segments before the `/:id` catch-all.
router.get('/metrics/summary', controller.metrics);
router.get('/recent', controller.recent);
router.get('/code/:orderId', controller.getByCode);

router.get('/:id', validate(common.id, 'params'), controller.getById);
router.patch('/:id/status', validate(common.id, 'params'), validate(orders.updateStatus), controller.updateStatus);

module.exports = router;
