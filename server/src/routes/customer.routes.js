const express = require('express');
const controller = require('../controllers/customer.controller');
const validate = require('../middleware/validate');
const { customers, common } = require('../validators');

const router = express.Router();

router.get('/', controller.list);
router.get('/with-credit', controller.withCredit);
router.post('/', validate(customers.create), controller.create);
router.get('/:id', validate(common.id, 'params'), controller.getById);
router.put('/:id', validate(common.id, 'params'), validate(customers.update), controller.update);
router.delete('/:id', validate(common.id, 'params'), controller.remove);
router.post('/:id/settle', validate(common.id, 'params'), controller.settle);

module.exports = router;
