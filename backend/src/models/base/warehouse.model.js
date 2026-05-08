const { getConnection } = require('../../config/database');

const getAllWarehouses = async (options = {}) => {
  const sequelize = getConnection();
  const {
    page = 1,
    pageSize = 25,
    orderBy = 'nom',
    orderDirection = 'ASC',
    search = ''
  } = options;

  const safePage = parseInt(page, 10) || 1;
  const safePageSize = parseInt(pageSize, 10) || 25;
  const offset = (safePage - 1) * safePageSize;
  const validColumns = ['id', 'code', 'nom', 'status'];
  const safeOrderBy = validColumns.includes(orderBy) ? orderBy : 'nom';
  const safeOrderDirection = String(orderDirection).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  const replacements = { offset, pageSize: safePageSize };
  let whereClause = '';
  if (search && String(search).trim()) {
    replacements.search = `%${String(search).trim()}%`;
    whereClause = `
      WHERE (
        CAST(id AS NVARCHAR(50)) LIKE :search
        OR code LIKE :search
        OR nom LIKE :search
        OR [status] LIKE :search
      )
    `;
  }

  const query = `
    SELECT
      id,
      code,
      nom,
      [status],
      COUNT(*) OVER() AS total_count
    FROM V_warehouse
    ${whereClause}
    ORDER BY ${safeOrderBy} ${safeOrderDirection}
    OFFSET :offset ROWS
    FETCH NEXT :pageSize ROWS ONLY
  `;

  const rows = await sequelize.query(query, {
    replacements,
    type: sequelize.QueryTypes.SELECT
  });

  const total = rows.length > 0 ? parseInt(rows[0].total_count, 10) || 0 : 0;
  const data = rows.map(({ total_count, ...rest }) => rest);
  return {
    data,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      total,
      totalPages: Math.ceil(total / safePageSize) || 1
    }
  };
};

const getWarehouseById = async (id) => {
  const sequelize = getConnection();
  const rows = await sequelize.query(
    `
      SELECT id, code, nom, [status]
      FROM V_warehouse
      WHERE id = :id
    `,
    {
      replacements: { id },
      type: sequelize.QueryTypes.SELECT
    }
  );
  return rows[0] || null;
};

const updateWarehouse = async (id, data) => {
  const sequelize = getConnection();
  await sequelize.query(
    `
      UPDATE warehouse
      SET code = :code,
          nom = :nom,
          [status] = :status
      WHERE id = :id
    `,
    {
      replacements: {
        id,
        code: data.code,
        nom: data.nom,
        status: data.status
      },
      type: sequelize.QueryTypes.UPDATE
    }
  );
  return { success: true, message: 'Warehouse mis à jour avec succès' };
};

module.exports = {
  getAllWarehouses,
  getWarehouseById,
  updateWarehouse
};

