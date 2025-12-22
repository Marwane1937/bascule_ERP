-- ============================================
-- Script de création de la vue v_facture
-- ============================================
-- Cette vue est nécessaire pour le module Facturation
-- Elle doit retourner les colonnes suivantes :
-- - facture_id
-- - facture_num
-- - facture_dat
-- - nom (nom du client)
-- - facture_ht
-- - facture_tva
-- - facture_ttc
-- ============================================

-- IMPORTANT: Vous devez adapter cette requête selon votre structure de base de données réelle
-- Cette vue est un exemple et doit être adaptée à votre schéma

-- Vérifier si la vue existe déjà
IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'v_facture')
BEGIN
    DROP VIEW v_facture;
    PRINT 'Vue v_facture supprimée.';
END
GO

-- Créer la vue v_facture
-- NOTE: Vous devez adapter cette requête selon votre structure de base de données
CREATE VIEW v_facture AS
SELECT
    facture_id,
    facture_num,
    facture_dat,
    nom,
    facture_ht,
    facture_tva,
    facture_ttc
FROM [votre_table_facture]
-- Ajouter les jointures nécessaires selon votre structure
-- Exemple :
-- LEFT JOIN partenaire p ON p.part_id = f.part_id
-- WHERE ... (conditions si nécessaire)
GO

-- Vérifier que la vue a été créée
SELECT * FROM INFORMATION_SCHEMA.VIEWS WHERE TABLE_NAME = 'v_facture';
GO

PRINT 'Vue v_facture créée avec succès.';
GO

-- ============================================
-- Instructions pour adapter cette vue
-- ============================================
-- 1. Identifiez la table principale qui contient les factures
-- 2. Adaptez les colonnes selon votre schéma
-- 3. Ajoutez les jointures nécessaires pour obtenir le nom du client
-- 4. Vérifiez que toutes les colonnes existent dans votre base de données
-- ============================================



