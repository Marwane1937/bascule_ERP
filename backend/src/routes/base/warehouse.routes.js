const express = require('express');
const router = express.Router();
const warehouseController = require('../../controllers/base/warehouse.controller');

router.get('/', warehouseController.getWarehouses);
router.get('/:id', warehouseController.getWarehouse);
router.put('/:id', warehouseController.updateWarehouse);

module.exports = router;

