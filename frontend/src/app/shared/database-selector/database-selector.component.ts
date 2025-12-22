import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../service/auth.service';
import Swal from 'sweetalert2';

interface Societe {
  id: number;
  nom: string;
  nom_base: string;
  actif: boolean;
}

@Component({
  selector: 'app-database-selector',
  templateUrl: './database-selector.component.html',
  styleUrls: ['./database-selector.component.css']
})
export class DatabaseSelectorComponent implements OnInit {
  societes: Societe[] = [];
  currentSociete: Societe | null = null;
  isLoading = false;
  showDropdown = false;

  constructor(private authService: AuthService) { }

  ngOnInit(): void {
    // garder la sélection si déjà enregistrée
    this.authService.currentSociete$.subscribe(s => {
      if (s) {
        this.currentSociete = s;
      }
    });
    this.loadSocietes();
  }

  loadSocietes(): void {
    this.isLoading = true;

    // Récupérer la liste des bases de données disponibles
    this.authService.getAvailableDatabases().subscribe({
      next: (societes) => {
        this.societes = societes || [];

        // Restaurer la sélection précédente
        if (!this.currentSociete && this.societes.length > 0) {
          const savedName = localStorage.getItem('currentDatabaseName');
          const savedFromLocal = savedName ? this.societes.find(s => s.nom_base === savedName) : null;

          // Fallback sur la première base si rien n'est sauvegardé
          const initial = this.authService.getCurrentSociete() || savedFromLocal || this.societes[0];

          this.currentSociete = initial;
          this.authService.changeSociete(initial);
        }
        this.isLoading = false;
      },
      error: (error) => {
        console.error('[DatabaseSelector] ❌ Erreur chargement bases de données:', error);
        console.error('[DatabaseSelector] Status:', error.status);
        console.error('[DatabaseSelector] Error body:', error.error);
        this.isLoading = false;

        // Fallback sur mock si erreur
        const mockSocietes = [
          { id: 1, nom: 'CactusErp_SNMR', nom_base: 'CactusErp_SNMR', actif: true },
          { id: 2, nom: 'CactusErp_Test', nom_base: 'CactusErp_SNMR_Test01', actif: true }
        ];
        this.societes = mockSocietes;
      }
    });
  }

  toggleDropdown(): void {
    this.showDropdown = !this.showDropdown;
  }

  selectSociete(societe: Societe): void {
    // Vérifier si c'est déjà la société sélectionnée
    if (this.currentSociete && this.currentSociete.id === societe.id) {
      this.showDropdown = false;
      return;
    }

    // Afficher la confirmation
    this.showConfirmationDialog(societe);
  }

  showConfirmationDialog(societe: Societe): void {
    Swal.fire({
      title: 'Changement de base de données',
      html: `
        <div style="text-align: left;">
          <p><strong>Voulez-vous vraiment vous connecter à la société :</strong></p>
          <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin: 10px 0;">
            <p><strong>Société :</strong> ${societe.nom}</p>
            <p><strong>Base de données :</strong> ${societe.nom_base}</p>
          </div>
          <p style="color: #dc3545; font-size: 14px;">
            ⚠️ <strong>Attention :</strong> Vous allez être déconnecté et reconnecté automatiquement.
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
        this.proceedWithDatabaseSwitch(societe);
      } else {
        this.showDropdown = false;
      }
    });
  }

  proceedWithDatabaseSwitch(societe: Societe): void {
    this.isLoading = true;

    // Afficher un message de chargement
    Swal.fire({
      title: 'Changement en cours...',
      text: `Connexion à ${societe.nom}`,
      icon: 'info',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Passer le nom de la base de données pour la création automatique si nécessaire
    this.authService.switchDatabase(undefined, societe.nom_base).subscribe({
      next: (response) => {
        // Fermer le message de chargement
        Swal.close();

        // Mettre à jour l'ID réel retourné par le backend (si création auto)
        if (response.data && response.data.societe) {
          societe.id = response.data.societe.id;
        }

        // Sauvegarder le nom de la base pour la prochaine fois
        localStorage.setItem('currentDatabaseName', societe.nom_base);

        // Afficher un message de succès
        Swal.fire({
          title: 'Succès !',
          text: `Connexion à ${societe.nom} réussie`,
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        }).then(() => {
          // Mettre à jour et persister la société courante puis forcer reconnexion
          this.currentSociete = societe;
          this.authService.changeSociete(societe);
          this.showDropdown = false;
          this.authService.logout();
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
