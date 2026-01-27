import { Component, OnInit, AfterViewInit } from '@angular/core';
import { BaseService } from 'src/app/service/base.service';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import * as $ from 'jquery';
import 'datatables.net';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-employe',
  templateUrl: './employe.component.html',
  styleUrls: ['./employe.component.css']
})
export class EmployeComponent implements OnInit, AfterViewInit {
  employes: any[] = [];
  dataTable: any;
  loading: boolean = true; // ← par défaut on affiche le spinner
  employeForm!: FormGroup;
  editEmployeForm!: FormGroup;
  selectedEmploye: any = null;
  isEditMode: boolean = false;

  constructor(
    private baseService: BaseService, 
    private router: Router,
    private fb: FormBuilder
  ) {
    this.initForm();
    this.initEditForm();
  }

  ngOnInit(): void {
    this.getEmployes();
  }

  ngAfterViewInit(): void {
    // Ne rien faire ici, on initialise dans getEmployes après chargement
  }

  getEmployes(): void {
    this.loading = true;

    this.baseService.getEmploye().subscribe((response: any) => {
      // Extraire les données de la réponse { success: true, data: [...] }
      this.employes = response?.data || response || [];

      setTimeout(() => {
        if (this.dataTable) {
          this.dataTable.destroy();
        }

        this.dataTable = $('#employeTable').DataTable({
          pageLength: 10,
          ordering: true,
          order: [[0, 'desc']], // Trier par la première colonne (ID) en DESC par défaut
          searching: true,
          lengthChange: true
        });

     
      }, 0);
       this.loading = false; // ✅ on cache le spinner après le chargement
    });
  }

  initForm(): void {
    this.employeForm = this.fb.group({
      code: ['', Validators.required],
      nom: ['', Validators.required],
      prenom: ['', Validators.required],
      telephone: [''],
      telegram_id: ['']
    });
  }

  initEditForm(): void {
    this.editEmployeForm = this.fb.group({
      code: ['', Validators.required],
      nom: ['', Validators.required],
      prenom: ['', Validators.required],
      telephone: [''],
      telegram_id: ['']
    });
  }

  addEmploye(): void {
    
    if (this.employeForm.valid) {
      const employeData = {
        code: this.employeForm.value.code,
        nom: this.employeForm.value.nom,
        prenom: this.employeForm.value.prenom,
        telephone: this.employeForm.value.telephone || null,
        telegram_id: this.employeForm.value.telegram_id || null,
        titre: null,
        naissance_dat: null,
        piece_type: null,
        piece_numero: null,
        securite_num: null,
        fonction: null,
        departement_id: null,
        contrat_typ: null,
        embauche_dat: null,
        sortie_dat: null,
        etat: 1, // ✅ État = 1 lors de la création
        user_id: null
      };


      this.baseService.addEmploye(employeData).subscribe({
        next: (response: any) => {
          Swal.fire({
            title: 'Succès',
            text: 'Employé ajouté avec succès',
            icon: 'success',
            confirmButtonText: 'OK'
          }).then(() => {
            // Rafraîchir la page
            window.location.reload();
          });
        },
        error: (error) => {
          const errorMessage = error.error?.message || error.message || 'Erreur lors de l\'ajout de l\'employé';
          Swal.fire('Erreur', errorMessage, 'error');
        }
      });
    } else {
      // Marquer tous les champs comme touchés pour afficher les erreurs
      Object.keys(this.employeForm.controls).forEach(key => {
        this.employeForm.get(key)?.markAsTouched();
      });
      Swal.fire('Erreur de validation', 'Veuillez remplir tous les champs requis', 'error');
    }
  }

  OnEdit(employe: any): void {
    this.selectedEmploye = employe;
    this.isEditMode = true;
    
    // Remplir le formulaire d'édition avec les données de l'employé
    this.editEmployeForm.patchValue({
      code: employe.code || '',
      nom: employe.nom || '',
      prenom: employe.prenom || '',
      telephone: employe.telephone || '',
      telegram_id: employe.telegram_id || ''
    });

    // Ouvrir le modal d'édition
    setTimeout(() => {
      const modalElement = document.getElementById('editEmployeModal');
      if (modalElement) {
        const anyWindow = window as any;
        if (anyWindow.bootstrap) {
          const modal = new anyWindow.bootstrap.Modal(modalElement);
          modal.show();
        }
      }
    }, 100);
  }

  updateEmploye(): void {
    
    if (this.editEmployeForm.valid && this.selectedEmploye) {
      const employeData = {
        code: this.editEmployeForm.value.code,
        nom: this.editEmployeForm.value.nom,
        prenom: this.editEmployeForm.value.prenom,
        telephone: this.editEmployeForm.value.telephone || null,
        telegram_id: this.editEmployeForm.value.telegram_id || null,
        titre: this.selectedEmploye.titre || null,
        naissance_dat: this.selectedEmploye.naissance_dat || null,
        piece_type: this.selectedEmploye.piece_type || null,
        piece_numero: this.selectedEmploye.piece_numero || null,
        securite_num: this.selectedEmploye.securite_num || null,
        fonction: this.selectedEmploye.fonction || null,
        departement_id: this.selectedEmploye.departement_id || null,
        contrat_typ: this.selectedEmploye.contrat_typ || null,
        embauche_dat: this.selectedEmploye.embauche_dat || null,
        sortie_dat: this.selectedEmploye.sortie_dat || null,
        etat: this.selectedEmploye.etat || 1,
        user_id: this.selectedEmploye.user_id || null
      };


      this.baseService.updateEmploye(this.selectedEmploye.id, employeData).subscribe({
        next: (response: any) => {
          Swal.fire({
            title: 'Succès',
            text: 'Employé modifié avec succès',
            icon: 'success',
            confirmButtonText: 'OK'
          }).then(() => {
            // Fermer le modal
            const modalElement = document.getElementById('editEmployeModal');
            if (modalElement) {
              const anyWindow = window as any;
              if (anyWindow.bootstrap) {
                const modal = anyWindow.bootstrap.Modal.getInstance(modalElement);
                if (modal) {
                  modal.hide();
                }
              }
            }
            // Rafraîchir la page
            window.location.reload();
          });
        },
        error: (error) => {
          const errorMessage = error.error?.message || error.message || 'Erreur lors de la modification de l\'employé';
          Swal.fire('Erreur', errorMessage, 'error');
        }
      });
    } else {
      // Marquer tous les champs comme touchés pour afficher les erreurs
      Object.keys(this.editEmployeForm.controls).forEach(key => {
        this.editEmployeForm.get(key)?.markAsTouched();
      });
      Swal.fire('Erreur de validation', 'Veuillez remplir tous les champs requis', 'error');
    }
  }

  closeEditModal(): void {
    this.selectedEmploye = null;
    this.isEditMode = false;
    this.editEmployeForm.reset();
    this.initEditForm();
  }

  archiveEmploye(employe: any): void {
    
    Swal.fire({
      title: 'Confirmer l\'archivage',
      text: `Êtes-vous sûr de vouloir archiver l'employé "${employe.nom} ${employe.prenom}" ?`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Oui, archiver',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        // Préparer les données avec etat = 0
        const employeData = {
          code: employe.code,
          nom: employe.nom,
          prenom: employe.prenom,
          telephone: employe.telephone || null,
          telegram_id: employe.telegram_id || null,
          titre: employe.titre || null,
          naissance_dat: employe.naissance_dat || null,
          piece_type: employe.piece_type || null,
          piece_numero: employe.piece_numero || null,
          securite_num: employe.securite_num || null,
          fonction: employe.fonction || null,
          departement_id: employe.departement_id || null,
          contrat_typ: employe.contrat_typ || null,
          embauche_dat: employe.embauche_dat || null,
          sortie_dat: employe.sortie_dat || null,
          etat: 0, // ✅ Archiver = etat = 0
          user_id: employe.user_id || null
        };


        this.baseService.updateEmploye(employe.id, employeData).subscribe({
          next: (response: any) => {
            Swal.fire({
              title: 'Archivé !',
              text: 'L\'employé a été archivé avec succès',
              icon: 'success',
              confirmButtonText: 'OK'
            }).then(() => {
              // Rafraîchir la page
              window.location.reload();
            });
          },
          error: (error) => {
            const errorMessage = error.error?.message || error.message || 'Erreur lors de l\'archivage de l\'employé';
            Swal.fire('Erreur', errorMessage, 'error');
          }
        });
      }
    });
  }

}

