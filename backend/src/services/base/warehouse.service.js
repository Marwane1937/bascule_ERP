const warehouseModel = require('../../models/base/warehouse.model');

class WarehouseService {
  async getAll(options = {}) {
    return warehouseModel.getAllWarehouses(options);
  }

  async getById(id) {
    const warehouseId = parseInt(id, 10);
    if (isNaN(warehouseId)) {
      throw new Error('ID warehouse invalide');
    }
    const warehouse = await warehouseModel.getWarehouseById(warehouseId);
    if (!warehouse) {
      throw new Error('Warehouse non trouvé');
    }
    return warehouse;
  }

  async update(id, data) {
    const warehouseId = parseInt(id, 10);
    if (isNaN(warehouseId)) {
      throw new Error('ID warehouse invalide');
    }
    if (!data?.code || !data?.nom || !data?.status) {
      throw new Error('Code, nom et status sont requis');
    }
    return warehouseModel.updateWarehouse(warehouseId, data);
  }
}

module.exports = new WarehouseService();

