import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { VentesService } from 'src/app/service/ventes.service';
import Swal from 'sweetalert2';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';

@Component({
  selector: 'app-bordereau-remise',
  templateUrl: './bordereau-remise.component.html',
  styleUrls: ['./bordereau-remise.component.css']
})
export class BordereauRemiseComponent implements OnInit, AfterViewInit, OnDestroy {
  bordereaux: any[] = []
  loading: boolean = true;
  successMessage: string | null = null;
  isError: boolean = false;
  
  // Dashboard
  showDashboard: boolean = false;
  dashboardLoading: boolean = false;
  dashboardStats: any = {
    totalBordereaux: 0,
    totalCheques: 0,
    totalMontant: 0,
    bordereauxParEtat: [],
    bordereauxParType: []
  };
  
  // Charts
  evolutionChart: any = null;
  etatChart: any = null;
  typeChart: any = null;
  
  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;
  searchTerm: string = '';
  
  // Tri
  sortColumn: string = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';
  
  // Filtres avancés
  showAdvancedFilters: boolean = false;
  filterDateFrom: string = '';
  filterDateTo: string = '';
  
  // Affichage de la ligne de filtres
  showFilterRow: boolean = false;

  // Filtres par colonne (style Excel) pour les bordereaux
  columnFilters: any = {
    numero: '',
    date: '',
    compte_cible: '',
    type: '',
    etat: '',
    nombre_cheques: '',
    montant_total: ''
  };

  allBordereaux: any[] = []; // Stocker tous les bordereaux pour le filtrage

  // Gestion des colonnes (affichage/masquage, épinglage, etc.)
  columnVisibility: any = {
    numero: true,
    date: true,
    compte_cible: true,
    type: true,
    etat: true,
    nombre_cheques: true,
    montant_total: true
  };

  pinnedColumns: string[] = [];
  columnWidths: any = {};
  showColumnMenu: boolean = false;
  activeColumnMenu: string = '';
  menuPosition: any = { x: 0, y: 0 };
  
  // Formulaire modal
  BordereauForm!: FormGroup;
  etats: any[] = [];
  types: any[] = [];
  nextBordereauNumero: string = 'BORD25-0001';
  
  constructor(
    private ventesService: VentesService,
    private router: Router,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.loadBordereaux();
    this.loadEtats();
    this.loadTypes();
    this.initForm();
    this.resetFormState();
  }

  ngAfterViewInit(): void {
    const anyWindow = window as any;
    // @ts-ignore
    if (typeof ($) !== 'undefined') {
      // @ts-ignore
      $('#addBordereauModal').on('shown.bs.modal', () => {
        this.resetFormState();
        this.loadNextBordereauNumero();
      });

      // @ts-ignore
      $('#addBordereauModal').on('hidden.bs.modal', () => {
        this.resetFormState();
      });
    }
  }

  ngOnDestroy(): void {
    // Détruire les graphiques
    if (this.evolutionChart) {
      this.evolutionChart.destroy();
    }
    if (this.etatChart) {
      this.etatChart.destroy();
    }
    if (this.typeChart) {
      this.typeChart.destroy();
    }
  }
  
  // Dashboard Methods
  toggleDashboard(): void {
    this.showDashboard = !this.showDashboard;
    if (this.showDashboard) {
      this.loadDashboardStats();
    }
  }

  loadDashboardStats(): void {
    this.dashboardLoading = true;
    
    // Charger tous les bordereaux pour calculer les statistiques
    this.ventesService.getBordereaux({
      page: 1,
      pageSize: 10000, // Charger tous les bordereaux
      orderBy: 'date',
      orderDirection: 'DESC',
      search: ''
    }).subscribe({
      next: (response: any) => {
        const allBordereaux = response.data || [];
        this.calculateDashboardStats(allBordereaux);
        this.dashboardLoading = false;
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement des statistiques:', err);
        this.dashboardLoading = false;
        this.showError("❌ Impossible de charger les statistiques du dashboard.");
      }
    });
  }

  calculateDashboardStats(bordereaux: any[]): void {
    // Calculer le total des bordereaux
    this.dashboardStats.totalBordereaux = bordereaux.length;

    // Calculer le total des chèques et montants
    let totalCheques = 0;
    let totalMontant = 0;
    
    bordereaux.forEach(b => {
      totalCheques += parseInt(b.nombre_cheques) || 0;
      totalMontant += parseFloat(b.montant_total) || 0;
    });
    
    this.dashboardStats.totalCheques = totalCheques;
    this.dashboardStats.totalMontant = totalMontant;

    // Grouper par état
    const etatStats: { [key: string]: { etat: string; count: number; montant: number } } = {};
    bordereaux.forEach(b => {
      const etatNom = b.etat_nom || 'Non spécifié';
      if (!etatStats[etatNom]) {
        etatStats[etatNom] = {
          etat: etatNom,
          count: 0,
          montant: 0
        };
      }
      etatStats[etatNom].count += 1;
      etatStats[etatNom].montant += parseFloat(b.montant_total) || 0;
    });
    this.dashboardStats.bordereauxParEtat = Object.values(etatStats)
      .sort((a: any, b: any) => b.count - a.count);

    // Grouper par type
    const typeStats: { [key: string]: { type: string; count: number; montant: number } } = {};
    bordereaux.forEach(b => {
      const typeNom = b.type_nom || 'Non spécifié';
      if (!typeStats[typeNom]) {
        typeStats[typeNom] = {
          type: typeNom,
          count: 0,
          montant: 0
        };
      }
      typeStats[typeNom].count += 1;
      typeStats[typeNom].montant += parseFloat(b.montant_total) || 0;
    });
    this.dashboardStats.bordereauxParType = Object.values(typeStats)
      .sort((a: any, b: any) => b.count - a.count);

    // Initialiser les graphiques après un court délai
    setTimeout(() => {
      this.initCharts(bordereaux);
    }, 100);
  }

  initCharts(bordereaux: any[]): void {
    this.createEvolutionChart(bordereaux);
    this.createEtatChart(bordereaux);
    this.createTypeChart(bordereaux);
  }

  createEvolutionChart(bordereaux: any[]): void {
    const canvas = document.getElementById('evolutionBordereauChart') as HTMLCanvasElement;
    if (!canvas) return;

    if (this.evolutionChart) {
      this.evolutionChart.destroy();
    }

    // Grouper par mois
    const monthlyData: { [key: string]: number } = {};
    bordereaux.forEach(b => {
      if (b.date) {
        const date = new Date(b.date);
        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthlyData[monthKey] = (monthlyData[monthKey] || 0) + (parseFloat(b.montant_total) || 0);
      }
    });

    const sortedMonths = Object.keys(monthlyData).sort();
    const labels = sortedMonths.map(m => {
      const [year, month] = m.split('-');
      const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];
      return `${monthNames[parseInt(month) - 1]} ${year}`;
    });
    const data = sortedMonths.map(m => monthlyData[m]);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    this.evolutionChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Montant Total (DH)',
          data: data,
          borderColor: 'rgb(75, 192, 192)',
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          tension: 0.4,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'top' }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value: any) {
                return value.toFixed(2) + ' DH';
              }
            }
          }
        }
      }
    });
  }

  createEtatChart(bordereaux: any[]): void {
    const canvas = document.getElementById('etatBordereauChart') as HTMLCanvasElement;
    if (!canvas) return;

    if (this.etatChart) {
      this.etatChart.destroy();
    }

    const labels = this.dashboardStats.bordereauxParEtat.map((e: any) => e.etat);
    const data = this.dashboardStats.bordereauxParEtat.map((e: any) => e.count);
    const colors = [
      'rgba(255, 99, 132, 0.8)',
      'rgba(54, 162, 235, 0.8)',
      'rgba(255, 206, 86, 0.8)',
      'rgba(75, 192, 192, 0.8)',
      'rgba(153, 102, 255, 0.8)'
    ];

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    this.etatChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors.slice(0, labels.length),
          borderWidth: 2,
          borderColor: '#fff'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true, position: 'right' }
        }
      }
    });
  }

  createTypeChart(bordereaux: any[]): void {
    const canvas = document.getElementById('typeBordereauChart') as HTMLCanvasElement;
    if (!canvas) return;

    if (this.typeChart) {
      this.typeChart.destroy();
    }

    const labels = this.dashboardStats.bordereauxParType.map((t: any) => t.type);
    const data = this.dashboardStats.bordereauxParType.map((t: any) => t.montant);
    const colors = [
      'rgba(54, 162, 235, 0.8)',
      'rgba(255, 206, 86, 0.8)',
      'rgba(75, 192, 192, 0.8)',
      'rgba(153, 102, 255, 0.8)',
      'rgba(255, 159, 64, 0.8)'
    ];

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    this.typeChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Montant Total (DH)',
          data: data,
          backgroundColor: colors.slice(0, labels.length),
          borderColor: colors.slice(0, labels.length),
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(value: any) {
                return value.toFixed(2) + ' DH';
              }
            }
          }
        }
      }
    });
  }

  initForm(): void {
    this.BordereauForm = this.fb.group({
      numero: [''],
      date: [new Date().toISOString().substring(0, 10), Validators.required],
      compte_cible: [''],
      type: [null],
      etat: [null]
    });
  }

  private resetFormState(): void {
    if (!this.BordereauForm) {
      return;
    }

    this.BordereauForm.reset({
      numero: '',
      date: new Date().toISOString().substring(0, 10),
      compte_cible: '',
      type: null,
      etat: null
    }, { emitEvent: false });
  }

  loadBordereaux(): void {
    this.loading = true;
    this.ventesService.getBordereaux({
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: this.searchTerm
    }).subscribe({
      next: (response: any) => {
        const data = response?.data || [];
        this.allBordereaux = data; // Stocker tous les bordereaux pour le filtrage
        this.bordereaux = data;
        this.totalRecords = response?.pagination?.total || 0;
        this.totalPages = response?.pagination?.totalPages || 0;
        this.loading = false;
        // Appliquer les filtres par colonne après le chargement
        this.applyColumnFilters();
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement des bordereaux:', err);
        this.showError("❌ Impossible de charger les bordereaux.");
        this.loading = false;
      }
    });
  }

  loadEtats(): void {
    this.ventesService.getEtats().subscribe({
      next: (response: any) => {
        this.etats = response?.data || [];
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

  loadNextBordereauNumero(): void {
    this.ventesService.getNextBordereauNumero().subscribe({
      next: (response: any) => {
        if (response && response.numero) {
          this.nextBordereauNumero = response.numero;
          this.BordereauForm.patchValue({ numero: response.numero });
        }
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement du numéro:', err);
      }
    });
  }

  onSubmitBordereau(): void {
    if (this.BordereauForm.valid) {
      const formValue = this.BordereauForm.value;
      const bordereauData: any = {
        numero: '',
        date: formValue.date,
        compte_cible: formValue.compte_cible || null,
        type: formValue.type || null,
        etat: formValue.etat || null
      };
      
      this.ventesService.addBordereau(bordereauData).subscribe({
        next: (response: any) => {
          const numero = response?.numero || response?.data?.numero || bordereauData.numero;
          this.showNotification(`✅ Bordereau ${numero || ''} créé avec succès !`, false);
          
          this.closeModal();
          
          this.BordereauForm.reset();
          this.initForm();
          this.loadBordereaux();
          
          setTimeout(() => {
            this.loadNextBordereauNumero();
          }, 300);
        },
        error: (err: any) => {
          this.showError(`❌ Une erreur s'est produite lors de la création du bordereau: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    } else {
      this.showError("❗ Le formulaire est invalide. Veuillez remplir tous les champs requis.");
    }
  }

  private closeModal(): void {
    const modalElement = document.getElementById('addBordereauModal');
    if (modalElement) {
      const anyWindow = window as any;
      if (anyWindow.bootstrap && anyWindow.bootstrap.Modal) {
        const modalInstance = anyWindow.bootstrap.Modal.getInstance(modalElement);
        if (modalInstance) {
          modalInstance.hide();
        }
      } else {
        // Fallback jQuery si Bootstrap n'est pas disponible
        // @ts-ignore
        if (typeof ($) !== 'undefined') {
          // @ts-ignore
          $('#addBordereauModal').modal('hide');
        }
      }
    }
  }

  onSearch(): void {
    this.currentPage = 1;
    this.loadBordereaux();
  }

  onPageChange(page: number): void {
    this.currentPage = page;
    this.loadBordereaux();
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.loadBordereaux();
  }

  editBordereau(id: number): void {
    this.router.navigate(['/Finance/Bordereau-Remise/Edit', id]);
  }

  getSortIcon(column: string): string {
    if (this.sortColumn === column) {
      return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
    }
    return 'fa-sort';
  }

  deleteBordereau(id: number): void {
    Swal.fire({
      title: 'Êtes-vous sûr ?',
      text: "Cette action est irréversible !",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#d33',
      cancelButtonColor: '#3085d6',
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler'
    }).then((result) => {
      if (result.isConfirmed) {
        this.ventesService.deleteBordereau(id).subscribe({
          next: () => {
            this.showNotification('✅ Bordereau supprimé avec succès !', false);
            this.loadBordereaux();
          },
          error: (err: any) => {
            this.showError(`❌ Erreur lors de la suppression: ${err.error?.message || err.message || 'Erreur inconnue'}`);
          }
        });
      }
    });
  }

  getEtatNom(etatId: number | null): string {
    if (!etatId) return '-';
    const etat = this.etats.find(e => e.id === etatId);
    return etat ? etat.nom : '-';
  }

  getTypeNom(typeId: number | null): string {
    if (!typeId) return '-';
    const type = this.types.find(t => t.id === typeId);
    return type ? type.nom : '-';
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

  exportToCSV(): void {
    // TODO: Implémenter l'export CSV
    this.showNotification('Fonctionnalité d\'export à venir', false);
  }

  Math = Math;

  onFilterChange(): void {
    this.currentPage = 1;
    this.loadBordereaux();
  }

  resetFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.searchTerm = '';
    this.currentPage = 1;
    this.loadBordereaux();
  }

  // ===== FILTRES PAR COLONNE (STYLE EXCEL) =====
  onColumnFilterChange(column: string, value: string): void {
    this.columnFilters[column] = value;
    this.applyColumnFilters();
  }

  applyColumnFilters(): void {
    if (!this.allBordereaux || this.allBordereaux.length === 0) {
      return;
    }
    
    this.bordereaux = this.allBordereaux.filter(item => {
      return Object.keys(this.columnFilters).every(key => {
        const filterValue = this.columnFilters[key];
        if (!filterValue) return true;
        
        let itemValue = item[key];
        if (itemValue === null || itemValue === undefined) return false;
        
        // Gestion spéciale pour les dates
        if (key === 'date' && filterValue) {
          const filterDate = new Date(filterValue).toISOString().split('T')[0];
          const itemDate = itemValue ? new Date(itemValue).toISOString().split('T')[0] : '';
          return itemDate === filterDate;
        }
        
        // Gestion spéciale pour les montants numériques
        if ((key === 'nombre_cheques' || key === 'montant_total') && filterValue) {
          const filterNum = parseFloat(filterValue);
          const itemNum = parseFloat(itemValue) || 0;
          return !isNaN(filterNum) && itemNum >= filterNum;
        }
        
        // Gestion pour les types et états (recherche par nom)
        if ((key === 'type' || key === 'etat') && filterValue) {
          const typeNom = this.getTypeNom(item.type);
          const etatNom = this.getEtatNom(item.etat);
          const searchValue = key === 'type' ? typeNom : etatNom;
          return searchValue.toLowerCase().includes(filterValue.toLowerCase());
        }
        
        return itemValue.toString().toLowerCase().includes(filterValue.toLowerCase());
      });
    });
    
    this.totalRecords = this.bordereaux.length;
    this.totalPages = Math.ceil(this.totalRecords / this.pageSize);
    this.currentPage = 1;
    this.cdr.detectChanges();
  }

  clearColumnFilters(): void {
    this.columnFilters = {
      numero: '',
      date: '',
      compte_cible: '',
      type: '',
      etat: '',
      nombre_cheques: '',
      montant_total: ''
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
      compte_cible: true,
      type: true,
      etat: true,
      nombre_cheques: true,
      montant_total: true
    };
    this.pinnedColumns = [];
    this.columnWidths = {};
    this.hideColumnContextMenu();
  }

  getColumnDisplayName(column: string): string {
    const names: any = {
      numero: 'Numéro',
      date: 'Date',
      compte_cible: 'Compte Cible',
      type: 'Type',
      etat: 'État',
      nombre_cheques: 'Nombre Chèques',
      montant_total: 'Montant Total'
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

