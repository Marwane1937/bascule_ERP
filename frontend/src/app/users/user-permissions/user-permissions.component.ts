import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { UserService, User } from '../../service/user.service';
import { UserPermissionsService, UserPermission, MenuCategory } from '../../service/user-permissions.service';
import { AuthService } from '../../service/auth.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-user-permissions',
  templateUrl: './user-permissions.component.html',
  styleUrls: ['./user-permissions.component.css']
})
export class UserPermissionsComponent implements OnInit {
  users: User[] = [];
  selectedUserId: number | null = null;
  selectedUser: User | null = null;
  userPermissions: UserPermission[] = [];
  menuCategories: MenuCategory[] = [];
  loading: boolean = false;
  saving: boolean = false;
  expandedItems: { [key: string]: boolean } = {}; // Stocker l'état expanded par clé unique

  // S'assurer que les tableaux sont toujours des tableaux
  get safeUsers(): User[] {
    return Array.isArray(this.users) ? this.users : [];
  }

  get safeMenuCategories(): MenuCategory[] {
    return Array.isArray(this.menuCategories) ? this.menuCategories : [];
  }

  // Organiser les items en structure arborescente
  get organizedMenuCategories(): any[] {
    return this.safeMenuCategories.map(category => {
      const organizedItems: any[] = [];
      const pdfItemsMap: { [key: string]: any[] } = {};
      const regularItems: any[] = [];

      // Séparer les items PDF des items réguliers
      category.items.forEach(item => {
        if (item.name.startsWith('pdf_')) {
          // Extraire le type de PDF (ex: pdf_devis_normal -> devis)
          const pdfType = item.name.split('_')[1];
          if (!pdfItemsMap[pdfType]) {
            pdfItemsMap[pdfType] = [];
          }
          pdfItemsMap[pdfType].push(item);
        } else {
          regularItems.push(item);
        }
      });

      // Mapping explicite des interfaces aux types PDF (uniquement Ventes et Achats)
      const interfaceToPdfTypeMap: { [key: string]: string[] } = {
        // Ventes uniquement
        'devis': ['devis'],
        'commande client': ['commande'],
        'livraison': ['livraison'],
        'retour client': ['retour'],
        'avoir client': ['avoir'],
        'facturation': ['facturation'],
        // Achats uniquement
        'demande d\'achat': ['demande_achat'],
        'bon de commande': ['bon_commande'],
        'facture fournisseur': ['facture_fournisseur'],
        'réception': ['reception']
      };

      // Fonction pour trouver les PDFs associés à une interface
      const findPdfChildren = (itemName: string): any[] => {
        const itemNameLower = itemName.toLowerCase();
        const pdfChildren: any[] = [];
        
        // Chercher dans le mapping explicite
        Object.keys(interfaceToPdfTypeMap).forEach(interfaceKey => {
          if (itemNameLower.includes(interfaceKey)) {
            const pdfTypes = interfaceToPdfTypeMap[interfaceKey];
            pdfTypes.forEach(pdfType => {
              // Chercher tous les PDFs qui commencent par pdf_[type]_
              Object.keys(pdfItemsMap).forEach(pdfTypeKey => {
                pdfItemsMap[pdfTypeKey].forEach((pdfItem: any) => {
                  const pdfItemType = pdfItem.name.split('_')[1];
                  if (pdfItemType === pdfType || pdfItem.name.startsWith(`pdf_${pdfType}_`)) {
                    if (!pdfChildren.some(child => child.name === pdfItem.name)) {
                      pdfChildren.push(pdfItem);
                    }
                  }
                });
              });
            });
          }
        });
        
        return pdfChildren;
      };

      // Organiser les items réguliers avec leurs PDFs associés
      regularItems.forEach(item => {
        const pdfChildren = findPdfChildren(item.name);
        const hasPdfChildren = pdfChildren.length > 0;
        
        // Nettoyer les PDFs qui ont été assignés
        if (hasPdfChildren) {
          Object.keys(pdfItemsMap).forEach(pdfTypeKey => {
            pdfItemsMap[pdfTypeKey] = pdfItemsMap[pdfTypeKey].filter((pdfItem: any) => 
              !pdfChildren.some((child: any) => child.name === pdfItem.name)
            );
            if (pdfItemsMap[pdfTypeKey].length === 0) {
              delete pdfItemsMap[pdfTypeKey];
            }
          });
        }

        const itemKey = `${category.category}_${item.name}`;
        organizedItems.push({
          ...item,
          isParent: hasPdfChildren,
          children: pdfChildren,
          itemKey: itemKey,
          expanded: this.expandedItems[itemKey] || false
        });
      });

      // Ajouter les PDFs restants qui n'ont pas de parent
      Object.values(pdfItemsMap).forEach(pdfItems => {
        pdfItems.forEach(pdfItem => {
          organizedItems.push({
            ...pdfItem,
            isParent: false,
            children: []
          });
        });
      });

      return {
        ...category,
        items: organizedItems
      };
    });
  }

  toggleItemExpansion(item: any): void {
    if (item.isParent && item.itemKey) {
      this.expandedItems[item.itemKey] = !this.expandedItems[item.itemKey];
      item.expanded = this.expandedItems[item.itemKey];
    }
  }

  getPdfDisplayName(pdfName: string): string {
    // Convertir pdf_devis_normal -> Devis Normal
    // pdf_livraison_non_valorise -> Livraison Non Valorisé
    // pdf_devis_nomenclature -> Devis Nomenclature
    const parts = pdfName.split('_');
    if (parts.length >= 3 && parts[0] === 'pdf') {
      const type = parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
      const modeParts = parts.slice(2);
      
      // Traductions spéciales
      const modeTranslations: { [key: string]: string } = {
        'normal': 'Normal',
        'nomenclature': 'Nomenclature',
        'non': 'Non',
        'valorise': 'Valorisé',
        'non_valorise': 'Non Valorisé'
      };
      
      const mode = modeParts.map(p => {
        const fullMode = modeParts.join('_');
        if (modeTranslations[fullMode]) {
          return modeTranslations[fullMode];
        }
        return modeTranslations[p] || (p.charAt(0).toUpperCase() + p.slice(1));
      }).join(' ');
      
      // Si c'est "non_valorise", retourner directement la traduction
      if (modeParts.join('_') === 'non_valorise') {
        return `${type} Non Valorisé`;
      }
      
      return `${type} ${mode}`;
    }
    return pdfName;
  }

  constructor(
    private userService: UserService,
    private userPermissionsService: UserPermissionsService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadUsers();
    this.loadMenuItems();
  }

  loadUsers(): void {
    // Vérifier si l'utilisateur est toujours connecté
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      // Si l'utilisateur n'est plus connecté, ne pas charger les utilisateurs
      return;
    }

    this.loading = true;
    this.userService.getAllUsers().subscribe({
      next: (response: any) => {
        // Extraire les données de la réponse { success: true, data: [...] }
        this.users = response?.data || response || [];
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        // Ne pas afficher l'erreur si l'utilisateur n'est plus connecté (déconnexion en cours)
        const currentUser = this.authService.getCurrentUser();
        if (currentUser) {
          Swal.fire({
            title: 'Erreur',
            text: 'Impossible de charger les utilisateurs',
            icon: 'error'
          });
        }
      }
    });
  }

  loadMenuItems(): void {
    this.userPermissionsService.getAvailableMenuItems().subscribe({
      next: (response: any) => {
        if (response.success) {
          this.menuCategories = response.data || [];
        } else {
          this.menuCategories = [];
        }
      },
      error: (error) => {
        this.menuCategories = [];
      }
    });
  }

  onUserSelect(userId: number | null): void {
    if (!userId) {
      this.selectedUser = null;
      this.selectedUserId = null;
      this.userPermissions = [];
      return;
    }
    const user = this.users.find(u => u.id === userId);
    if (user) {
      this.selectedUser = user;
      this.selectedUserId = userId;
      this.loadUserPermissions(userId);
    }
  }

  loadUserPermissions(userId: number): void {
    this.loading = true;
    this.userPermissionsService.getUserPermissions(userId).subscribe({
      next: (response: any) => {
        if (response.success) {
          this.userPermissions = response.data || [];
          // S'assurer que toutes les permissions sont initialisées pour chaque item de menu
          this.initializePermissions();
        } else {
          this.userPermissions = [];
        }
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        Swal.fire({
          title: 'Erreur',
          text: 'Impossible de charger les permissions',
          icon: 'error'
        });
      }
    });
  }

  // Initialiser les permissions pour tous les items de menu
  initializePermissions(): void {
    if (!this.selectedUser) return;

    // Parcourir toutes les catégories et leurs items
    this.safeMenuCategories.forEach(category => {
      category.items.forEach(item => {
        // Vérifier si une permission existe déjà pour cet item
        const existingPermission = this.userPermissions.find(
          p => p.menu_item === item.name
        );

        if (!existingPermission) {
          // Si aucune permission n'existe, créer une entrée avec access = 0
          this.userPermissions.push({
            user_id: this.selectedUser!.id,
            menu_item: item.name,
            access: 0
          });
        }
      });
    });
  }

  hasPermission(menuItemName: string): boolean {
    const permission = this.userPermissions.find(p => p.menu_item === menuItemName);
    if (!permission) {
      return false;
    }
    // Gérer les différents formats : 1, true, '1', 'true'
    const access = permission.access;
    return access === 1 || access === true || access === '1' || access === 'true';
  }

  togglePermission(menuItemName: string): void {
    if (!this.selectedUser) return;

    // Vérifier l'état actuel AVANT de modifier
    const isCurrentlyActive = this.hasPermission(menuItemName);
    const newAccessValue = isCurrentlyActive ? 0 : 1;

    const existingPermission = this.userPermissions.find(p => p.menu_item === menuItemName);
    
    if (existingPermission) {
      // Mettre à jour la permission existante
      existingPermission.access = newAccessValue;
    } else {
      // Créer une nouvelle permission
      this.userPermissions.push({
        user_id: this.selectedUser.id,
        menu_item: menuItemName,
        access: newAccessValue
      });
    }

    // Si on décoche une interface parente, décocher aussi tous ses enfants PDF
    if (newAccessValue === 0 && this.selectedUser) {
      const selectedUserId = this.selectedUser.id; // Stocker l'ID pour éviter les problèmes TypeScript
      // Trouver l'item dans les catégories organisées pour obtenir ses enfants
      for (const category of this.organizedMenuCategories) {
        const parentItem = category.items.find((item: any) => item.name === menuItemName && item.isParent);
        if (parentItem && parentItem.children) {
          parentItem.children.forEach((child: any) => {
            const childPermission = this.userPermissions.find(p => p.menu_item === child.name);
            if (childPermission) {
              childPermission.access = 0;
            } else {
              // Créer une permission avec access = 0 pour les enfants PDF
              this.userPermissions.push({
                user_id: selectedUserId,
                menu_item: child.name,
                access: 0
              });
            }
          });
        }
      }
    }
  }

  // Vérifier si tous les items d'une catégorie sont cochés (incluant les enfants)
  isAllCategoryItemsChecked(category: any): boolean {
    if (!category.items || category.items.length === 0) {
      return false;
    }
    return category.items.every((item: any) => {
      const itemChecked = this.hasPermission(item.name);
      if (item.isParent && item.children) {
        const allChildrenChecked = item.children.every((child: any) => this.hasPermission(child.name));
        return itemChecked && allChildrenChecked;
      }
      return itemChecked;
    });
  }

  // Vérifier si au moins un item de la catégorie est coché (incluant les enfants)
  isSomeCategoryItemsChecked(category: any): boolean {
    if (!category.items || category.items.length === 0) {
      return false;
    }
    return category.items.some((item: any) => {
      const itemChecked = this.hasPermission(item.name);
      if (item.isParent && item.children) {
        const someChildrenChecked = item.children.some((child: any) => this.hasPermission(child.name));
        return itemChecked || someChildrenChecked;
      }
      return itemChecked;
    });
  }

  // Cocher/Décocher tous les items d'une catégorie (incluant les enfants)
  toggleCategoryPermissions(category: any): void {
    if (!this.selectedUser) return;

    const allChecked = this.isAllCategoryItemsChecked(category);
    const newAccessValue = allChecked ? 0 : 1;

    const toggleItem = (item: any) => {
      const existingPermission = this.userPermissions.find(p => p.menu_item === item.name);
      
      if (existingPermission) {
        existingPermission.access = newAccessValue;
      } else {
        this.userPermissions.push({
          user_id: this.selectedUser!.id,
          menu_item: item.name,
          access: newAccessValue
        });
      }

      // Si l'item a des enfants, les cocher aussi
      if (item.isParent && item.children) {
        item.children.forEach((child: any) => toggleItem(child));
      }
    };

    category.items.forEach((item: any) => toggleItem(item));
  }

  savePermissions(): void {
    if (!this.selectedUser) {
      Swal.fire({
        title: 'Attention',
        text: 'Veuillez sélectionner un utilisateur',
        icon: 'warning'
      });
      return;
    }

    // S'assurer que toutes les permissions sont présentes (y compris celles avec access = 0)
    const allPermissions: any[] = [];
    this.safeMenuCategories.forEach(category => {
      category.items.forEach(item => {
        const existingPermission = this.userPermissions.find(p => p.menu_item === item.name);
        if (existingPermission) {
          // Copier la permission existante avec la valeur d'access normalisée
          const normalizedAccess = this.normalizeAccessValue(existingPermission.access);
          allPermissions.push({
            user_id: this.selectedUser!.id,
            menu_item: item.name,
            access: normalizedAccess
          });
        } else {
          // Si pas de permission trouvée, créer une avec access = 0
          allPermissions.push({
            user_id: this.selectedUser!.id,
            menu_item: item.name,
            access: 0
          });
        }
      });
    });

    this.saving = true;
    this.userPermissionsService.updateUserPermissions(
      this.selectedUser.id,
      allPermissions
    ).subscribe({
      next: (response) => {
        this.saving = false;
        
        if (!this.selectedUser) return;
        
        // Vérifier si l'utilisateur modifié est l'utilisateur actuellement connecté
        const currentUser = this.authService.getCurrentUser();
        const isCurrentUser = currentUser && currentUser.id === this.selectedUser.id;
        
        if (isCurrentUser) {
          // Afficher une SweetAlert pour demander si l'utilisateur veut se déconnecter
          Swal.fire({
            title: 'Permissions mises à jour avec succès',
            text: 'Voulez-vous vous déconnecter pour appliquer les nouvelles autorisations ?',
            icon: 'success',
            showCancelButton: true,
            confirmButtonText: 'Oui, me déconnecter',
            cancelButtonText: 'Non, rester connecté',
            confirmButtonColor: '#dc3545',
            cancelButtonColor: '#6c757d'
          }).then((result) => {
            if (result.isConfirmed) {
              // Déconnecter l'utilisateur
              this.authService.logout();
              // Rediriger vers la page de login
              this.router.navigate(['/login']);
            } else {
              // Recharger les permissions sans déconnecter
              this.loadUserPermissions(this.selectedUser!.id);
            }
          });
        } else {
          // Si ce n'est pas l'utilisateur actuel, juste afficher le succès
          Swal.fire({
            title: 'Succès',
            text: 'Permissions mises à jour avec succès',
            icon: 'success'
          });
          // Recharger les permissions
          this.loadUserPermissions(this.selectedUser!.id);
        }
      },
      error: (error) => {
        this.saving = false;
        Swal.fire({
          title: 'Erreur',
          text: 'Impossible de sauvegarder les permissions',
          icon: 'error'
        });
      }
    });
  }

  // Normaliser la valeur d'access (convertir true/false en 1/0)
  private normalizeAccessValue(access: any): number {
    if (access === true || access === 'true' || access === '1' || access === 1) {
      return 1;
    }
    return 0;
  }

  resetPassword(): void {
    if (!this.selectedUser) {
      Swal.fire({
        title: 'Attention',
        text: 'Veuillez sélectionner un utilisateur',
        icon: 'warning'
      });
      return;
    }

    Swal.fire({
      title: 'Réinitialiser le mot de passe',
      html: `
        <div class="form-group">
          <label>Nouveau mot de passe</label>
          <input type="password" id="newPassword" class="form-control" placeholder="Nouveau mot de passe">
        </div>
        <div class="form-group">
          <label>Confirmer le mot de passe</label>
          <input type="password" id="confirmPassword" class="form-control" placeholder="Confirmer le mot de passe">
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Réinitialiser',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#ffc107',
      preConfirm: () => {
        const newPassword = (document.getElementById('newPassword') as HTMLInputElement).value;
        const confirmPassword = (document.getElementById('confirmPassword') as HTMLInputElement).value;

        if (!newPassword || !confirmPassword) {
          Swal.showValidationMessage('Les deux champs sont obligatoires');
          return false;
        }

        if (newPassword !== confirmPassword) {
          Swal.showValidationMessage('Les mots de passe ne correspondent pas');
          return false;
        }

        if (newPassword.length < 6) {
          Swal.showValidationMessage('Le mot de passe doit contenir au moins 6 caractères');
          return false;
        }

        return { password: newPassword };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.userService.resetPassword(this.selectedUser!.id, result.value.password).subscribe({
          next: (response) => {
            Swal.fire({
              title: 'Succès',
              text: 'Mot de passe réinitialisé avec succès',
              icon: 'success'
            });
          },
          error: (error) => {
            Swal.fire({
              title: 'Erreur',
              text: 'Impossible de réinitialiser le mot de passe',
              icon: 'error'
            });
          }
        });
      }
    });
  }

  deleteUser(): void {
    if (!this.selectedUser) {
      Swal.fire({
        title: 'Attention',
        text: 'Veuillez sélectionner un utilisateur',
        icon: 'warning'
      });
      return;
    }

    Swal.fire({
      title: 'Supprimer cet utilisateur ?',
      text: `Êtes-vous sûr de vouloir supprimer ${this.selectedUser.nom} ? Cette action est irréversible.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#dc3545'
    }).then((result) => {
      if (result.isConfirmed) {
        this.userService.deleteUser(this.selectedUser!.id).subscribe({
          next: (response) => {
            Swal.fire({
              title: 'Succès',
              text: 'Utilisateur supprimé avec succès',
              icon: 'success'
            });
            this.selectedUser = null;
            this.selectedUserId = null;
            this.userPermissions = [];
            this.loadUsers();
          },
          error: (error) => {
            Swal.fire({
              title: 'Erreur',
              text: 'Impossible de supprimer l\'utilisateur',
              icon: 'error'
            });
          }
        });
      }
    });
  }

  disconnectUser(): void {
    if (!this.selectedUser) {
      Swal.fire({
        title: 'Attention',
        text: 'Veuillez sélectionner un utilisateur',
        icon: 'warning'
      });
      return;
    }

    Swal.fire({
      title: 'Déconnecter l\'utilisateur',
      text: `Êtes-vous sûr de vouloir déconnecter ${this.selectedUser.nom} ?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, déconnecter',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#ffc107'
    }).then((result) => {
      if (result.isConfirmed) {
        this.userPermissionsService.disconnectUser(this.selectedUser!.id).subscribe({
          next: (response) => {
            Swal.fire({
              title: 'Succès',
              text: 'Utilisateur déconnecté avec succès',
              icon: 'success'
            });
          },
          error: (error) => {
            Swal.fire({
              title: 'Erreur',
              text: 'Impossible de déconnecter l\'utilisateur',
              icon: 'error'
            });
          }
        });
      }
    });
  }
}

