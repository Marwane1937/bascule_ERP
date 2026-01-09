import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { AchatsService } from 'src/app/service/achats.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-bon-commande',
  templateUrl: './bon-commande.component.html',
  styleUrls: ['./bon-commande.component.css']
})
export class BonCommandeComponent implements OnInit, AfterViewInit {
  bonCommandes: any[] = [];
  dataTable: any;
  loading: boolean = true;
  searchTerm: string = '';
  
  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;
  
  // Tri
  sortColumn: string = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';
  
  // Filtres avancés
  showAdvancedFilters: boolean = false;
  filterDateFrom: string = '';
  filterDateTo: string = '';
  filterFournisseur: string = '';
  
  // Liste des fournisseurs pour le filtre
  fournisseursList: string[] = [];
  
  fournisseurs: any[] = [];
  filteredFournisseurs: any[] = [];
  selectedFournisseur: any = null;
  BonCommandeForm!: FormGroup;
  BonCommandesSupprimes: number[] = [];
  successMessage: string | null = null;
  isError: boolean = false;
  
  // Numéro de bon de commande
  nextBonCommandeNumero: string = 'BCF25-0001';

  constructor(
    private achatsService: AchatsService, 
    private router: Router,
    private baseService: BaseService, 
    private fb: FormBuilder, 
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.getBonCommandes();
    this.AllFournisseurs();
    this.loadNextBonCommandeNumero();

    // Abonnements sur les changements de texte
    this.BonCommandeForm.get('fournisseurSearch')?.valueChanges.subscribe(value => {
      this.onSearchChange(value);
    });
  }
  
  loadNextBonCommandeNumero(): void {
    this.achatsService.getNextBonCommandeNumero().subscribe({
      next: (response: any) => {
        this.nextBonCommandeNumero = response?.numero || 'BCF25-0001';
      },
      error: (error) => {
        console.error('Erreur lors du chargement du numéro de bon de commande:', error);
        // Fallback: utiliser la méthode locale
        this.nextBonCommandeNumero = this.getNextLigne();
      }
    });
  }

  initForm(): void {
    // Initialiser la date avec la date du jour au format YYYY-MM-DD
    const today = new Date();
    const todayString = today.toISOString().split('T')[0];
    
    this.BonCommandeForm = this.fb.group({
      date: [todayString, Validators.required],
      description: [''],
      part_id: [0],
      fournisseurSearch: [''],   // le texte visible pour fournisseur
    });
  }

  ngAfterViewInit(): void {
    // Ne rien faire ici, on initialise dans getFournisseurs après chargement
  }

  getNextLigne(): string {
    if (!this.bonCommandes || this.bonCommandes.length === 0) return 'BCF25-0001';

    const numeros = this.bonCommandes
      .map(item => {
        const match = item.numero?.match(/^BCF\d{2}-(\d{4})$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((n): n is number => n !== null);

    const maxNumero = Math.max(...numeros);
    const nextNumero = isFinite(maxNumero) ? maxNumero + 1 : 1;

    return 'BCF25-' + nextNumero.toString().padStart(4, '0');
  }

  loadBonCommandes(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loading = true;
    this.currentPage = page;
    this.searchTerm = search;
    
    if (resetFilters) {
      this.filterDateFrom = '';
      this.filterDateTo = '';
      this.filterFournisseur = '';
    }

    this.achatsService.getBonCommande({
      page: page,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: search
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};
        
        const allBonCommandes = Array.isArray(result) ? result : [];
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        
        // Extraire la liste des fournisseurs uniques pour le filtre
        this.extractFournisseursList(allBonCommandes);
        
        // Appliquer les filtres avancés côté client
        this.bonCommandes = this.applyAdvancedFilters(allBonCommandes);
        
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[BonCommandeComponent] ❌ Erreur lors du chargement des bons de commande:', err);
        this.showError("❌ Une erreur s'est produite lors du chargement des bons de commande.");
        this.loading = false;
      }
    });
  }

  getBonCommandes(): void {
    this.loadBonCommandes(this.currentPage, this.searchTerm);
  }

  extractFournisseursList(bonCommandes: any[]): void {
    const fournisseursSet = new Set<string>();
    bonCommandes.forEach(bc => {
      if (bc.fournisseur) {
        fournisseursSet.add(bc.fournisseur);
      }
    });
    this.fournisseursList = Array.from(fournisseursSet).sort();
  }

  applyAdvancedFilters(bonCommandes: any[]): any[] {
    let filtered = [...bonCommandes];

    // Filtre par date
    if (this.filterDateFrom) {
      filtered = filtered.filter(bc => {
        const bcDate = new Date(bc.date);
        const fromDate = new Date(this.filterDateFrom);
        return bcDate >= fromDate;
      });
    }

    if (this.filterDateTo) {
      filtered = filtered.filter(bc => {
        const bcDate = new Date(bc.date);
        const toDate = new Date(this.filterDateTo);
        toDate.setHours(23, 59, 59, 999);
        return bcDate <= toDate;
      });
    }

    // Filtre par fournisseur
    if (this.filterFournisseur) {
      filtered = filtered.filter(bc => 
        bc.fournisseur && bc.fournisseur.toLowerCase().includes(this.filterFournisseur.toLowerCase())
      );
    }

    return filtered;
  }

  onSearch(): void {
    this.currentPage = 1;
    this.getBonCommandes();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.getBonCommandes();
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.currentPage = 1;
    this.getBonCommandes();
  }

  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  resetFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterFournisseur = '';
    this.searchTerm = '';
    this.currentPage = 1;
    this.getBonCommandes();
  }

  AllFournisseurs(): void {
    this.baseService.getFournisseur().subscribe({
      next: (response: any) => {
        // La réponse du backend est { success: true, data: [...] }
        this.fournisseurs = response?.data || response || [];
        this.filteredFournisseurs = [...this.fournisseurs];
      },
      error: (error) => {
        console.error('Erreur lors du chargement des fournisseurs:', error);
        this.fournisseurs = [];
        this.filteredFournisseurs = [];
      }
    });
  }

  onSearchChange(value: string): void {
    if (!value || value.trim() === '') {
      this.filteredFournisseurs = [...this.fournisseurs];
      this.selectedFournisseur = null;
      this.BonCommandeForm.patchValue({ part_id: 0 });
      return;
    }

    this.filteredFournisseurs = this.fournisseurs.filter(f => 
      f.nom.toLowerCase().includes(value.toLowerCase())
    );
  }

  selectFournisseur(fournisseur: any): void {
    this.selectedFournisseur = fournisseur;
    this.BonCommandeForm.patchValue({
      fournisseurSearch: fournisseur.nom,
      part_id: fournisseur.part_id
    });
    this.filteredFournisseurs = [];
  }

  onSubmit(): void {
    if (this.BonCommandeForm.valid) {
      const formValue = this.BonCommandeForm.value;
      
      // Vérifier que le fournisseur est sélectionné
      if (!formValue.part_id || formValue.part_id === 0) {
        Swal.fire('Erreur', 'Veuillez sélectionner un fournisseur', 'error');
        return;
      }
      
      const bonCommandeData = {
        date: formValue.date,
        description: formValue.description || '',
        part_id: formValue.part_id,
        type: 2  // type = 2 pour bon de commande
      };

      this.achatsService.addBonCommande(bonCommandeData).subscribe({
        next: (response: any) => {
          Swal.fire('Succès', 'Bon de commande créé avec succès', 'success');
          this.BonCommandeForm.reset();
          this.selectedFournisseur = null;
          this.initForm();
          this.getBonCommandes();
          this.loadNextBonCommandeNumero(); // Recharger le prochain numéro
          this.closeModal();
        },
        error: (error) => {
          console.error('Erreur lors de la création:', error);
          Swal.fire('Erreur', 'Erreur lors de la création du bon de commande', 'error');
        }
      });
    } else {
      Swal.fire('Erreur', 'Veuillez remplir tous les champs requis', 'error');
    }
  }

  editBonCommande(id: number): void {
    this.router.navigate(['/Edit-Bon-Commande-Achat', id]);
  }

  deleteBonCommande(id: number): void {
    console.log('🗑️ Début de deleteBonCommande()');
    console.log('📋 ID du bon de commande à supprimer:', id);

    Swal.fire({
      title: 'Êtes-vous sûr?',
      text: 'Vous ne pourrez pas annuler cette action!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Oui, supprimer!'
    }).then((result) => {
      console.log('🔍 Résultat de la confirmation:', result);
      if (result.isConfirmed) {
        console.log('✅ Suppression confirmée, appel du service deleteBonCommande avec id:', id);

        this.achatsService.deleteBonCommande(id).subscribe({
          next: (response) => {
            console.log('✅ Suppression réussie, réponse du serveur:', response);
            Swal.fire('Supprimé!', 'Le bon de commande a été supprimé.', 'success');
            this.getBonCommandes();
          },
          error: (error) => {
            console.error('❌ Erreur lors de la suppression:', error);
            console.error('❌ Détails de l\'erreur:', error.error);
            console.error('❌ Statut HTTP:', error.status);
            console.error('❌ Message d\'erreur:', error.message);
            Swal.fire('Erreur', 'Erreur lors de la suppression', 'error');
          }
        });
      } else {
        console.log('❌ Suppression annulée par l\'utilisateur');
      }
    });
  }

  telechargerPDF(id: number): void {
    console.log('🚀 Début de telechargerPDF()');
    console.log('📋 ID du bon de commande:', id);

    Swal.fire({
      title: 'Génération du PDF...',
      html: '<div class="loading-spinner"></div><p>Veuillez patienter</p>',
      showConfirmButton: false,
      allowOutsideClick: false
    });

    console.log('📡 Appel du service telechargerPDF avec id:', id);
    this.achatsService.telechargerPDF(id).subscribe({
      next: (blob: Blob) => {
        console.log('✅ PDF généré avec succès, taille du blob:', blob.size, 'bytes');
        console.log('📎 Type du blob:', blob.type);

        Swal.close();

        // Créer un URL pour le blob et l'ouvrir dans un nouvel onglet
        const url = window.URL.createObjectURL(blob);
        console.log('🔗 URL créée pour le blob:', url);

        window.open(url, '_blank');

        // Libérer l'URL après un délai
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
          console.log('🧹 URL du blob libérée');
        }, 10000);
      },
      error: (err) => {
        console.error('❌ Erreur lors du téléchargement du PDF:', err);
        console.error('❌ Détails de l\'erreur:', err.error);
        console.error('❌ Statut HTTP:', err.status);
        console.error('❌ Message d\'erreur:', err.message);

        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: 'Impossible de générer le PDF.'
        });
      }
    });
  }

  closeModal(): void {
    const modalElement = document.getElementById('addBonCommandeModal');
    if (modalElement) {
      const anyWindow = window as any;
      if (anyWindow.bootstrap) {
        const modal = anyWindow.bootstrap.Modal.getInstance(modalElement);
        if (modal) {
          modal.hide();
        }
      }
    }
  }

  showError(message: string): void {
    this.isError = true;
    this.successMessage = null;
    setTimeout(() => {
      this.isError = false;
    }, 5000);
  }

  showSuccess(message: string): void {
    this.successMessage = message;
    this.isError = false;
    setTimeout(() => {
      this.successMessage = null;
    }, 3000);
  }

  getDisplayRange(): string {
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start} - ${end}`;
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPages - 1);

    if (endPage - startPage < maxPages - 1) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }
}

