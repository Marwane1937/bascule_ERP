import { Component, OnInit } from '@angular/core';
import { AuthService, Societe } from '../../service/auth.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-societe-selector',
  templateUrl: './societe-selector.component.html',
  styleUrls: ['./societe-selector.component.css']
})
export class SocieteSelectorComponent implements OnInit {
  societes: Societe[] = [];
  selectedSociete: Societe | null = null;
  isLoading = false;
  showDropdown = false;

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.loadSocietes();
    this.subscribeToCurrentSociete();
  }

  loadSocietes(): void {
    this.isLoading = true;
    this.authService.getAllSocietes().subscribe({
      next: (societes) => {
        this.societes = societes;
        this.isLoading = false;
      },
      error: (error) => {
        this.isLoading = false;
      }
    });
  }

  subscribeToCurrentSociete(): void {
    this.authService.currentSociete$.subscribe(societe => {
      this.selectedSociete = societe;
    });
  }

  toggleDropdown(): void {
    this.showDropdown = !this.showDropdown;
  }

  selectSociete(societe: Societe): void {
    // Vérifier si c'est déjà la société sélectionnée
    if (this.selectedSociete?.id === societe.id) {
      this.showDropdown = false;
      return;
    }

    // Afficher la confirmation
    this.showConfirmationDialog(societe);
  }

  showConfirmationDialog(societe: Societe): void {
    Swal.fire({
      title: 'Changement de société',
      html: `
        <div style="text-align: left;">
          <p><strong>Voulez-vous vraiment vous connecter à la base :</strong></p>
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
    // Changer de société localement
    this.authService.changeSociete(societe);
    this.selectedSociete = societe;
    this.showDropdown = false;

    // Changer de base de données sur le backend
    this.switchDatabase(societe.id);
  }

  switchDatabase(societeId: number): void {
    this.isLoading = true;
    
    // Afficher un message de chargement
    Swal.fire({
      title: 'Changement en cours...',
      text: 'Connexion à la nouvelle base de données',
      icon: 'info',
      allowOutsideClick: false,
      showConfirmButton: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    this.authService.switchDatabase(societeId).subscribe({
      next: (response) => {
        
        // Fermer le message de chargement
        Swal.close();
        
        // Afficher un message de succès
        Swal.fire({
          title: 'Succès !',
          text: 'Connexion à la nouvelle base de données réussie',
          icon: 'success',
          timer: 2000,
          showConfirmButton: false
        }).then(() => {
          // Déconnexion automatique
          this.authService.logout();
          
          // Redirection vers la page de login
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
          text: 'Impossible de se connecter à la nouvelle base de données',
          icon: 'error',
          confirmButtonText: 'OK'
        });
      }
    });
  }

  closeDropdown(): void {
    this.showDropdown = false;
  }
}

