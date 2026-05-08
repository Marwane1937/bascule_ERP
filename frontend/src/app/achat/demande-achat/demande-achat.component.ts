import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { AchatsService } from 'src/app/service/achats.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-demande-achat',
  templateUrl: './demande-achat.component.html',
  styleUrls: ['./demande-achat.component.css']
})
export class DemandeAchatComponent implements OnInit, AfterViewInit {
  demandesAchat: any[] = [];
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

  // Affichage de la ligne de filtres
  showFilterRow: boolean = false;

  // Filtres par colonne (style Excel) pour les demandes d'achat
  columnFilters: any = {
    numero: '',
    date: '',
    date_fin: '',
    fournisseur: '',
    description: ''
  };

  allDemandesAchat: any[] = []; // Stocker toutes les demandes d'achat pour le filtrage

  // Gestion des colonnes (affichage/masquage, épinglage, etc.)
  columnVisibility: any = {
    numero: true,
    date: true,
    date_fin: true,
    fournisseur: true,
    description: true
  };

  pinnedColumns: string[] = [];
  columnWidths: any = {};
  showColumnMenu: boolean = false;
  activeColumnMenu: string = '';
  menuPosition: any = { x: 0, y: 0 };

  fournisseurs: any[] = [];
  filteredFournisseurs: any[] = [];
  selectedFournisseur: any = null;
  DemandeAchatForm!: FormGroup;
  DemandesAchatSupprimes: number[] = [];
  successMessage: string | null = null;
  isError: boolean = false;
  
  // Numéro de demande d'achat
  nextDemandeAchatNumero: string = 'DA25-0001';

  constructor(
    private achatsService: AchatsService, 
    private router: Router,
    private baseService: BaseService, 
    private fb: FormBuilder, 
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.getDemandesAchat();
    this.AllFournisseurs();
    this.loadNextDemandeAchatNumero();

    // Abonnements sur les changements de texte
    this.DemandeAchatForm.get('fournisseurSearch')?.valueChanges.subscribe(value => {
      this.onSearchChange(value);
    });
  }
  
  loadNextDemandeAchatNumero(): void {
    this.achatsService.getNextDemandeAchatNumero().subscribe({
      next: (response: any) => {
        this.nextDemandeAchatNumero = response?.numero || 'DA25-0001';
      },
      error: (error) => {
        // Fallback: utiliser la méthode locale
        this.nextDemandeAchatNumero = this.getNextLigne();
      }
    });
  }

  initForm(): void {
    // Initialiser la date avec la date du jour au format YYYY-MM-DD
    const now = new Date();
   const pad = (n: number) => n.toString().padStart(2, '0');
   const datetimeLocal =
     `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T` +
     `${pad(now.getHours())}:${pad(now.getMinutes())}`;
   
    this.DemandeAchatForm = this.fb.group({
      date: [datetimeLocal, Validators.required],
      date_fin: [''],
      description: [''],
      part_id: [0],
      fournisseurSearch: [''],   // le texte visible pour fournisseur
    });
  }

  ngAfterViewInit(): void {
    // Ne rien faire ici, on initialise dans getFournisseurs après chargement
  }

  getNextLigne(): string {
    if (!this.demandesAchat || this.demandesAchat.length === 0) return 'DA25-0001';

    const numeros = this.demandesAchat
      .map(item => {
        const match = item.numero?.match(/^DA\d{2}-(\d{4})$/);
        return match ? parseInt(match[1], 10) : null;
      })
      .filter((n): n is number => n !== null);

    const maxNumero = Math.max(...numeros);
    const nextNumero = isFinite(maxNumero) ? maxNumero + 1 : 1;

    return 'DA25-' + nextNumero.toString().padStart(4, '0');
  }

  loadDemandesAchat(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loading = true;
    this.currentPage = page;
    this.searchTerm = search;
    
    if (resetFilters) {
      this.filterDateFrom = '';
      this.filterDateTo = '';
      this.filterFournisseur = '';
    }

    this.achatsService.getDemandeAchat({
      page: page,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: search
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};
        
        const allDemandesAchat = Array.isArray(result) ? result : [];
        
        // Stocker toutes les données pour le filtrage par colonne
        this.allDemandesAchat = allDemandesAchat;
        
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        
        // Extraire la liste des fournisseurs uniques pour le filtre
        this.extractFournisseursList(allDemandesAchat);
        
        // Appliquer les filtres avancés côté client
        let filtered = this.applyAdvancedFilters(allDemandesAchat);
        
        // Appliquer les filtres par colonne
        this.demandesAchat = this.applyColumnFilters(filtered);
        
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.showError("❌ Une erreur s'est produite lors du chargement des demandes d'achat.");
        this.loading = false;
      }
    });
  }

  getDemandesAchat(): void {
    this.loadDemandesAchat(this.currentPage, this.searchTerm);
  }

  extractFournisseursList(demandesAchat: any[]): void {
    const fournisseursSet = new Set<string>();
    demandesAchat.forEach(da => {
      if (da.fournisseur) {
        fournisseursSet.add(da.fournisseur);
      }
    });
    this.fournisseursList = Array.from(fournisseursSet).sort();
  }

  applyAdvancedFilters(demandesAchat: any[]): any[] {
    let filtered = [...demandesAchat];

    // Filtre par date
    if (this.filterDateFrom) {
      filtered = filtered.filter(da => {
        const daDate = new Date(da.date);
        const fromDate = new Date(this.filterDateFrom);
        return daDate >= fromDate;
      });
    }

    if (this.filterDateTo) {
      filtered = filtered.filter(da => {
        const daDate = new Date(da.date);
        const toDate = new Date(this.filterDateTo);
        toDate.setHours(23, 59, 59, 999);
        return daDate <= toDate;
      });
    }

    // Filtre par fournisseur
    if (this.filterFournisseur) {
      filtered = filtered.filter(da => 
        da.fournisseur && da.fournisseur.toLowerCase().includes(this.filterFournisseur.toLowerCase())
      );
    }

    return filtered;
  }

  onSearch(): void {
    this.currentPage = 1;
    this.getDemandesAchat();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.getDemandesAchat();
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.currentPage = 1;
    this.getDemandesAchat();
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
    this.getDemandesAchat();
  }

  AllFournisseurs(): void {
    this.baseService.getFournisseur().subscribe({
      next: (response: any) => {
        // La réponse du backend est { success: true, data: [...] }
        this.fournisseurs = response?.data || response || [];
        this.filteredFournisseurs = [...this.fournisseurs];
      },
      error: (error) => {
        this.fournisseurs = [];
        this.filteredFournisseurs = [];
      }
    });
  }

  onSearchChange(value: string): void {
    if (!value || value.trim() === '') {
      this.filteredFournisseurs = [...this.fournisseurs];
      this.selectedFournisseur = null;
      this.DemandeAchatForm.patchValue({ part_id: 0 });
      return;
    }

    this.filteredFournisseurs = this.fournisseurs.filter(f => 
      f.nom.toLowerCase().includes(value.toLowerCase())
    );
  }

  selectFournisseur(fournisseur: any): void {
    this.selectedFournisseur = fournisseur;
    this.DemandeAchatForm.patchValue({
      fournisseurSearch: fournisseur.nom,
      part_id: fournisseur.part_id
    });
    this.filteredFournisseurs = [];
  }

  onSubmit(): void {
    if (this.DemandeAchatForm.valid) {
      const formValue = this.DemandeAchatForm.value;
      
      // Vérifier que le fournisseur est sélectionné
      if (!formValue.part_id || formValue.part_id === 0) {
        Swal.fire('Erreur', 'Veuillez sélectionner un fournisseur', 'error');
        return;
      }
      
      const demandeAchatData = {
        date: formValue.date,
        date_fin: formValue.date_fin || null,
        description: formValue.description || '',
        part_id: formValue.part_id,
        type: 0  // type = 0 pour demande d'achat
      };

      this.achatsService.addDemandeAchat(demandeAchatData).subscribe({
        next: (response: any) => {
          Swal.fire('Succès', 'Demande d\'achat créée avec succès', 'success');
          this.DemandeAchatForm.reset();
          this.selectedFournisseur = null;
          this.initForm();
          this.getDemandesAchat();
          this.loadNextDemandeAchatNumero(); // Recharger le prochain numéro
          this.closeModal();
        },
        error: (error) => {
          Swal.fire('Erreur', 'Erreur lors de la création de la demande d\'achat', 'error');
        }
      });
    } else {
      Swal.fire('Erreur', 'Veuillez remplir tous les champs requis', 'error');
    }
  }

  editDemandeAchat(id: number): void {
    this.router.navigate(['/Edit-Demande-Achat', id]);
  }

  deleteDemandeAchat(id: number): void {

    Swal.fire({
      title: 'Êtes-vous sûr?',
      text: 'Vous ne pourrez pas annuler cette action!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Oui, supprimer!'
    }).then((result) => {
      if (result.isConfirmed) {

        this.achatsService.deleteDemandeAchat(id).subscribe({
          next: (response) => {
            Swal.fire('Supprimé!', 'La demande d\'achat a été supprimée.', 'success');
            this.getDemandesAchat();
          },
          error: (error) => {
            Swal.fire('Erreur', 'Erreur lors de la suppression', 'error');
          }
        });
      } else {
      }
    });
  }

  telechargerPDF(id: number): void {

    Swal.fire({
      title: 'Génération du PDF...',
      html: '<div class="loading-spinner"></div><p>Veuillez patienter</p>',
      showConfirmButton: false,
      allowOutsideClick: false
    });

    this.achatsService.telechargerPDFDemandeAchat(id).subscribe({
      next: (blob: Blob) => {

        Swal.close();

        // Créer un URL pour le blob et l'ouvrir dans un nouvel onglet
        const url = window.URL.createObjectURL(blob);

        window.open(url, '_blank');

        // Libérer l'URL après un délai
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 10000);
      },
      error: (err) => {

        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: 'Impossible de générer le PDF.'
        });
      }
    });
  }

  closeModal(): void {
    const modalElement = document.getElementById('addDemandeAchatModal');
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

  // ===== FILTRES PAR COLONNE (STYLE EXCEL) =====
  onColumnFilterChange(column: string, value: string): void {
    this.columnFilters[column] = value;
    this.applyColumnFilters();
  }

  applyColumnFilters(data?: any[]): any[] {
    const sourceData = data || this.allDemandesAchat;
    const filtered = sourceData.filter(item => {
      return Object.keys(this.columnFilters).every(key => {
        const filterValue = this.columnFilters[key];
        if (!filterValue) return true;
        
        let itemValue = item[key];
        if (itemValue === null || itemValue === undefined) return false;
        
        // Gestion spéciale pour les dates
        if ((key === 'date' || key === 'date_fin') && filterValue) {
          const filterDate = new Date(filterValue).toISOString().split('T')[0];
          const itemDate = itemValue ? new Date(itemValue).toISOString().split('T')[0] : '';
          return itemDate === filterDate;
        }
        
        return itemValue.toString().toLowerCase().includes(filterValue.toLowerCase());
      });
    });
    
    if (!data) {
      this.demandesAchat = filtered;
      this.totalRecords = filtered.length;
      this.totalPages = Math.ceil(this.totalRecords / this.pageSize);
      this.currentPage = 1;
      this.cdr.detectChanges();
    }
    
    return filtered;
  }

  clearColumnFilters(): void {
    this.columnFilters = {
      numero: '',
      date: '',
      date_fin: '',
      fournisseur: '',
      description: ''
    };
    this.applyColumnFilters();
  }

  // ===== GESTION DU MENU CONTEXTUEL DES COLONNES =====
  showColumnContextMenu(event: MouseEvent, column: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.activeColumnMenu = column;
    this.menuPosition = {
      x: event.clientX,
      y: event.clientY
    };
    this.showColumnMenu = true;
    this.cdr.detectChanges();
  }

  hideColumnContextMenu(): void {
    this.showColumnMenu = false;
    this.activeColumnMenu = '';
    this.cdr.detectChanges();
  }

  toggleColumnVisibility(column: string): void {
    this.columnVisibility[column] = !this.columnVisibility[column];
    this.hideColumnContextMenu();
  }

  togglePinColumn(column: string): void {
    const index = this.pinnedColumns.indexOf(column);
    if (index > -1) {
      this.pinnedColumns.splice(index, 1);
    } else {
      this.pinnedColumns.push(column);
    }
    this.hideColumnContextMenu();
  }

  isColumnPinned(column: string): boolean {
    return this.pinnedColumns.includes(column);
  }

  autoSizeColumn(column: string): void {
    this.columnWidths[column] = 'auto';
    this.hideColumnContextMenu();
  }

  autoSizeAllColumns(): void {
    Object.keys(this.columnVisibility).forEach(column => {
      this.columnWidths[column] = 'auto';
    });
    this.hideColumnContextMenu();
  }

  resetColumns(): void {
    this.columnVisibility = {
      numero: true,
      date: true,
      date_fin: true,
      fournisseur: true,
      description: true
    };
    this.pinnedColumns = [];
    this.columnWidths = {};
    this.hideColumnContextMenu();
  }

  getColumnDisplayName(column: string): string {
    const names: any = {
      numero: 'Numéro',
      date: 'Date',
      date_fin: 'Date livraison',
      fournisseur: 'Fournisseur',
      description: 'Description'
    };
    return names[column] || column;
  }

  showAllColumns(): void {
    Object.keys(this.columnVisibility).forEach(key => {
      this.columnVisibility[key] = true;
    });
    this.hideColumnContextMenu();
  }

  // Helper pour compter les colonnes visibles
  getVisibleColumnsCount(): number {
    return Object.keys(this.columnVisibility).filter(key => this.columnVisibility[key]).length;
  }

  // Helper pour afficher le menu contextuel avec stopPropagation
  openColumnMenu(event: MouseEvent, column: string): void {
    event.stopPropagation();
    this.showColumnContextMenu(event, column);
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort';
    }
    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  exportToCSV(): void {
    const headers = ['Numéro', 'Date', 'Date livraison', 'Fournisseur', 'Description'];
    const rows = this.demandesAchat.map(da => [
      da.numero || '',
      da.date ? new Date(da.date).toLocaleDateString('fr-FR') : '',
      da.date_fin ? new Date(da.date_fin).toLocaleDateString('fr-FR') : '',
      da.fournisseur || '',
      da.description || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `demandes_achat_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    this.showSuccess('✅ Export CSV réussi !');
  }
}
