const DocumentSociete = require('../models/document_societe.model');

class DocumentSocieteService {
  // Récupérer les documents d'une société
  async getDocumentSociete(societeId) {
    try {
      const documentSociete = await DocumentSociete.findOne({
        where: { societe_id: societeId }
      });

      if (!documentSociete) {
        return null;
      }

      return {
        id: documentSociete.id,
        societe_id: documentSociete.societe_id,
        logo: documentSociete.logo ? documentSociete.logo.toString('base64') : null,
        entete: documentSociete.entete,
        pied_page: documentSociete.pied_page,
        created_at: documentSociete.created_at,
        updated_at: documentSociete.updated_at
      };
    } catch (error) {
      throw new Error(`Erreur lors de la récupération des documents: ${error.message}`);
    }
  }

  // Créer ou mettre à jour les documents d'une société
  async saveDocumentSociete(societeId, documentData) {
    try {
      const { logo, entete, pied_page } = documentData;

      // Vérifier si des documents existent déjà pour cette société
      const existingDocument = await DocumentSociete.findOne({
        where: { societe_id: societeId }
      });

      let documentSociete;

      if (existingDocument) {
        // Mettre à jour les documents existants
        const updateData = {};
        
        if (logo) {
          // Convertir base64 en Buffer si nécessaire
          updateData.logo = Buffer.isBuffer(logo) ? logo : Buffer.from(logo, 'base64');
        }
        
        if (entete !== undefined) {
          updateData.entete = entete;
        }
        
        if (pied_page !== undefined) {
          updateData.pied_page = pied_page;
        }

        await existingDocument.update(updateData);
        documentSociete = existingDocument;
      } else {
        // Créer de nouveaux documents
        const createData = {
          societe_id: societeId,
          entete: entete || null,
          pied_page: pied_page || null
        };

        if (logo) {
          createData.logo = Buffer.isBuffer(logo) ? logo : Buffer.from(logo, 'base64');
        }

        documentSociete = await DocumentSociete.create(createData);
      }

      return {
        id: documentSociete.id,
        societe_id: documentSociete.societe_id,
        logo: documentSociete.logo ? documentSociete.logo.toString('base64') : null,
        entete: documentSociete.entete,
        pied_page: documentSociete.pied_page,
        created_at: documentSociete.created_at,
        updated_at: documentSociete.updated_at
      };
    } catch (error) {
      throw new Error(`Erreur lors de la sauvegarde des documents: ${error.message}`);
    }
  }

  // Supprimer les documents d'une société
  async deleteDocumentSociete(societeId) {
    try {
      const result = await DocumentSociete.destroy({
        where: { societe_id: societeId }
      });

      return result > 0;
    } catch (error) {
      throw new Error(`Erreur lors de la suppression des documents: ${error.message}`);
    }
  }

  // Récupérer uniquement le logo d'une société (pour les PDFs)
  async getLogo(societeId) {
    try {
      const documentSociete = await DocumentSociete.findOne({
        where: { societe_id: societeId },
        attributes: ['logo']
      });

      return documentSociete && documentSociete.logo ? documentSociete.logo : null;
    } catch (error) {
      throw new Error(`Erreur lors de la récupération du logo: ${error.message}`);
    }
  }

  // Récupérer uniquement l'en-tête d'une société
  async getEntete(societeId) {
    try {
      const documentSociete = await DocumentSociete.findOne({
        where: { societe_id: societeId },
        attributes: ['entete']
      });

      return documentSociete ? documentSociete.entete : null;
    } catch (error) {
      throw new Error(`Erreur lors de la récupération de l'en-tête: ${error.message}`);
    }
  }

  // Récupérer uniquement le pied de page d'une société
  async getPiedPage(societeId) {
    try {
      const documentSociete = await DocumentSociete.findOne({
        where: { societe_id: societeId },
        attributes: ['pied_page']
      });

      return documentSociete ? documentSociete.pied_page : null;
    } catch (error) {
      throw new Error(`Erreur lors de la récupération du pied de page: ${error.message}`);
    }
  }
}

module.exports = new DocumentSocieteService();
