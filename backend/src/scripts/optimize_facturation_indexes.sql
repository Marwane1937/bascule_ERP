-- ============================================
-- Script d'optimisation des index pour Facturation
-- ============================================
-- Ce script crée des index pour améliorer les performances
-- de la vue v_facture utilisée dans le module Facturation
--
-- IMPORTANT: Ces index doivent être créés sur les tables
-- sous-jacentes de la vue v_facture, pas sur la vue elle-même
--
-- Exécuter ce script après avoir identifié les tables
-- qui composent la vue v_facture
-- ============================================

-- Note: Pour identifier les tables sous-jacentes de v_facture,
-- exécuter: SELECT * FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'v_facture'
-- ou: EXEC sp_helptext 'v_facture'

-- ============================================
-- Index recommandés pour améliorer les performances
-- ============================================

-- 1. Index sur la colonne de date (pour le tri par date)
-- À créer sur la table contenant facture_dat
-- CREATE NONCLUSTERED INDEX IX_facture_dat ON [nom_table] (facture_dat DESC)
-- INCLUDE (facture_id, facture_num, nom, facture_ht, facture_tva, facture_ttc);

-- 2. Index sur le numéro de facture (pour la recherche)
-- À créer sur la table contenant facture_num
-- CREATE NONCLUSTERED INDEX IX_facture_num ON [nom_table] (facture_num)
-- INCLUDE (facture_id, facture_dat, nom, facture_ht, facture_tva, facture_ttc);

-- 3. Index sur le nom du client (pour la recherche par client)
-- À créer sur la table contenant nom (probablement via une jointure)
-- CREATE NONCLUSTERED INDEX IX_nom ON [nom_table] (nom)
-- INCLUDE (facture_id);

-- 4. Index composite pour les recherches fréquentes
-- CREATE NONCLUSTERED INDEX IX_facture_search ON [nom_table] (facture_num, nom, facture_dat DESC);

-- ============================================
-- Statistiques recommandées
-- ============================================

-- Mettre à jour les statistiques pour optimiser le plan d'exécution
-- UPDATE STATISTICS [nom_table] WITH FULLSCAN;

-- ============================================
-- Vérification des index existants
-- ============================================

-- Pour vérifier les index existants sur une table:
-- SELECT 
--     i.name AS IndexName,
--     i.type_desc AS IndexType,
--     COL_NAME(ic.object_id, ic.column_id) AS ColumnName,
--     ic.is_included_column AS IsIncluded
-- FROM sys.indexes i
-- INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
-- WHERE i.object_id = OBJECT_ID('[nom_table]')
-- ORDER BY i.name, ic.key_ordinal;

-- ============================================
-- Notes importantes
-- ============================================

-- 1. Les index avec INCLUDE permettent d'éviter les lookups dans la table principale
-- 2. Les index doivent être créés en fonction des patterns de requête réels
-- 3. Trop d'index peuvent ralentir les INSERT/UPDATE, trouver le bon équilibre
-- 4. Surveiller la fragmentation des index et les reconstruire si nécessaire:
--    ALTER INDEX [IndexName] ON [nom_table] REBUILD;



