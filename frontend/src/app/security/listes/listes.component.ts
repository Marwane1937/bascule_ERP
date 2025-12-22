import { Component, OnInit, AfterViewInit } from '@angular/core';
import { ListesService, GroupId, Liste } from '../../service/listes.service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import * as $ from 'jquery';
import 'datatables.net';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-listes',
  templateUrl: './listes.component.html',
  styleUrls: ['./listes.component.css']
})
export class ListesComponent implements OnInit, AfterViewInit {
  groupIds: GroupId[] = [];
  listes: Liste[] = [];
  dataTable: any;
  loading: boolean = true;
  selectedGroupId: number | null = null;
  listeForm!: FormGroup;
  editListeForm!: FormGroup;
  selectedListe: Liste | null = null;
  isEditMode: boolean = false;

  constructor(
    private listesService: ListesService,
    private fb: FormBuilder
  ) {
    this.initForm();
    this.initEditForm();
  }

  ngOnInit(): void {
    this.getGroupIds();
  }

  ngAfterViewInit(): void {
    // Ne rien faire ici, on initialise dans getGroupIds après chargement
  }

  initForm(): void {
    this.listeForm = this.fb.group({
      code: ['', Validators.required],
      nom: ['', Validators.required]
    });
  }

  initEditForm(): void {
    this.editListeForm = this.fb.group({
      code: ['', Validators.required],
      nom: ['', Validators.required]
    });
  }

  getGroupIds(): void {
    this.loading = true;
    this.listesService.getAllGroupIds().subscribe({
      next: (response: any) => {
        if (Array.isArray(response)) {
          this.groupIds = response;
        } else if (response && response.data && Array.isArray(response.data)) {
          this.groupIds = response.data;
        } else {
          this.groupIds = [];
        }

        setTimeout(() => {
          if (this.dataTable) {
            this.dataTable.destroy();
          }
          this.dataTable = $('#listesTable').DataTable({
            pageLength: 10,
            ordering: true,
            order: [[0, 'asc']],
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
            } as any
          });
        }, 0);
        this.loading = false;
      },
      error: (error) => {
        console.error('Erreur lors du chargement des group IDs:', error);
        this.loading = false;
        Swal.fire({
          title: 'Erreur',
          text: 'Impossible de charger les listes',
          icon: 'error'
        });
      }
    });
  }

  onEdit(groupId: number): void {
    this.selectedGroupId = groupId;
    // Réinitialiser listes avant de charger les nouvelles données
    this.listes = [];
    // Charger les données d'abord, puis ouvrir le modal
    this.loadListesByGroupId(groupId);
  }

  onEditListe(liste: Liste): void {
    this.selectedListe = liste;
    this.isEditMode = true;

    this.editListeForm.patchValue({
      code: liste.code || '',
      nom: liste.nom || ''
    });

    // Ouvrir le modal d'édition de la liste
    setTimeout(() => {
      const modalElement = document.getElementById('editListeModal');
      if (modalElement) {
        const anyWindow = window as any;
        if (anyWindow.bootstrap) {
          const modal = new anyWindow.bootstrap.Modal(modalElement);
          modal.show();
        }
      }
    }, 100);
  }

  // Calculer le prochain ID (dernier ID + 1)
  getNextId(): number {
    if (!this.listes || this.listes.length === 0) {
      return 1;
    }
    const maxId = Math.max(...this.listes.map(liste => liste.id || 0));
    return maxId + 1;
  }

  loadListesByGroupId(group_id: number): void {
    this.listesService.getListesByGroupId(group_id).subscribe({
      next: (data: any) => {

        // S'assurer que listes est toujours un tableau
        if (Array.isArray(data)) {
          this.listes = data;
        } else if (data && Array.isArray(data.data)) {
          this.listes = data.data;
        } else if (data && data.success && Array.isArray(data.data)) {
          this.listes = data.data;
        } else {
          this.listes = [];
        }


        // Ouvrir le modal après le chargement des données
        setTimeout(() => {
          const modalElement = document.getElementById('editListesModal');
          if (modalElement) {
            const anyWindow = window as any;
            if (anyWindow.bootstrap) {
              const modal = new anyWindow.bootstrap.Modal(modalElement);
              modal.show();
            }
          }
        }, 100);
      },
      error: (error) => {
        console.error('[ListesComponent] Erreur lors du chargement des listes:', error);
        console.error('[ListesComponent] Détails de l\'erreur:', error.error);
        this.listes = []; // S'assurer que listes est un tableau même en cas d'erreur
        Swal.fire({
          title: 'Erreur',
          text: 'Impossible de charger les listes pour ce group_id',
          icon: 'error'
        });
      }
    });
  }

  addListe(): void {
    if (this.listeForm.valid && this.selectedGroupId !== null) {
      const nextId = this.getNextId();
      const listeData = {
        id: nextId,
        code: this.listeForm.value.code,
        nom: this.listeForm.value.nom,
        group_id: this.selectedGroupId
      };

      this.listesService.createListe(listeData).subscribe({
        next: (response: any) => {
          Swal.fire({
            title: 'Succès',
            text: 'Liste ajoutée avec succès',
            icon: 'success',
            confirmButtonText: 'OK'
          }).then(() => {
            this.listeForm.reset();
            // Recharger les listes pour mettre à jour le prochain ID
            if (this.selectedGroupId !== null) {
              this.loadListesByGroupId(this.selectedGroupId);
            }
          });
        },
        error: (error) => {
          console.error('Erreur lors de l\'ajout:', error);
          const errorMessage = error.error?.message || error.message || 'Erreur lors de l\'ajout de la liste';
          Swal.fire('Erreur', errorMessage, 'error');
        }
      });
    } else {
      Object.keys(this.listeForm.controls).forEach(key => {
        this.listeForm.get(key)?.markAsTouched();
      });
      Swal.fire('Erreur de validation', 'Veuillez remplir tous les champs requis', 'error');
    }
  }


  updateListe(): void {
    if (this.editListeForm.valid && this.selectedListe) {
      const listeData = {
        code: this.editListeForm.value.code,
        nom: this.editListeForm.value.nom,
        group_id: this.selectedListe.group_id
      };

      this.listesService.updateListe(this.selectedListe.id, listeData).subscribe({
        next: (response: any) => {
          Swal.fire({
            title: 'Succès',
            text: 'Liste modifiée avec succès',
            icon: 'success',
            confirmButtonText: 'OK'
          }).then(() => {
            this.closeEditListeModal();
            // Recharger les listes
            if (this.selectedGroupId !== null) {
              this.loadListesByGroupId(this.selectedGroupId);
            }
          });
        },
        error: (error) => {
          console.error('Erreur lors de la modification:', error);
          const errorMessage = error.error?.message || error.message || 'Erreur lors de la modification de la liste';
          Swal.fire('Erreur', errorMessage, 'error');
        }
      });
    } else {
      Object.keys(this.editListeForm.controls).forEach(key => {
        this.editListeForm.get(key)?.markAsTouched();
      });
      Swal.fire('Erreur de validation', 'Veuillez remplir tous les champs requis', 'error');
    }
  }

  deleteListe(liste: Liste): void {
    Swal.fire({
      title: 'Confirmer la suppression',
      text: `Êtes-vous sûr de vouloir supprimer la liste "${liste.nom}" ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.listesService.deleteListe(liste.id).subscribe({
          next: (response: any) => {
            Swal.fire({
              title: 'Supprimé !',
              text: 'La liste a été supprimée avec succès',
              icon: 'success',
              confirmButtonText: 'OK'
            }).then(() => {
              // Recharger les listes
              if (this.selectedGroupId !== null) {
                this.loadListesByGroupId(this.selectedGroupId);
              }
            });
          },
          error: (error) => {
            console.error('Erreur lors de la suppression:', error);
            const errorMessage = error.error?.message || error.message || 'Erreur lors de la suppression de la liste';
            Swal.fire('Erreur', errorMessage, 'error');
          }
        });
      }
    });
  }

  closeEditListeModal(): void {
    this.selectedListe = null;
    this.isEditMode = false;
    this.editListeForm.reset();
    this.initEditForm();
  }

  closeModal(): void {
    this.selectedGroupId = null;
    this.listes = []; // S'assurer que listes est toujours un tableau
    this.listeForm.reset();
    this.initForm();
  }
}

