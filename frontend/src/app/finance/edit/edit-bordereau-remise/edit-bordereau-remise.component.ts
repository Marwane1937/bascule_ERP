import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { VentesService } from 'src/app/service/ventes.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-edit-bordereau-remise',
  templateUrl: './edit-bordereau-remise.component.html',
  styleUrls: ['./edit-bordereau-remise.component.css']
})
export class EditBordereauRemiseComponent implements OnInit {
  bordereauForm!: FormGroup;
  bordereauId: string | null = null;
  isEditMode: boolean = false;
  loading: boolean = false;
  
  etats: any[] = [];
  types: any[] = [];
  
  // Chèques pour le bordereau
  cheques: any[] = [];
  filteredCheques: any[] = [];
  loadingCheques: boolean = false;
  selectedCheques: Set<number> = new Set();
  removedCheques: Set<number> = new Set(); // Chèques décochés (retirés)
  
  // Pagination
  currentPage: number = 1;
  pageSize: number = 10;
  totalPages: number = 1;
  
  // Filtres
  searchFilter: string = '';
  
  // Tri
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'desc';
  
  successMessage: string | null = null;
  isError: boolean = false;
  infoMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private ventesService: VentesService
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadEtats();
    this.loadTypes();
    
    this.bordereauId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = this.bordereauId !== null && this.bordereauId !== 'new';
    
    if (this.isEditMode && this.bordereauId) {
      this.loadBordereauById(+this.bordereauId);
    } else {
      // Mode création : charger les chèques disponibles
      this.loadChequesForBordereau();
    }
  }

  initForm(): void {
    this.bordereauForm = this.fb.group({
      numero: ['', Validators.required],
      date: [new Date().toISOString().substring(0, 10), Validators.required],
      compte_cible: [''],
      type: [null],
      etat: [null]
    });
  }

  loadEtats(): void {
    this.ventesService.getEtats().subscribe({
      next: (response: any) => {
        this.etats = response?.data || [];
        // Trouver l'état "Créé" et le définir par défaut si en mode création
        if (!this.isEditMode) {
          const etatCree = this.etats.find((e: any) => 
            e.nom && (e.nom.toLowerCase().includes('créé') || e.nom.toLowerCase().includes('cree') || e.nom.toLowerCase().includes('créer'))
          );
          if (etatCree) {
            this.bordereauForm.patchValue({ etat: etatCree.id });
          }
        }
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement des états:', err);
      }
    });
  }

  loadTypes(): void {
    this.ventesService.getTypes().subscribe({
      next: (response: any) => {
        this.types = response?.data || [];
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement des types:', err);
      }
    });
  }

  loadBordereauById(id: number): void {
    this.loading = true;
    this.ventesService.getBordereauById(id).subscribe({
      next: (response: any) => {
        const bordereau = response?.data || response;
        if (bordereau) {
          this.bordereauForm.patchValue({
            numero: bordereau.numero || '',
            date: bordereau.date ? new Date(bordereau.date).toISOString().substring(0, 10) : '',
            compte_cible: bordereau.compte_cible || '',
            type: bordereau.type || null,
            etat: bordereau.etat || null
          });
          
          // Charger les chèques du bordereau (pour marquer ceux déjà sélectionnés)
          this.loadChequesByBordereau(id);
        }
        this.loading = false;
      },
      error: (err: any) => {
        this.showError('Erreur lors du chargement du bordereau');
        this.loading = false;
      }
    });
  }

  loadChequesForBordereau(): void {
    this.loadingCheques = true;
    const bordereauId = this.isEditMode && this.bordereauId ? +this.bordereauId : undefined;
    this.ventesService.getChequesForBordereau(bordereauId).subscribe({
      next: (response: any) => {
        let chequesData: any[] = [];
        
        if (Array.isArray(response)) {
          chequesData = response;
        } else if (response && typeof response === 'object' && response.data) {
          chequesData = Array.isArray(response.data) ? response.data : [];
        }
        
        this.cheques = chequesData.map((cheque: any) => {
          const regleId = cheque.regle_id || cheque.id;
          const isSelected = this.selectedCheques.has(regleId);
          const isRemoved = this.removedCheques.has(regleId);
          
          return {
            ...cheque,
            selected: isSelected && !isRemoved,
            status: isRemoved ? 'retiré' : (isSelected ? 'inclus' : 'disponible')
          };
        });
        
        this.applyFilter();
        this.loadingCheques = false;
      },
      error: (err: any) => {
        this.cheques = [];
        this.filteredCheques = [];
        this.loadingCheques = false;
      }
    });
  }

  loadChequesByBordereau(bordereau_id: number): void {
    this.loadingCheques = true;
    this.ventesService.getChequesByBordereau(bordereau_id).subscribe({
      next: (response: any) => {
        let chequesData: any[] = [];
        
        if (Array.isArray(response)) {
          chequesData = response;
        } else if (response && typeof response === 'object' && response.data) {
          chequesData = Array.isArray(response.data) ? response.data : [];
        }
        
        // Marquer les chèques comme sélectionnés AVANT de charger tous les chèques
        chequesData.forEach((cheque: any) => {
          const regleId = cheque.regle_id || cheque.id;
          if (regleId) {
            this.selectedCheques.add(regleId);
          }
        });
        
        // Charger TOUS les chèques (y compris ceux déjà dans le bordereau) avec le bordereau_id
        this.loadChequesForBordereau();
      },
      error: (err: any) => {
        this.loadingCheques = false;
      }
    });
  }
  
  applyFilter(): void {
    let filtered = [...this.cheques];
    
    // Filtre de recherche texte
    if (this.searchFilter && this.searchFilter.trim() !== '') {
      const filter = this.searchFilter.toLowerCase().trim();
      filtered = filtered.filter(cheque => 
        (cheque.numero && cheque.numero.toLowerCase().includes(filter)) ||
        (cheque.client && cheque.client.toLowerCase().includes(filter)) ||
        (cheque.date && cheque.date.toString().includes(filter))
      );
    }
    
    // Appliquer le tri
    if (this.sortColumn) {
      filtered = this.sortCheques(filtered, this.sortColumn, this.sortDirection);
    }
    
    this.filteredCheques = filtered;
    this.totalPages = Math.ceil(this.filteredCheques.length / this.pageSize);
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    }
  }
  
  sortCheques(cheques: any[], column: string, direction: 'asc' | 'desc'): any[] {
    return [...cheques].sort((a, b) => {
      let aValue: any;
      let bValue: any;
      
      switch (column) {
        case 'numero':
          aValue = a.numero || '';
          bValue = b.numero || '';
          break;
        case 'date':
          aValue = new Date(a.date || 0).getTime();
          bValue = new Date(b.date || 0).getTime();
          break;
        case 'client':
          aValue = a.client || '';
          bValue = b.client || '';
          break;
        case 'montant':
          aValue = parseFloat(a.montant || 0);
          bValue = parseFloat(b.montant || 0);
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) return direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return direction === 'asc' ? 1 : -1;
      return 0;
    });
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'asc';
    }
    this.applyFilter();
  }

  toggleChequeSelection(cheque: any): void {
    const regleId = cheque.regle_id || cheque.id;
    
    // Si le chèque était déjà sélectionné (dans le bordereau), le marquer comme retiré
    if (this.selectedCheques.has(regleId)) {
      this.selectedCheques.delete(regleId);
      this.removedCheques.add(regleId);
      cheque.status = 'retiré';
    } else {
      // Si le chèque était retiré, le remettre
      if (this.removedCheques.has(regleId)) {
        this.removedCheques.delete(regleId);
      }
      this.selectedCheques.add(regleId);
      cheque.status = 'inclus';
    }
    cheque.selected = this.selectedCheques.has(regleId) && !this.removedCheques.has(regleId);
  }

  isChequeSelected(cheque: any): boolean {
    const regleId = cheque.regle_id || cheque.id;
    return this.selectedCheques.has(regleId) && !this.removedCheques.has(regleId);
  }

  getChequeStatus(cheque: any): string {
    const regleId = cheque.regle_id || cheque.id;
    if (this.removedCheques.has(regleId)) {
      return 'retiré';
    }
    if (this.selectedCheques.has(regleId)) {
      return 'inclus';
    }
    return 'disponible';
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'inclus':
        return 'badge bg-success';
      case 'retiré':
        return 'badge bg-danger';
      case 'disponible':
        return 'badge bg-secondary';
      default:
        return 'badge bg-secondary';
    }
  }

  getStatusLabel(status: string): string {
    switch (status) {
      case 'inclus':
        return 'Inclus';
      case 'retiré':
        return 'Retiré';
      case 'disponible':
        return 'Disponible';
      default:
        return status;
    }
  }

  isChequeEchu(cheque: any): boolean {
    if (!cheque.echeance) {
      return false; // Pas d'échéance = pas échu
    }
    const echeanceDate = new Date(cheque.echeance);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    echeanceDate.setHours(0, 0, 0, 0);
    return echeanceDate <= today;
  }

  canSelectCheque(cheque: any): boolean {
    // Permettre la sélection si le chèque est disponible (pas déjà dans un autre bordereau)
    // ou si c'est le bordereau actuel
    const status = this.getChequeStatus(cheque);
    
    // Si le chèque est déjà dans un autre bordereau (et pas celui qu'on édite), on ne peut pas le sélectionner
    if (cheque.current_bordereau_id && this.bordereauId && cheque.current_bordereau_id !== +this.bordereauId) {
      return false;
    }
    
    // Permettre la sélection pour tous les chèques disponibles ou inclus dans ce bordereau
    return true;
  }

  areAllChequesSelected(): boolean {
    if (this.filteredCheques.length === 0) {
      return false;
    }
    // Vérifier seulement les chèques échus
    const chequesEchus = this.filteredCheques.filter(c => this.isChequeEchu(c));
    if (chequesEchus.length === 0) {
      return false;
    }
    return chequesEchus.every(c => this.isChequeSelected(c));
  }

  toggleAllCheques(event: any): void {
    const checked = event.target.checked;
    this.filteredCheques.forEach(c => {
      // Ne sélectionner que les chèques échus
      if (!this.isChequeEchu(c)) {
        return;
      }
      const regleId = c.regle_id || c.id;
      if (checked) {
        this.selectedCheques.add(regleId);
      } else {
        this.selectedCheques.delete(regleId);
      }
    });
  }

  getSelectedChequesCount(): number {
    return this.selectedCheques.size;
  }

  goToPreviousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage = this.currentPage - 1;
      this.applyFilter();
    }
  }

  goToPage(page: number): void {
    this.currentPage = page;
    this.applyFilter();
  }

  goToNextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage = this.currentPage + 1;
      this.applyFilter();
    }
  }

  getSelectedChequesTotal(): number {
    let total = 0;
    this.cheques.forEach(cheque => {
      const regleId = cheque.regle_id || cheque.id;
      if (this.selectedCheques.has(regleId)) {
        total += parseFloat(cheque.montant || 0);
      }
    });
    return total;
  }

  onSubmit(): void {
    if (this.bordereauForm.valid) {
      const formValue = this.bordereauForm.value;
      const bordereauData: any = {
        numero: formValue.numero,
        date: formValue.date,
        compte_cible: formValue.compte_cible || null,
        type: formValue.type || null,
        etat: formValue.etat || null
      };
      
      // Si pas d'état défini et en mode création, définir automatiquement "Créé"
      if (!bordereauData.etat && !this.isEditMode) {
        const etatCree = this.etats.find((e: any) => 
          e.nom && (e.nom.toLowerCase().includes('créé') || e.nom.toLowerCase().includes('cree'))
        );
        if (etatCree) {
          bordereauData.etat = etatCree.id;
        }
      }
      
      if (this.isEditMode && this.bordereauId) {
        const bordereauIdNum = +this.bordereauId;
        // Mise à jour
        this.ventesService.updateBordereau(bordereauIdNum, bordereauData).subscribe({
          next: (response: any) => {
            // Enregistrer les chèques sélectionnés
            this.saveCheques(bordereauIdNum);
          },
          error: (err: any) => {
            this.showError(`❌ Erreur lors de la mise à jour: ${err.error?.message || err.message || 'Erreur inconnue'}`);
          }
        });
      } else {
        // Création
        this.ventesService.addBordereau(bordereauData).subscribe({
          next: (response: any) => {
            const bordereauId = response?.data?.id || response?.id;
            if (bordereauId) {
              // Enregistrer les chèques sélectionnés
              this.saveCheques(bordereauId);
            } else {
              this.showError('❌ Erreur: ID du bordereau non retourné');
            }
          },
          error: (err: any) => {
            this.showError(`❌ Erreur lors de la création: ${err.error?.message || err.message || 'Erreur inconnue'}`);
          }
        });
      }
    } else {
      this.showError("❗ Le formulaire est invalide. Veuillez remplir tous les champs requis.");
    }
  }

  saveCheques(bordereau_id: number): void {
    // Exclure les chèques retirés de la liste à sauvegarder
    const chequesToSave = Array.from(this.selectedCheques)
      .filter(regleId => !this.removedCheques.has(regleId))
      .map(regleId => {
        const cheque = this.cheques.find(c => (c.regle_id || c.id) === regleId);
        return {
          regle_id: regleId,
          ref_banque: cheque?.ref_banque || '',
          etat: 1
        };
      });
    
    this.ventesService.saveChequesBordereau(bordereau_id, chequesToSave).subscribe({
      next: (response: any) => {
        this.showNotification('✅ Bordereau enregistré avec succès !', false);
        setTimeout(() => {
          this.router.navigate(['/Finance/Bordereau-Remise']);
        }, 1500);
      },
      error: (err: any) => {
        this.showError(`❌ Erreur lors de l'enregistrement des chèques: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  showNotification(message: string, isError: boolean = false): void {
    this.successMessage = message;
    this.isError = isError;
    setTimeout(() => {
      this.successMessage = null;
    }, 5000);
  }

  showError(message: string): void {
    this.showNotification(message, true);
  }

  cancel(): void {
    this.router.navigate(['/Finance/Bordereau-Remise']);
  }

  telechargerPDF(id: number): void {
    // Appeler la route POST pour générer le PDF
    this.ventesService.http.post<any>(`${this.ventesService.apiUrl}/bordereau-remise-pdf/generate`, { bordereau_id: id })
      .subscribe({
        next: (response: any) => {
          if (response.success && response.pdfUrl) {
            // Ouvrir le PDF dans un nouvel onglet
            window.open(response.pdfUrl, '_blank');
          } else {
            this.showError('❌ Erreur lors de la génération du PDF');
          }
        },
        error: (err: any) => {
          console.error('Erreur génération PDF:', err);
          this.showError(`❌ Erreur lors de la génération du PDF: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
  }
}

