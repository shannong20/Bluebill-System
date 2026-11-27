const express = require('express');
const controller = require('../controllers/product.controller');
const validate = require('../middleware/validate');
const { products, common } = require('../validators');

const router = express.Router();

router.get('/', validate(products.list, 'query'), controller.list);
router.post('/', validate(products.create), controller.create);
router.get('/:id', validate(common.id, 'params'), controller.getById);
router.put('/:id', validate(common.id, 'params'), validate(products.update), controller.update);
router.delete('/:id', validate(common.id, 'params'), controller.remove);

module.exports = router;
