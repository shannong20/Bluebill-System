const express = require('express');
const controller = require('../controllers/container.controller');
const validate = require('../middleware/validate');
const { containers, common } = require('../validators');

const router = express.Router();

router.get('/', validate(containers.list, 'query'), controller.list);
router.post('/', validate(containers.create), controller.create);

// Static segments before the `/:id` catch-all.
router.get('/summary', controller.summary);
router.post('/return', validate(containers.returnMany), controller.returnMany);

router.get('/:id', validate(common.id, 'params'), controller.getById);
router.put('/:id', validate(common.id, 'params'), validate(containers.update), controller.update);
router.delete('/:id', validate(common.id, 'params'), controller.remove);
router.patch('/:id/return', validate(common.id, 'params'), controller.returnOne);

module.exports = router;
