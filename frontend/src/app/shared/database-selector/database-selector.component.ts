import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../service/auth.service';
import Swal from 'sweetalert2';

interface Societe {
  id: number;
  nom: string;
  nom_base: string;
  actif: boolean;
}

interface Database {
  id: number;
  name: string;
  dbuser: string;
  dbpass: string;
  dbname: string;
  dbtype?: string;
}

@Component({
  selector: 'app-database-selector',
  templateUrl: './database-selector.component.html',
  styleUrls: ['./database-selector.component.css']
})
export class DatabaseSelectorComponent implements OnInit {
  databases: Database[] = [];
  currentDatabase: Database | null = null;
  isLoading = false;
  showDropdown = false;

  constructor(private authService: AuthService) { }

  ngOnInit(): void {
    this.loadDatabases();
  }

  loadDatabases(): void {
    this.isLoading = true;

    // Récupérer la liste des bases de données depuis la table db
    this.authService.getDatabasesFromTable().subscribe({
      next: (databases) => {
        this.databases = databases || [];

        // Restaurer la sélection précédente
        if (this.databases.length > 0) {
          const savedId = localStorage.getItem('currentDatabaseId');
          const savedDbName = localStorage.getItem('currentDatabaseName');
          
          // PRIORITÉ 1: Essayer de trouver par dbname (nom technique) - c'est la source de vérité
          // car il est toujours mis à jour lors du switch et conservé après logout
          if (savedDbName) {
            const saved = this.databases.find(db => db.dbname === savedDbName);
            if (saved) {
              this.currentDatabase = saved;
              // Mettre à jour aussi l'ID et le label pour cohérence
              localStorage.setItem('currentDatabaseId', saved.id.toString());
              localStorage.setItem('currentDatabaseLabel', saved.name);
              this.isLoading = false;
              return; // Sortir immédiatement après avoir trouvé la bonne base
            }
          }
          
          // PRIORITÉ 2: Si pas trouvé par dbname, essayer par ID (fallback)
          if (!this.currentDatabase && savedId) {
            const saved = this.databases.find(db => db.id === parseInt(savedId));
            if (saved) {
              this.currentDatabase = saved;
              // Vérifier si le dbname correspond, sinon mettre à jour
              if (savedDbName && saved.dbname !== savedDbName) {
                // Incohérence détectée, mettre à jour avec la bonne base si trouvée
                const correctDb = this.databases.find(db => db.dbname === savedDbName);
                if (correctDb) {
                  this.currentDatabase = correctDb;
                  localStorage.setItem('currentDatabaseId', correctDb.id.toString());
                  localStorage.setItem('currentDatabaseLabel', correctDb.name);
                }
              } else {
                // Mettre à jour le label pour cohérence
                localStorage.setItem('currentDatabaseLabel', saved.name);
              }
            }
          }
          
          // PRIORITÉ 3: Si aucune sélection sauvegardée, prendre la première
          if (!this.currentDatabase && this.databases.length > 0) {
            this.currentDatabase = this.databases[0];
          }
        }
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
      }
    });
  }

  toggleDropdown(): void {
    this.showDropdown = !this.showDropdown;
  }

  selectDatabase(database: Database): void {
    // Vérifier si c'est déjà la base sélectionnée
    if (this.currentDatabase && this.currentDatabase.id === database.id) {
      this.showDropdown = false;
      return;
    }

    // Afficher la confirmation
    this.showConfirmationDialog(database);
  }

  showConfirmationDialog(database: Database): void {
    Swal.fire({
      title: 'Changement de base de données',
      html: `
        <div style="text-align: left;">
          <p><strong>Voulez-vous vraiment vous connecter à la base de données :</strong></p>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0;">
            <p><strong>Nom :</strong> ${database.name}</p>
            <p><strong>Base de données :</strong> ${database.dbname}</p>
            <p><strong>Utilisateur :</strong> ${database.dbuser}</p>
          </div>
          <p style="color: #dc3545; font-size: 14px;">
            ⚠️ <strong>Attention :</strong> Les credentials seront mis à jour dans le fichier .env et l'application sera rechargée.
          </p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Oui, se connecter',
      cancelButtonText: 'Annuler',
      width: '500px'
    }).then((result) => {
      if (result.isConfirmed) {
        this.proceedWithDatabaseSwitch(database);
      } else {
        this.showDropdown = false;
      }
    });
  }

  proceedWithDatabaseSwitch(database: Database): void {
    this.isLoading = true;

    // Afficher un message de chargement
    Swal.fire({
      title: 'Changement en cours...',
      text: `Connexion à ${database.name}`,
      icon: 'info',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Utiliser la nouvelle méthode avec db_id
    this.authService.switchDatabaseByDbId(database.id).subscribe({
      next: (response) => {
        // Fermer le message de chargement
        Swal.close();

        // Sauvegarder l'ID de la base sélectionnée
        localStorage.setItem('currentDatabaseId', database.id.toString());
        // IMPORTANT: stocker le vrai nom technique de la base (dbname), pas le label (name)
        localStorage.setItem('currentDatabaseName', database.dbname);
        // Optionnel: garder le label pour affichage/debug
        localStorage.setItem('currentDatabaseLabel', database.name);

        // Afficher un message de succès
        Swal.fire({
          title: 'Succès !',
          text: `Connexion à ${database.name} réussie. Vous allez être redirigé vers la page de connexion.`,
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        }).then(() => {
          // Déconnecter l'utilisateur
          this.authService.logout();
          
          // Rediriger vers la page de login
          window.location.href = '/login';
        });
      },
      error: (error) => {
        this.isLoading = false;

        // Fermer le message de chargement
        Swal.close();

        // Afficher un message d'erreur
        Swal.fire({
          title: 'Erreur !',
          text: error.error?.message || 'Impossible de se connecter à cette base de données',
          icon: 'error',
          confirmButtonText: 'OK'
        });
      }
    });
  }

  logout(): void {
    this.authService.logout();
    window.location.href = '/login';
  }

  closeDropdown(): void {
    this.showDropdown = false;
  }
}
