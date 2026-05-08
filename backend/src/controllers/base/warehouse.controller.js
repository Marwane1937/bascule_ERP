const warehouseService = require('../../services/base/warehouse.service');

class WarehouseController {
  async getWarehouses(req, res) {
    try {
      const options = {
        page: req.query.page || 1,
        pageSize: req.query.pageSize || 25,
        orderBy: req.query.orderBy || 'nom',
        orderDirection: req.query.orderDirection || 'ASC',
        search: req.query.search || ''
      };
      const result = await warehouseService.getAll(options);
      res.json({
        success: true,
        data: result.data,
        pagination: result.pagination
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message || 'Erreur lors de la récupération des warehouses',
        data: [],
        pagination: {}
      });
    }
  }

  async getWarehouse(req, res) {
    try {
      const warehouse = await warehouseService.getById(req.params.id);
      res.json({ success: true, data: warehouse });
    } catch (error) {
      const statusCode = error.message.includes('non trouvé') ? 404 : 400;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  }

  async updateWarehouse(req, res) {
    try {
      const result = await warehouseService.update(req.params.id, req.body);
      res.json({ success: true, message: result.message });
    } catch (error) {
      const statusCode = error.message.includes('non trouvé') ? 404 : 400;
      res.status(statusCode).json({ success: false, message: error.message });
    }
  }
}

module.exports = new WarehouseController();

