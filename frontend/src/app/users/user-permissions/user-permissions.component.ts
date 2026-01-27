import { Component, OnInit } from '@angular/core';
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

  // S'assurer que les tableaux sont toujours des tableaux
  get safeUsers(): User[] {
    return Array.isArray(this.users) ? this.users : [];
  }

  get safeMenuCategories(): MenuCategory[] {
    return Array.isArray(this.menuCategories) ? this.menuCategories : [];
  }

  constructor(
    private userService: UserService,
    private userPermissionsService: UserPermissionsService,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.loadUsers();
    this.loadMenuItems();
  }

  loadUsers(): void {
    this.loading = true;
    this.userService.getAllUsers().subscribe({
      next: (response: any) => {
        // Extraire les données de la réponse { success: true, data: [...] }
        this.users = response?.data || response || [];
        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
        Swal.fire({
          title: 'Erreur',
          text: 'Impossible de charger les utilisateurs',
          icon: 'error'
        });
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

    const existingPermission = this.userPermissions.find(p => p.menu_item === menuItemName);
    
    if (existingPermission) {
      // Toggle entre 1 et 0 (gérer aussi true/false)
      const currentAccess = existingPermission.access;
      const isCurrentlyActive = currentAccess === 1 || currentAccess === true || currentAccess === '1' || currentAccess === 'true';
      existingPermission.access = isCurrentlyActive ? 0 : 1;
    } else {
      // Créer une nouvelle permission
      this.userPermissions.push({
        user_id: this.selectedUser.id,
        menu_item: menuItemName,
        access: 1
      });
    }
  }

  // Vérifier si tous les items d'une catégorie sont cochés
  isAllCategoryItemsChecked(category: any): boolean {
    if (!category.items || category.items.length === 0) {
      return false;
    }
    return category.items.every((item: any) => this.hasPermission(item.name));
  }

  // Vérifier si au moins un item de la catégorie est coché
  isSomeCategoryItemsChecked(category: any): boolean {
    if (!category.items || category.items.length === 0) {
      return false;
    }
    return category.items.some((item: any) => this.hasPermission(item.name));
  }

  // Cocher/Décocher tous les items d'une catégorie
  toggleCategoryPermissions(category: any): void {
    if (!this.selectedUser) return;

    const allChecked = this.isAllCategoryItemsChecked(category);
    const newAccessValue = allChecked ? 0 : 1;

    category.items.forEach((item: any) => {
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
    });
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
        Swal.fire({
          title: 'Succès',
          text: 'Permissions mises à jour avec succès',
          icon: 'success'
        });
        // Recharger les permissions
        this.loadUserPermissions(this.selectedUser!.id);
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

