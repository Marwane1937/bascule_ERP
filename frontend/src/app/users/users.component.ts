import { Component, OnInit, AfterViewInit, Inject } from '@angular/core';
import { UserService } from '../service/user.service';
import { AuthService } from '../service/auth.service';
import Swal from 'sweetalert2';
import * as $ from 'jquery';
import 'datatables.net';

export interface User {
  id: number;
  nom: string;
  login: string;
  group_id: number;
  contact_id: number;
  type: number;
  etat: number | boolean;
  expire: number;
  expire_dat: string;
}

@Component({
  selector: 'app-users',
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.css']
})
export class UsersComponent implements OnInit, AfterViewInit {
  users: User[] = [];
  dataTable: any;
  loading: boolean = true;
  currentUser: any = null;

  constructor(
    @Inject(UserService) private userService: UserService,
    @Inject(AuthService) private authService: AuthService
  ) { }

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.getUsers();
  }

  ngAfterViewInit(): void {
    // Initialisation DataTable après chargement des données
  }

  getUsers(): void {
    this.loading = true;
    this.userService.getAllUsers().subscribe({
      next: (response: any) => {
        if (response && response.success && Array.isArray(response.data)) {
          this.users = response.data;
        } else if (Array.isArray(response)) {
          this.users = response;
        } else {
          this.users = [];
        }
        this.initializeDataTable();
        this.loading = false;
      },
      error: (error: any) => {
        this.loading = false;
        Swal.fire({
          title: 'Erreur',
          text: 'Impossible de charger les utilisateurs',
          icon: 'error'
        });
      }
    });
  }

  initializeDataTable(): void {
    setTimeout(() => {
      if (this.dataTable) {
        this.dataTable.destroy();
      }

      this.dataTable = $('#usersTable').DataTable({
        pageLength: 10,
        ordering: true,
        order: [[0, 'desc']], // Trier par la première colonne (ID) en DESC par défaut
        searching: true,
        lengthChange: true,
        language: {
          processing: 'Traitement en cours...',
          search: 'Rechercher&nbsp;:',
          lengthMenu: 'Afficher _MENU_ &eacute;l&eacute;ments',
          info: 'Affichage de l\'&eacute;l&eacute;ment _START_ &agrave; _END_ sur _TOTAL_ &eacute;l&eacute;ments',
          infoEmpty: 'Affichage de l\'&eacute;l&eacute;ment 0 &agrave; 0 sur 0 &eacute;l&eacute;ments',
          infoFiltered: '(filtr&eacute; de _MAX_ &eacute;l&eacute;ments au total)',
          infoPostFix: '',
          loadingRecords: 'Chargement en cours...',
          zeroRecords: 'Aucun &eacute;l&eacute;ment &agrave; afficher',
          emptyTable: 'Aucune donn&eacute;e disponible dans le tableau',
          paginate: {
            first: 'Premier',
            previous: 'Pr&eacute;c&eacute;dent',
            next: 'Suivant',
            last: 'Dernier'
          }
        } as any,
        columnDefs: [
          { orderable: false, targets: [6] } // Désactiver le tri sur la colonne Actions
        ]
      });
    }, 0);
  }

  addUser(): void {
    Swal.fire({
      title: 'Ajouter un utilisateur',
      html: `
        <div class="form-group">
          <label>Nom complet</label>
          <input type="text" id="name" class="form-control" placeholder="Nom complet">
        </div>
        <div class="form-group">
          <label>Login</label>
          <input type="text" id="login" class="form-control" placeholder="Login">
        </div>
        <div class="form-group">
          <label>Mot de passe</label>
          <div class="input-group">
            <input type="password" id="password" class="form-control" placeholder="Mot de passe">
            <div class="input-group-append">
              <span class="input-group-text" style="cursor: pointer;" onclick="
                var input = document.getElementById('password');
                var icon = this.querySelector('i');
                if (input.type === 'password') {
                  input.type = 'text';
                  icon.classList.remove('fa-eye');
                  icon.classList.add('fa-eye-slash');
                } else {
                  input.type = 'password';
                  icon.classList.remove('fa-eye-slash');
                  icon.classList.add('fa-eye');
                }
              ">
                <i class="fas fa-eye"></i>
              </span>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Type</label>
          <select id="type" class="form-control">
            <option value="2">Utilisateur</option>
            <option value="1">Administrateur</option>
            <option value="3">Gestionnaire</option>
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Ajouter',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#28a745',
      preConfirm: () => {
        const name = (document.getElementById('name') as HTMLInputElement).value;
        const login = (document.getElementById('login') as HTMLInputElement).value;
        const password = (document.getElementById('password') as HTMLInputElement).value;
        const type = parseInt((document.getElementById('type') as HTMLSelectElement).value);

        if (!name || !login || !password) {
          Swal.showValidationMessage('Tous les champs sont obligatoires');
          return false;
        }

        return { nom: name, login, password, type };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.userService.createUser(result.value).subscribe({
          next: (response: any) => {
            Swal.fire({
              title: 'Succès',
              text: 'Utilisateur créé avec succès',
              icon: 'success'
            });
            this.getUsers();
          },
          error: (error: any) => {
            Swal.fire({
              title: 'Erreur',
              text: 'Impossible de créer l\'utilisateur',
              icon: 'error'
            });
          }
        });
      }
    });
  }

  editUser(user: User): void {
    Swal.fire({
      title: 'Modifier l\'utilisateur',
      html: `
        <div class="form-group">
          <label>Nom complet</label>
          <input type="text" id="name" class="form-control" value="${user.nom}">
        </div>
        <div class="form-group">
          <label>Login</label>
          <input type="text" id="login" class="form-control" value="${user.login}">
        </div>
        <div class="form-group">
          <label>Type</label>
          <select id="type" class="form-control">
            <option value="2" ${user.type === 2 ? 'selected' : ''}>Utilisateur</option>
            <option value="1" ${user.type === 1 ? 'selected' : ''}>Administrateur</option>
            <option value="3" ${user.type === 3 ? 'selected' : ''}>Gestionnaire</option>
          </select>
        </div>
        <div class="form-group">
          <label>Statut</label>
          <select id="etat" class="form-control">
            <option value="1" ${user.etat == 1 || user.etat === true ? 'selected' : ''}>Actif</option>
            <option value="0" ${user.etat != 1 && user.etat !== true ? 'selected' : ''}>Inactif</option>
          </select>
        </div>
      `,
      showCancelButton: true,
      confirmButtonText: 'Modifier',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#007bff',
      preConfirm: () => {
        const name = (document.getElementById('name') as HTMLInputElement).value;
        const login = (document.getElementById('login') as HTMLInputElement).value;
        const type = parseInt((document.getElementById('type') as HTMLSelectElement).value);
        const etat = parseInt((document.getElementById('etat') as HTMLSelectElement).value);

        if (!name || !login) {
          Swal.showValidationMessage('Nom et login sont requis');
          return false;
        }

        return { nom: name, login, type, etat };
      }
    }).then((result) => {
      if (result.isConfirmed) {
        this.userService.updateUser(user.id, result.value).subscribe({
          next: (response: any) => {
            Swal.fire({
              title: 'Succès',
              text: 'Utilisateur modifié avec succès',
              icon: 'success'
            });
            this.getUsers();
          },
          error: (error: any) => {
            Swal.fire({
              title: 'Erreur',
              text: 'Impossible de modifier l\'utilisateur',
              icon: 'error'
            });
          }
        });
      }
    });
  }

  toggleUserStatus(user: User): void {
    const isActive = user.etat == 1 || user.etat === true;
    const action = isActive ? 'désactiver' : 'activer';
    const actionText = isActive ? 'désactivé' : 'activé';

    Swal.fire({
      title: `${action.charAt(0).toUpperCase() + action.slice(1)} l'utilisateur`,
      text: `Êtes-vous sûr de vouloir ${action} ${user.nom} ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: `Oui, ${action}`,
      cancelButtonText: 'Annuler',
      confirmButtonColor: isActive ? '#dc3545' : '#28a745'
    }).then((result) => {
      if (result.isConfirmed) {
        this.userService.toggleUserStatus(user.id).subscribe({
          next: (response: any) => {
            Swal.fire({
              title: 'Succès',
              text: `Utilisateur ${actionText} avec succès`,
              icon: 'success'
            });
            this.getUsers();
          },
          error: (error: any) => {
            Swal.fire({
              title: 'Erreur',
              text: `Impossible de ${action} l'utilisateur`,
              icon: 'error'
            });
          }
        });
      }
    });
  }

  deleteUser(user: User): void {
    Swal.fire({
      title: 'Supprimer l\'utilisateur',
      text: `Êtes-vous sûr de vouloir supprimer ${user.nom} ? Cette action est irréversible.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#dc3545'
    }).then((result) => {
      if (result.isConfirmed) {
        this.userService.deleteUser(user.id).subscribe({
          next: (response: any) => {
            Swal.fire({
              title: 'Succès',
              text: 'Utilisateur supprimé avec succès',
              icon: 'success'
            });
            this.getUsers();
          },
          error: (error: any) => {
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

  resetPassword(user: User): void {
    Swal.fire({
      title: 'Réinitialiser le mot de passe',
      html: `
        <div class="form-group">
          <label>Nouveau mot de passe</label>
          <div class="input-group">
            <input type="password" id="newPassword" class="form-control" placeholder="Nouveau mot de passe">
            <div class="input-group-append">
              <span class="input-group-text" style="cursor: pointer;" onclick="
                var input = document.getElementById('newPassword');
                var icon = this.querySelector('i');
                if (input.type === 'password') {
                  input.type = 'text';
                  icon.classList.remove('fa-eye');
                  icon.classList.add('fa-eye-slash');
                } else {
                  input.type = 'password';
                  icon.classList.remove('fa-eye-slash');
                  icon.classList.add('fa-eye');
                }
              ">
                <i class="fas fa-eye"></i>
              </span>
            </div>
          </div>
        </div>
        <div class="form-group">
          <label>Confirmer le mot de passe</label>
          <div class="input-group">
            <input type="password" id="confirmPassword" class="form-control" placeholder="Confirmer le mot de passe">
            <div class="input-group-append">
              <span class="input-group-text" style="cursor: pointer;" onclick="
                var input = document.getElementById('confirmPassword');
                var icon = this.querySelector('i');
                if (input.type === 'password') {
                  input.type = 'text';
                  icon.classList.remove('fa-eye');
                  icon.classList.add('fa-eye-slash');
                } else {
                  input.type = 'password';
                  icon.classList.remove('fa-eye-slash');
                  icon.classList.add('fa-eye');
                }
              ">
                <i class="fas fa-eye"></i>
              </span>
            </div>
          </div>
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
        this.userService.resetPassword(user.id, result.value.password).subscribe({
          next: (response: any) => {
            Swal.fire({
              title: 'Succès',
              text: 'Mot de passe réinitialisé avec succès',
              icon: 'success'
            });
          },
          error: (error: any) => {
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

  getRoleBadgeClass(type: number): string {
    switch (type) {
      case 1: return 'badge-danger'; // Admin
      case 2: return 'badge-primary'; // User
      case 3: return 'badge-warning'; // Manager
      default: return 'badge-secondary';
    }
  }

  getRoleDisplayName(type: number): string {
    switch (type) {
      case 1: return 'Admin';
      case 2: return 'Utilisateur';
      case 3: return 'Gestionnaire';
      default: return 'Inconnu';
    }
  }

  formatDate(dateString: string): string {
    if (!dateString) return 'Jamais';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Méthodes pour calculer les statistiques
  getTotalUsers(): number {
    return this.users.length;
  }

  getActiveUsers(): number {
    return this.users.filter(u => this.isUserActive(u)).length;
  }

  getAdminUsers(): number {
    return this.users.filter(u => u.type === 1).length;
  }

  getInactiveUsers(): number {
    return this.users.filter(u => !this.isUserActive(u)).length;
  }

  hasNoUsers(): boolean {
    return !this.loading && this.users.length === 0;
  }

  isUserActive(user: User): boolean {
    return user.etat == 1 || user.etat === true;
  }
}
