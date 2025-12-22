import { AfterViewInit, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-produit',
  templateUrl: './produit.component.html',
  styleUrls: ['./produit.component.css']
})
export class ProduitComponent implements OnInit, AfterViewInit {
  produits: any[] = [];
  unites: any;
  familles: any;
  dataTable: any;
  loading: boolean = true; // ← par défaut on affiche le spinner
  produitForm!: FormGroup;
  successMessage: string = '';
  isEditMode: boolean = false;
  currentProduitId: string | null = null;
  constructor(private baseService: BaseService, private fb: FormBuilder, private router: Router) { }

  ngOnInit(): void {
    this.getProduits();
    this.AllUnite();
    this.AllFamille();
    this.initForm();
  }

  initForm(): void {
    this.produitForm = this.fb.group({
      article_cod: ['', Validators.required],
      article_nom: ['', Validators.required],
      prix_achat: [0],
      prix_vente: [0],
      famille: [0],
      unite_id: [null, Validators.required],
      prix_quantite: [1],
      etat: [1],
    });
  }

  ngAfterViewInit(): void {
    // Ne rien faire ici, on initialise dans getClients après chargement
  }

  getProduits(): void {
    this.loading = true;

    this.baseService.getProduit().subscribe((response: any) => {
      // Extraire les données de la réponse API qui est au format {success: true, data: [...]}
      this.produits = response?.data || (Array.isArray(response) ? response : []);

      setTimeout(() => {
        if (this.dataTable) {
          this.dataTable.destroy();
        }

        this.dataTable = $('#clientTable').DataTable({
          pageLength: 10,
          ordering: true,
          order: [[0, 'desc']], // Trier par la première colonne (Code produit) en DESC par défaut
          searching: true,
          lengthChange: true
        });


      }, 0);
      this.loading = false; // ✅ on cache le spinner après le chargement
    });
  }

  AllUnite() {
    this.baseService.getUnite().subscribe((response: any) => {
      // Extraire les données de la réponse API qui est au format {success: true, data: [...]}
      this.unites = response?.data || (Array.isArray(response) ? response : []);
    })
  }

  AllFamille() {
    this.baseService.getFamille().subscribe((response: any) => {
      // Extraire les données de la réponse API qui est au format {success: true, data: [...]}
      this.familles = response?.data || (Array.isArray(response) ? response : []);
    })
  }

  onSubmit(): void {
    if (this.produitForm.valid) {
      if (this.isEditMode && this.currentProduitId) {
        this.baseService.updateProduit(this.currentProduitId, this.produitForm.value).subscribe({
          next: () => {
            this.showSuccess('✅ Produit modifié avec succès !');
          },
          error: (err) => {
            console.error(err);
            this.showError("❌ Une erreur s'est produite lors de la modification du produit.");
          }
        });
      } else {
        this.baseService.addProduit(this.produitForm.value).subscribe({
          next: () => {
            this.showSuccess('✅ Produit ajouté avec succès !');
          },
          error: (err) => {
            console.error(err);
            this.showError("❌ Une erreur s'est produite lors de l'ajout du produit.");
          }
        });
      }
    } else {
      this.showError("❗ Le formulaire est invalide.");
    }
  }

  onEdit(produit: any): void {
    this.isEditMode = true;
    this.currentProduitId = produit.article_id;
    this.produitForm.patchValue({
      article_cod: produit.article_cod,
      article_nom: produit.article_nom,
      prix_achat: produit.prix_achat,
      prix_vente: produit.prix_vente,
      famille: produit.famille,
      unite_id: produit.unite_id,
      prix_quantite: produit.prix_quantite,
      etat: produit.etat
    });
    // Ouvrir le modal (Bootstrap 5)
    const modalElement = document.getElementById('addClientModal');
    if (modalElement) {
      const modal = new (window as any).bootstrap.Modal(modalElement);
      modal.show();
    }
  }

  onDelete(id: string): void {
    Swal.fire({
      title: 'Êtes-vous sûr ?',
      text: "Cette action est irréversible !",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Oui, supprimer !',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.baseService.deleteProduit(id).subscribe({
          next: () => {
            this.showSuccess('✅ Produit supprimé avec succès !');
          },
          error: (err) => {
            console.error(err);
            this.showError("❌ Une erreur s'est produite lors de la suppression.");
          }
        });
      }
    });
  }

  resetForm(): void {
    this.isEditMode = false;
    this.currentProduitId = null;
    this.produitForm.reset({
      prix_achat: 0,
      prix_vente: 0,
      prix_quantite: 1,
      etat: 1
    });
  }

  showSuccess(message: string) {
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: message,
      confirmButtonText: 'OK',
      customClass: {
        confirmButton: 'btn btn-success'
      },
      buttonsStyling: false
    }).then(() => {
      window.location.reload(); // 🔄 Rechargement après succès
    });
  }

  showError(message: string) {
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: message,
      confirmButtonText: 'Fermer',
      customClass: {
        confirmButton: 'btn btn-danger'
      },
      buttonsStyling: false
    });
  }

}
