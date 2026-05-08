import { AfterViewInit, Component, OnInit } from '@angular/core';
import { BaseService } from 'src/app/service/base.service';
import Swal from 'sweetalert2';

declare var $: any;
declare var bootstrap: any;

@Component({
  selector: 'app-famille',
  templateUrl: './famille.component.html',
  styleUrls: ['./famille.component.css']
})
export class FamilleComponent implements OnInit, AfterViewInit {
  familles: any[] = [];
  dataTable: any;
  loading: boolean = true;

  // Variables pour le formulaire
  currentFamille: any = {
    code: '',
    nom: ''
  };
  isEditMode: boolean = false;
  selectedId: string = '';

  constructor(private baseService: BaseService) { }

  ngOnInit(): void {
    this.getFamilles();
  }

  ngAfterViewInit(): void {
    // Ne rien faire ici, on initialise dans getFamilles après chargement
  }

  getFamilles(): void {
    this.loading = true;

    this.baseService.getFamille().subscribe({
      next: (response: any) => {
        // Extraire les données de la réponse API
        this.familles = response?.data || (Array.isArray(response) ? response : []);

        setTimeout(() => {
          if (this.dataTable) {
            this.dataTable.destroy();
          }

          this.dataTable = $('#clientTable').DataTable({
            pageLength: 10,
            ordering: true,
            order: [[0, 'desc']],
            searching: true,
            lengthChange: true,
            language: {
              emptyTable: 'Aucune donnée disponible dans le tableau',
              info: 'Affichage de _START_ à _END_ sur _TOTAL_ entrées',
              infoEmpty: 'Affichage de 0 à 0 sur 0 entrée',
              infoFiltered: '(filtré à partir de _MAX_ entrées au total)',
              lengthMenu: 'Afficher _MENU_ entrées',
              loadingRecords: 'Chargement...',
              processing: 'Traitement en cours...',
              search: 'Rechercher:',
              zeroRecords: 'Aucun enregistrement correspondant trouvé',
              paginate: {
                first: 'Premier',
                last: 'Dernier',
                next: 'Suivant',
                previous: 'Précédent'
              }
            }
          });
        }, 0);

        this.loading = false;
      },
      error: (error) => {
        this.loading = false;
      }
    });
  }

  openAddModal(): void {
    this.isEditMode = false;
    this.currentFamille = {
      code: '',
      nom: ''
    };
    const modal = new bootstrap.Modal(document.getElementById('addClientModal'));
    modal.show();
  }

  openEditModal(famille: any): void {
    this.isEditMode = true;
    this.selectedId = famille.code;
    this.currentFamille = {
      code: famille.code,
      nom: famille.nom
    };
    const modal = new bootstrap.Modal(document.getElementById('addClientModal'));
    modal.show();
  }

  saveFamille(): void {
    if (!this.currentFamille.nom || !this.currentFamille.code) {
      Swal.fire({
        icon: 'warning',
        title: 'Champs requis',
        text: 'Veuillez remplir tous les champs obligatoires',
        confirmButtonColor: '#f59e0b'
      });
      return;
    }

    const data = {
      code: this.currentFamille.code,
      nom: this.currentFamille.nom
    };

    if (this.isEditMode) {
      // Modification
      this.baseService.updateFamille(this.selectedId, data).subscribe({
        next: (response) => {
          this.closeModal();
          Swal.fire({
            icon: 'success',
            title: 'Modifié !',
            text: 'La famille a été modifiée avec succès',
            showConfirmButton: false,
            timer: 1500
          });
          this.getFamilles();
        },
        error: (error) => {
          Swal.fire({
            icon: 'error',
            title: 'Erreur',
            text: error?.error?.message || 'Erreur lors de la modification de la famille',
            confirmButtonColor: '#dc2626'
          });
        }
      });
    } else {
      // Ajout
      this.baseService.addFamille(data).subscribe({
        next: (response) => {
          this.closeModal();
          Swal.fire({
            icon: 'success',
            title: 'Ajouté !',
            text: 'La famille a été ajoutée avec succès',
            showConfirmButton: false,
            timer: 1500
          });
          this.getFamilles();
        },
        error: (error) => {
          Swal.fire({
            icon: 'error',
            title: 'Erreur',
            text: error?.error?.message || 'Erreur lors de l\'ajout de la famille',
            confirmButtonColor: '#dc2626'
          });
        }
      });
    }
  }

  deleteFamille(famille: any): void {
    Swal.fire({
      title: 'Confirmer la suppression',
      text: `Êtes-vous sûr de vouloir supprimer la famille "${famille.nom}" ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#dc2626',
      cancelButtonColor: '#6b7280',
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.baseService.deleteFamille(famille.code).subscribe({
          next: (response) => {
            Swal.fire({
              icon: 'success',
              title: 'Supprimé !',
              text: 'La famille a été supprimée avec succès',
              showConfirmButton: false,
              timer: 1500
            });
            this.getFamilles();
          },
          error: (error) => {
            Swal.fire({
              icon: 'error',
              title: 'Erreur',
              text: error?.error?.message || 'Erreur lors de la suppression de la famille',
              confirmButtonColor: '#dc2626'
            });
          }
        });
      }
    });
  }

  archiveFamille(famille: any): void {
    // Pour l'instant, on affiche juste un message
    // Vous devrez implémenter la logique d'archivage dans le backend
    alert(`Fonctionnalité d'archivage à implémenter pour "${famille.nom}"`);
  }

  closeModal(): void {
    const modalElement = document.getElementById('addClientModal');
    const modal = bootstrap.Modal.getInstance(modalElement);
    if (modal) {
      modal.hide();
    }
  }
}
