const sequelize = require('../config/database');
//import sequelize from '../../config/database.js';


const getEmailDataByDocumentId = async (document_id, sequelizeConnection = null) => {
  const connectionToUse = sequelizeConnection || sequelize;

  // D'abord, vérifier si c'est une livraison ou un retour (dans stock) ou un document vente_document
  const checkStock = await connectionToUse.query(
    `SELECT id, type FROM stock WHERE id = :id AND type IN (2, 5)`,
    {
      replacements: { id: document_id },
      type: connectionToUse.QueryTypes.SELECT,
    }
  );

  // Si c'est un document dans stock (livraison ou retour)
  if (checkStock && checkStock.length > 0) {
    const stockType = checkStock[0].type;
    const documentKind = stockType === 5 ? 'RETOUR CLIENT' : 'LIVRAISON';

    const result = await connectionToUse.query(
      `
        SELECT 
          s.id AS document_id,
          s.numero,
          s.description AS client_ref,
          s.date,
          s.part_id,
          p.nom AS client,
          c.nom AS commercial,
          sd.article_id AS article_id,
          a.article_cod,
          sd.description AS designation,
          a.article_nom,
          sd.quantite,
          sd.prix,
          CASE WHEN sd.description IS NULL OR LTRIM(RTRIM(CAST(sd.description AS VARCHAR(MAX)))) = '' THEN a.article_nom ELSE sd.description END AS article,
          sd.taux_tva,
          CASE 
            WHEN sd.remise <> 0 THEN (sd.quantite * sd.prix) - ((sd.quantite * sd.prix) * sd.remise)
            ELSE (sd.quantite * sd.prix) - ISNULL(sd.remise_montant, 0)
          END AS remise,
          '' AS condition,
          '' AS expedition,
          '' AS transporteur,
          '' AS adresse,
          '' AS ville,
          sd.id AS ligne_id,
          s.type,
          s.etat,
          :documentKind AS document_kind
        FROM stock s
        LEFT JOIN stock_detail sd ON sd.stock_id = s.id
        LEFT JOIN v_partenaire p ON p.part_id = s.part_id
        LEFT JOIN contact c ON c.id = s.employe_id
        LEFT JOIN article a ON a.article_id = sd.article_id
        WHERE s.id = :id
      `,
      {
        replacements: { id: document_id, documentKind },
        type: connectionToUse.QueryTypes.SELECT,
      }
    );
    return result;
  }

  // Sinon, c'est un document vente_document (devis, commande, etc.)
  const result = await connectionToUse.query(
    `
       
        Select v.document_id , v.numero , v.description as client_ref,v.date , p.nom as client , c.nom as commercial , 
        vd.article_id AS article_id, a.article_cod , q.designation ,a.article_nom ,vd.quantite , vd.prix ,
        CASE WHEN q.designation IS NULL OR LTRIM(RTRIM(CAST(q.designation AS VARCHAR(MAX)))) = '' THEN a.article_nom ELSE q.designation END as article , vd.taux_tva,
        case when vd.remise <> 0 then (vd.quantite * vd.prix)-((vd.quantite * vd.prix)*vd.remise) else (vd.quantite * vd.prix)-vd.remise_montant end as remise,
        vi.condition , vi.expedition , vi.transporteur , '' as adresse , '' as ville , vd.id AS ligne_id,
        v.type, v.etat, v.part_id
        from vente_document v
        left join vente_document_detail vd on v.document_id = vd.document_id
        left join v_partenaire p on p.part_id = v.part_id
        left join contact c on c.id = v.contact_id
        left join vente_document_quill q on q.quill_id = vd.id and q.document_id = vd.document_id and q.article_id = vd.article_id
        left join vente_document_info vi on vi.document_id = v.document_id
        left join article a on a.article_id = vd.article_id
        WHERE v.document_id = :id
    `,
    {
      replacements: { id: document_id },
      type: connectionToUse.QueryTypes.SELECT,
    }
  );

  return result;
};

module.exports = {
  getEmailDataByDocumentId
};
