-- Création des tables pour la gestion du stock
-- À exécuter dans la base de données

-- Table stock_document : Documents de stock (inventaire, entrées, sorties)
CREATE TABLE stock_document (
    id INT IDENTITY(1,1) PRIMARY KEY,
    numero VARCHAR(50) NOT NULL UNIQUE,
    date DATETIME DEFAULT GETDATE(),
    type INT NOT NULL, -- 20: Inventaire, 21: Entrée, 22: Sortie
    description TEXT,
    reference_source VARCHAR(255), -- référence du document source (achat_document, etc.)
    id_source INT, -- ID du document source
    utilisateur_id INT, -- utilisateur qui a créé le document
    date_creation DATETIME DEFAULT GETDATE(),
    valide BIT DEFAULT 0 -- 0: en cours, 1: validé
);

-- Table stock_document_detail : Détails des mouvements de stock
CREATE TABLE stock_document_detail (
    id INT IDENTITY(1,1) PRIMARY KEY,
    stock_document_id INT NOT NULL,
    article_id INT NOT NULL,
    quantite DECIMAL(18,3) NOT NULL,
    prix DECIMAL(18,3),
    taux_tva DECIMAL(5,2),
    sens INT DEFAULT 1, -- 1: entrée, -1: sortie
    date_creation DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (stock_document_id) REFERENCES stock_document(id) ON DELETE CASCADE,
    FOREIGN KEY (article_id) REFERENCES article(article_id)
);

-- Ajouter des colonnes pour gérer le stock initial et stock normal dans la table article
-- stock_initial : stock issu du dernier inventaire validé
-- stock_normal : stock courant qui évolue avec les entrées/sorties
ALTER TABLE article ADD stock_initial DECIMAL(18,3) DEFAULT 0;
ALTER TABLE article ADD stock_normal DECIMAL(18,3) DEFAULT 0;

-- Initialiser les stocks normaux avec les valeurs existantes si elles existent
-- (Cette requête peut être adaptée selon les données existantes)

-- Table pour marquer les documents de réception comme traités
-- Ajouter une colonne pour indiquer si un achat_document a été traité en entrée de stock
ALTER TABLE achat_document ADD stock_entree_traite BIT DEFAULT 0;

-- Créer un index pour optimiser les performances
CREATE INDEX idx_stock_document_type ON stock_document(type);
CREATE INDEX idx_stock_document_date ON stock_document(date);
CREATE INDEX idx_stock_document_detail_article ON stock_document_detail(article_id);
CREATE INDEX idx_stock_document_detail_document ON stock_document_detail(stock_document_id);

-- Insérer quelques données de test (optionnel)
-- INSERT INTO stock_document (numero, type, description) VALUES ('INV001', 20, 'Premier inventaire');
-- INSERT INTO stock_document (numero, type, description) VALUES ('ENT001', 21, 'Première entrée');
-- INSERT INTO stock_document (numero, type, description) VALUES ('SOR001', 22, 'Première sortie');








