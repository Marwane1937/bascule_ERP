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
    '/Famille': 'Famille',
    '/Devis': 'Devis',
    '/Commande': 'Commande Client',
    '/Livraison': 'Livraison',
    '/Retour': 'Retour Client',
    '/Avoir': 'Avoir Client',
    '/Facturation': 'Facturation',
    '/Bon-Commande': 'Bon de commande',
    '/Reglement': 'Règlements',
    '/Caisse': 'Caisse',
    '/Caisse-Recettes': 'Recettes',
    '/Caisse-Depenses': 'Dépenses',
    '/Users': 'Utilisateurs',
    '/User-Permissions': 'Permissions Utilisateurs',
    '/Listes': 'Listes'
  };

  constructor(private authService: AuthService) {}

  // Helper pour vérifier l'accès (gère différents formats)
  private checkAccess(access: number | boolean | string | undefined): boolean {
    if (access === undefined || access === null) {
      return false;
    }
    
    // Si c'est déjà un booléen true, retourner true immédiatement
    if (access === true) {
      return true;
    }
    
    // Si c'est déjà un booléen false, retourner false immédiatement
    if (access === false) {
      return false;
    }
    
    // Si c'est déjà un nombre 1, retourner true
    if (access === 1) {
      return true;
    }
    
    // Si c'est déjà un nombre 0, retourner false
    if (access === 0) {
      return false;
    }
    
    // Convertir en string pour comparaison
    const accessStr = String(access).trim().toLowerCase();
    const hasAccess = accessStr === '1' || accessStr === 'true';
    
    return hasAccess;
  }

  // Vérifier si l'utilisateur a accès à une route
  /**
   * Vérifier si l'utilisateur a une permission spécifique
   */
  hasPermission(permission: string): boolean {
    const permissions = this.authService.getUserPermissions();
    const hasPermission = permissions.some(p => 
      p.menu_item === permission && this.checkAccess(p.access)
    );
    
    // Les admins ont tous les droits (type === 1)
    const currentUser = this.authService.getCurrentUser();
    const isAdmin = currentUser && currentUser.type === 1;
    
    return hasPermission || isAdmin || false;
  }

  hasAccessToRoute(route: string): boolean {
    const menuName = this.routeToMenuNameMap[route];
    if (!menuName) {
      // Si la route n'est pas dans le mapping, autoriser par défaut (pour les routes publiques)
      return true;
    }
    return this.authService.hasPermission(menuName);
  }

  // Filtrer les catégories de menu selon les permissions
  filterMenuCategories(categories: MenuCategory[]): MenuCategory[] {
    const permissions = this.authService.getUserPermissions();
    const currentUser = this.authService.getCurrentUser();
    
    // Si l'utilisateur est admin (type 1), afficher toutes les catégories
    if (currentUser && currentUser.type === 1) {
      return categories;
    }
    
    // Si l'utilisateur n'a pas de permissions, ne rien afficher (ou afficher un message)
    if (!permissions || permissions.length === 0) {
      return [];
    }
    
    const filtered = categories.map(category => {
      const filteredItems = category.items.filter(item => {
        // Chercher une permission exacte pour l'item (comparaison exacte)
        let permission = permissions.find(p => {
          const dbName = String(p.menu_item || '').trim();
          const itemName = String(item.name || '').trim();
          return dbName === itemName;
        });
        
        // Si pas trouvé, chercher avec comparaison insensible à la casse
        if (!permission) {
          permission = permissions.find(p => {
            const dbName = String(p.menu_item || '').trim().toLowerCase();
            const itemName = String(item.name || '').trim().toLowerCase();
            return dbName === itemName;
          });
        }
        
        // Si pas trouvé, chercher une permission pour la catégorie (pour compatibilité)
        if (!permission) {
          permission = permissions.find(p => {
            const dbName = String(p.menu_item || '').trim();
            const categoryName = String(category.category || '').trim();
            return dbName === categoryName;
          });
        }
        
        // Gérer les deux formats : 1/0 (int) ou true/false (bool) ou '1'/'0' (string)
        const hasAccess = permission ? this.checkAccess(permission.access) : false;
        
        return hasAccess;
      });

      return {
        ...category,
        items: filteredItems
      };
    }).filter(category => category.items.length > 0); // Retirer les catégories vides
    
    return filtered;
  }

  // Filtrer les items d'une catégorie selon les permissions
  filterMenuItems(items: MenuItem[]): MenuItem[] {
    const permissions = this.authService.getUserPermissions();
    const currentUser = this.authService.getCurrentUser();
    
    // Si l'utilisateur est admin, tout autoriser
    if (currentUser && currentUser.type === 1) {
      return items;
    }

    return items.filter(item => {
      const permission = permissions.find(p => p.menu_item === item.name);
      // Utiliser checkAccess pour gérer les différents formats (booléen, nombre, string)
      return permission ? this.checkAccess(permission.access) : false;
    });
  }
}

