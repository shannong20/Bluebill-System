const express = require('express');
const controller = require('../controllers/employee.controller');
const validate = require('../middleware/validate');
const { employees, common } = require('../validators');

const router = express.Router();

router.get('/', validate(employees.list, 'query'), controller.list);
router.post('/', validate(employees.create), controller.create);

// Static segments before the `/:id` catch-all.
router.get('/performance', controller.performance);
router.post('/targets', validate(employees.setTargets), controller.setTargets);
router.post('/reset-metrics', controller.resetMetrics);

/** Soft delete / restore. */
router.post('/:id/archive', validate(common.id, 'params'), controller.archive);
router.post('/:id/restore', validate(common.id, 'params'), controller.restore);

router.get('/:id', validate(common.id, 'params'), controller.getById);
router.put('/:id', validate(common.id, 'params'), validate(employees.update), controller.update);
router.delete('/:id', validate(common.id, 'params'), controller.remove);

module.exports = router;
