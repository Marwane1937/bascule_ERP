import { Injectable } from '@angular/core';
import { AuthService, UserPermission } from './auth.service';
import { MenuItem, MenuCategory } from './user-permissions.service';

@Injectable({
  providedIn: 'root'
})
export class PermissionsService {
  // Mapping entre les routes et les noms des interfaces
  private routeToMenuNameMap: { [key: string]: string } = {
    '/Client': 'Client',
    '/Employe': 'Employé',
    '/Fournisseur': 'Fournisseur',
    '/Commercial': 'Commercial',
    '/Produit': 'Produit',
    '/Warehouse': 'Warehouse',
    '/Famille': 'Famille',
    '/Ville': 'Ville',
    '/Banque': 'Banque',
    '/Beneficiaire': 'Bénéficiaire',
    '/Departement': 'Département',
    '/Unite': 'Unité',
    '/Devis': 'Devis',
    '/Commande': 'Commande Client',
    '/Livraison': 'Livraison',
    '/Retour': 'Retour Client',
    '/Avoir': 'Avoir Client',
    '/Facturation': 'Facturation',
    '/Contrat': 'Contrat',
    '/Demande-Achat': 'Demande d\'achat',
    '/Bon-Commande': 'Bon de commande',
    '/Reception': 'Réception',
    '/Reglement': 'Règlements',
    '/Finance/Bordereau-Remise': 'Bordereau de Remise',
    '/Caisse': 'Caisse',
    '/Caisse-Recette-Depense': 'Recette/Dépense',
    '/Caisse-Recettes': 'Recette/Dépense',
    '/Caisse-Depenses': 'Recette/Dépense',
    '/Stock/Preparation': 'Préparation',
    '/Stock/Entrepot': 'Entrepôt',
    '/Stock/Sortie': 'Sortie Stock',
    '/Stock/Inventaire': 'Inventaire Stock',
    '/Stock/Historique': 'Historique Stock',
    '/Stock/Reporting': 'Reporting Stock',
    '/Vente/Reporting': 'Reporting Vente',
    '/Finance/Reporting': 'Reporting Finance',
    '/Interventions': 'Gestion Interventions',
    '/Interventions/Nouvelle': 'Nouvelle Intervention',
    '/Users': 'Utilisateurs',
    '/User-Permissions': 'Permissions Utilisateurs',
    '/Listes': 'Listes',
    '/Compteur': 'Compteur'
  };

  constructor(private authService: AuthService) {}

  // Helper pour vÃ©rifier l'accÃ¨s (gÃ¨re diffÃ©rents formats)
  private checkAccess(access: number | boolean | string | undefined): boolean {
    if (access === undefined || access === null) {
      return false;
    }
    
    // Si c'est dÃ©jÃ  un boolÃ©en true, retourner true immÃ©diatement
    if (access === true) {
      return true;
    }
    
    // Si c'est dÃ©jÃ  un boolÃ©en false, retourner false immÃ©diatement
    if (access === false) {
      return false;
    }
    
    // Si c'est dÃ©jÃ  un nombre 1, retourner true
    if (access === 1) {
      return true;
    }
    
    // Si c'est dÃ©jÃ  un nombre 0, retourner false
    if (access === 0) {
      return false;
    }
    
    // Convertir en string pour comparaison
    const accessStr = String(access).trim().toLowerCase();
    const hasAccess = accessStr === '1' || accessStr === 'true';
    
    return hasAccess;
  }

  // VÃ©rifier si l'utilisateur a accÃ¨s Ã  une route
  /**
   * VÃ©rifier si l'utilisateur a une permission spÃ©cifique
   */
  hasPermission(permission: string): boolean {
    return this.authService.hasPermission(permission);
  }

  hasAccessToRoute(route: string): boolean {
    const menuName = this.routeToMenuNameMap[route];
    if (!menuName) {
      // Si la route n'est pas dans le mapping, autoriser par dÃ©faut (pour les routes publiques)
      return true;
    }
    return this.authService.hasPermission(menuName);
  }

  // Filtrer les catÃ©gories de menu selon les permissions
  filterMenuCategories(categories: MenuCategory[]): MenuCategory[] {
    const permissions = this.authService.getUserPermissions();
    const currentUser = this.authService.getCurrentUser();
    
    // Si l'utilisateur est admin (type 1), afficher toutes les catÃ©gories
    if (currentUser && currentUser.type === 1) {
      return categories;
    }
    
    // Si l'utilisateur n'a pas de permissions, ne rien afficher (ou afficher un message)
    if (!permissions || permissions.length === 0) {
      return [];
    }
    
    const filtered = categories.map(category => {
      const filteredItems = category.items.filter(item => {
        // Exclure les items PDF du menu (ceux qui commencent par "pdf_" ou ont une route vide avec un nom PDF)
        const itemName = String(item.name || '').trim().toLowerCase();
        if (itemName.startsWith('pdf_') || (item.route === '' && itemName.includes('pdf'))) {
          return false; // Ne pas afficher les PDFs dans le menu
        }
        
        // Chercher une permission exacte pour l'item (comparaison exacte)
        let permission = permissions.find(p => {
          const dbName = String(p.menu_item || '').trim();
          const itemName = String(item.name || '').trim();
          return dbName === itemName;
        });
        
        // Si pas trouvÃ©, chercher avec comparaison insensible Ã  la casse
        if (!permission) {
          permission = permissions.find(p => {
            const dbName = String(p.menu_item || '').trim().toLowerCase();
            const itemName = String(item.name || '').trim().toLowerCase();
            return dbName === itemName;
          });
        }
        
        // Si pas trouvÃ©, chercher une permission pour la catÃ©gorie (pour compatibilitÃ©)
        if (!permission) {
          permission = permissions.find(p => {
            const dbName = String(p.menu_item || '').trim();
            const categoryName = String(category.category || '').trim();
            return dbName === categoryName;
          });
        }
        
        // GÃ©rer les alias hÃ©ritÃ©s comme Recettes/DÃ©penses -> Caisse
        const hasAccess = this.authService.hasPermission(String(item.name || '').trim())
          || (permission ? this.checkAccess(permission.access) : false);
        
        return hasAccess;
      });

      return {
        ...category,
        items: filteredItems
      };
    }).filter(category => category.items.length > 0); // Retirer les catÃ©gories vides
    
    return filtered;
  }

  // Filtrer les items d'une catÃ©gorie selon les permissions
  filterMenuItems(items: MenuItem[]): MenuItem[] {
    const currentUser = this.authService.getCurrentUser();
    
    // Si l'utilisateur est admin, tout autoriser
    if (currentUser && currentUser.type === 1) {
      return items;
    }

    return items.filter(item => this.authService.hasPermission(item.name));
  }
}

