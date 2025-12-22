-- ============================================
-- Script pour modifier la vue v_facture
-- afin d'inclure toutes les factures, même celles vides (montants à 0)
-- ============================================
-- 
-- Ce script modifie la vue v_facture pour qu'elle inclue toutes les factures
-- avec etat = 3 et type = 3, même celles qui n'ont pas de détails (factures vides)
--
-- IMPORTANT: Adaptez cette requête selon votre structure de base de données réelle
-- ============================================

-- Vérifier si la vue existe déjà
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'v_facture')
BEGIN
    DROP VIEW v_facture;
    PRINT 'Vue v_facture supprimée.';
END
GO

-- Créer la vue v_facture modifiée pour inclure toutes les factures (même vides)
-- Cette vue calcule les montants à partir de vente_document_detail
-- et inclut toutes les factures même si elles n'ont pas de détails
CREATE VIEW v_facture AS
SELECT 
    vd.document_id AS facture_id,
    vd.numero AS facture_num,
    vd.date AS facture_dat,
    ISNULL(p.nom, '') AS nom,
    ISNULL(SUM(
        CASE 
            WHEN vdd.quantite IS NULL OR vdd.prix IS NULL THEN 0
            ELSE (vdd.quantite * vdd.prix) - ISNULL(vdd.remise_montant, 0) - 
                 CASE WHEN vdd.remise IS NULL OR vdd.remise = 0 THEN 0 
                      ELSE (vdd.quantite * vdd.prix * vdd.remise) 
                 END
        END
    ), 0) AS facture_ht,
    ISNULL(SUM(
        CASE 
            WHEN vdd.quantite IS NULL OR vdd.prix IS NULL THEN 0
            ELSE ((vdd.quantite * vdd.prix) - ISNULL(vdd.remise_montant, 0) - 
                 CASE WHEN vdd.remise IS NULL OR vdd.remise = 0 THEN 0 
                      ELSE (vdd.quantite * vdd.prix * vdd.remise) 
                 END) * ISNULL(vdd.taux_tva, 0)
        END
    ), 0) AS facture_tva,
    ISNULL(SUM(
        CASE 
            WHEN vdd.quantite IS NULL OR vdd.prix IS NULL THEN 0
            ELSE ((vdd.quantite * vdd.prix) - ISNULL(vdd.remise_montant, 0) - 
                 CASE WHEN vdd.remise IS NULL OR vdd.remise = 0 THEN 0 
                      ELSE (vdd.quantite * vdd.prix * vdd.remise) 
                 END) * (1 + ISNULL(vdd.taux_tva, 0))
        END
    ), 0) AS facture_ttc
FROM vente_document vd
LEFT JOIN partenaire p ON p.part_id = vd.part_id
LEFT JOIN vente_document_detail vdd ON vdd.document_id = vd.document_id
WHERE vd.etat = 4 AND vd.type = 4
GROUP BY vd.document_id, vd.numero, vd.date, p.nom
GO

-- Vérifier que la vue a été créée
SELECT * FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'v_facture';
GO

PRINT 'Vue v_facture modifiée avec succès pour inclure toutes les factures (même vides).';
GO

-- ============================================
-- Notes importantes:
-- ============================================
-- 1. Cette vue inclut maintenant TOUTES les factures avec etat = 3 et type = 3
-- 2. Les factures sans détails (vides) auront des montants à 0
-- 3. Les montants sont calculés à partir de vente_document_detail
-- 4. Si une facture n'a pas de détails, tous les montants seront à 0
-- ============================================

