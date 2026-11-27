const express = require('express');
const controller = require('../controllers/inventory.controller');
const validate = require('../middleware/validate');
const { inventory, common } = require('../validators');

const router = express.Router();

router.get('/', validate(inventory.list, 'query'), controller.list);
router.post('/', validate(inventory.create), controller.create);

// Static segments must be declared before the `/:id` catch-all.
router.get('/summary', controller.summary);
router.get('/alerts', controller.alerts);
router.get('/pos-supplies', validate(inventory.posSupplies, 'query'), controller.posSupplies);

router.get('/:id', validate(common.id, 'params'), controller.getById);
router.put('/:id', validate(common.id, 'params'), validate(inventory.update), controller.update);
router.delete('/:id', validate(common.id, 'params'), controller.remove);

/** Restock / adjust stock. `quantity` may be negative for a write-off. */
router.post(
  '/:id/restock',
  validate(common.id, 'params'),
  validate(inventory.restock),
  controller.restock,
);

/** Soft delete and its inverse — both take no body. */
router.post('/:id/archive', validate(common.id, 'params'), controller.archive);
router.post('/:id/restore', validate(common.id, 'params'), controller.restore);

module.exports = router;
