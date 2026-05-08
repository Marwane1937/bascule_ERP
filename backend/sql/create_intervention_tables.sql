-- ===========================================
-- SCRIPT DE CRÉATION DES TABLES INTERVENTIONS
-- ===========================================

USE [votre_base_de_donnees];
GO

-- ===========================================
-- TABLE: intervention
-- ===========================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='intervention' AND xtype='U')
BEGIN
    CREATE TABLE intervention (
        id INT IDENTITY(1,1) PRIMARY KEY,
        numero VARCHAR(50) UNIQUE NOT NULL,
        date_intervention DATETIME DEFAULT GETDATE(),
        technicien_id INT NOT NULL,
        client_id INT NOT NULL,
        vehicule_id INT NULL,
        description TEXT,
        statut VARCHAR(20) DEFAULT 'EN_COURS',
        date_creation DATETIME DEFAULT GETDATE(),
        pdf_telegram_file_id VARCHAR(255) NULL,

        -- Contraintes de clés étrangères
        CONSTRAINT FK_intervention_technicien FOREIGN KEY (technicien_id)
            REFERENCES employe(id),
        CONSTRAINT FK_intervention_client FOREIGN KEY (client_id)
            REFERENCES client(id),
        CONSTRAINT FK_intervention_vehicule FOREIGN KEY (vehicule_id)
            REFERENCES vehicule(id),

        -- Contrainte de statut
        CONSTRAINT CHK_intervention_statut CHECK (statut IN ('EN_COURS', 'TERMINEE', 'ANNULEE'))
    );

    PRINT '✅ Table intervention créée avec succès';
END
ELSE
BEGIN
    PRINT '⚠️ La table intervention existe déjà';
END
GO

-- ===========================================
-- TABLE: intervention_detail
-- ===========================================
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='intervention_detail' AND xtype='U')
BEGIN
    CREATE TABLE intervention_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        intervention_id INT NOT NULL,
        description_reparation TEXT NOT NULL,
        cout_main_oeuvre DECIMAL(10,2) DEFAULT 0,
        cout_pieces DECIMAL(10,2) DEFAULT 0,
        temps_estime DECIMAL(4,2) NULL, -- en heures
        date_creation DATETIME DEFAULT GETDATE(),

        -- Contrainte de clé étrangère
        CONSTRAINT FK_intervention_detail_intervention FOREIGN KEY (intervention_id)
            REFERENCES intervention(id) ON DELETE CASCADE,

        -- Contraintes de valeurs positives
        CONSTRAINT CHK_detail_cout_main_oeuvre CHECK (cout_main_oeuvre >= 0),
        CONSTRAINT CHK_detail_cout_pieces CHECK (cout_pieces >= 0),
        CONSTRAINT CHK_detail_temps_estime CHECK (temps_estime > 0)
    );

    PRINT '✅ Table intervention_detail créée avec succès';
END
ELSE
BEGIN
    PRINT '⚠️ La table intervention_detail existe déjà';
END
GO

-- ===========================================
-- INDEX POUR LES PERFORMANCES
-- ===========================================

-- Index sur la table intervention
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_intervention_numero')
BEGIN
    CREATE INDEX IDX_intervention_numero ON intervention(numero);
    PRINT '✅ Index IDX_intervention_numero créé';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_intervention_date')
BEGIN
    CREATE INDEX IDX_intervention_date ON intervention(date_intervention);
    PRINT '✅ Index IDX_intervention_date créé';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_intervention_statut')
BEGIN
    CREATE INDEX IDX_intervention_statut ON intervention(statut);
    PRINT '✅ Index IDX_intervention_statut créé';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_intervention_technicien')
BEGIN
    CREATE INDEX IDX_intervention_technicien ON intervention(technicien_id);
    PRINT '✅ Index IDX_intervention_technicien créé';
END

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_intervention_client')
BEGIN
    CREATE INDEX IDX_intervention_client ON intervention(client_id);
    PRINT '✅ Index IDX_intervention_client créé';
END

-- Index sur la table intervention_detail
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IDX_intervention_detail_intervention')
BEGIN
    CREATE INDEX IDX_intervention_detail_intervention ON intervention_detail(intervention_id);
    PRINT '✅ Index IDX_intervention_detail_intervention créé';
END

-- ===========================================
-- DONNÉES DE TEST (OPTIONNEL)
-- ===========================================

-- Insérer des données de test seulement si la table est vide
IF NOT EXISTS (SELECT 1 FROM intervention)
BEGIN
    PRINT '📝 Insertion de données de test...';

    -- Intervention de test 1
    INSERT INTO intervention (numero, date_intervention, technicien_id, client_id, vehicule_id, description, statut)
    VALUES ('INT240001', '2024-01-15 09:00:00', 1, 1, NULL, 'Révision complète du véhicule', 'TERMINEE');

    -- Détails de réparation pour l'intervention 1
    INSERT INTO intervention_detail (intervention_id, description_reparation, cout_main_oeuvre, cout_pieces, temps_estime)
    VALUES
    (1, 'Changement filtre à huile', 25.00, 15.50, 0.5),
    (1, 'Vidange complète', 45.00, 35.00, 1.0),
    (1, 'Contrôle freins', 30.00, 0.00, 0.75);

    -- Intervention de test 2
    INSERT INTO intervention (numero, date_intervention, technicien_id, client_id, vehicule_id, description, statut)
    VALUES ('INT240002', '2024-01-16 14:30:00', 1, 2, NULL, 'Réparation système électrique', 'EN_COURS');

    -- Détails de réparation pour l'intervention 2
    INSERT INTO intervention_detail (intervention_id, description_reparation, cout_main_oeuvre, cout_pieces, temps_estime)
    VALUES
    (2, 'Diagnostic électrique', 50.00, 0.00, 2.0),
    (2, 'Remplacement alternateur', 120.00, 85.00, 3.0);

    PRINT '✅ Données de test insérées';
END
ELSE
BEGIN
    PRINT 'ℹ️ La table intervention contient déjà des données, pas d\'insertion de test';
END

-- ===========================================
-- VÉRIFICATION FINALE
-- ===========================================

PRINT '🔍 Vérification des tables créées...';

-- Vérifier que les tables existent
SELECT
    t.name AS table_name,
    p.rows AS row_count
FROM sys.tables t
INNER JOIN sys.partitions p ON t.object_id = p.object_id AND p.index_id IN (0,1)
WHERE t.name IN ('intervention', 'intervention_detail')
ORDER BY t.name;

PRINT '✅ Script d\'installation terminé avec succès!';
PRINT '';
PRINT '📋 Prochaines étapes:';
PRINT '1. Vérifier que les tables sont créées';
PRINT '2. Tester l\'insertion de données';
PRINT '3. Configurer les permissions utilisateur';
PRINT '4. Tester l\'envoi de PDF via Telegram';

GO

















