import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { VentesService } from 'src/app/service/ventes.service';
import { EmailService } from 'src/app/service/email.service';
import { PermissionsService } from 'src/app/service/permissions.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-facturation',
  templateUrl: './facturation.component.html',
  styleUrls: ['./facturation.component.css']
})
export class FacturationComponent implements OnInit, AfterViewInit {
  factures: any[] = [];
  allFactures: any[] = []; // Stocker toutes les factures pour le filtrage
  loading: boolean = true;
  successMessage: string | null = null;
  isError: boolean = false;
  
  // Pagination
  currentPage: number = 1;
  pageSize: number = 25;
  totalRecords: number = 0;
  totalPages: number = 0;
  searchTerm: string = '';
  
  // Tri
  sortColumn: string = 'facture_dat';
  sortDirection: 'ASC' | 'DESC' = 'DESC';
  
  // Filtres avancés
  showAdvancedFilters: boolean = false;
  filterDateFrom: string = '';
  filterDateTo: string = '';
  filterClient: string = '';
  filterMontantMin: number | null = null;
  filterMontantMax: number | null = null;
  
  // Affichage de la ligne de filtres
  showFilterRow: boolean = false;
  
  // Liste des clients pour le filtre
  clientsList: string[] = [];

  // Filtres par colonne (style Excel)
  columnFilters: any = {
    facture_num: '',
    facture_dat: '',
    client: '',
    total_ht: '',
    total_tva: '',
    total_ttc: '',
    status: ''
  };

  // Options pour le filtre Etat
  etatOptions = [
    { value: 'Payée', label: 'Payée', checked: false },
    { value: 'Partiellement Payée', label: 'Partiellement Payée', checked: false },
    { value: 'Non Payée', label: 'Non Payée', checked: false }
  ];

  // Menu déroulant ouvert pour Etat
  showEtatFilter: boolean = false;

  // Gestion des colonnes (affichage/masquage, épinglage, etc.)
  columnVisibility: any = {
    facture_num: true,
    facture_dat: true,
    client: true,
    total_ht: true,
    total_tva: true,
    total_ttc: true,
    status: true
  };

  pinnedColumns: string[] = [];
  columnWidths: any = {};
  showColumnMenu: boolean = false;
  activeColumnMenu: string = '';
  menuPosition: any = { x: 0, y: 0 };

  // Vérifier si l'utilisateur a accès à l'interface contrat
  hasContratAccess: boolean = false;

  constructor(
    private ventesService: VentesService,
    private router: Router,
    private emailService: EmailService,
    private cdr: ChangeDetectorRef,
    private permissionsService: PermissionsService
  ) {}

  ngOnInit(): void {
    // Vérifier si l'utilisateur a accès à l'interface contrat
    this.hasContratAccess = this.permissionsService.hasAccessToRoute('/Contrat');
    
    // Toujours utiliser loadFactures avec pagination dès le démarrage
    this.loadFactures(1, '', false);
  }

  ngAfterViewInit(): void {
    // Ajouter un listener pour fermer le menu contextuel quand on clique ailleurs
    document.addEventListener('click', (event) => {
      if (this.showColumnMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('.column-context-menu') && !target.closest('.column-menu-btn')) {
          this.hideColumnContextMenu();
        }
      }
    });
  }

  loadFactures(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loading = true;
    this.currentPage = page;
    this.searchTerm = search;
    
    if (resetFilters) {
      this.filterDateFrom = '';
      this.filterDateTo = '';
      this.filterClient = '';
      this.filterMontantMin = null;
      this.filterMontantMax = null;
      // Réinitialiser les filtres de colonnes
      this.columnFilters = {
        facture_num: '',
        facture_dat: '',
        client: '',
        total_ht: '',
        total_tva: '',
        total_ttc: '',
        status: ''
      };
    }

    // Construire la recherche combinée avec les filtres de colonnes
    let combinedSearch = search;
    if (this.columnFilters.facture_num) {
      combinedSearch += (combinedSearch ? ' ' : '') + this.columnFilters.facture_num;
    }
    if (this.columnFilters.client) {
      combinedSearch += (combinedSearch ? ' ' : '') + this.columnFilters.client;
    }

    this.ventesService.getFactures({
      page: page,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: combinedSearch
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};
        
        // Les données sont déjà filtrées et paginées par le serveur
        let factures = Array.isArray(result) ? result : [];
        
        // Stocker toutes les factures pour le filtrage
        this.allFactures = factures;
        
        // Appliquer les filtres de colonnes côté client
        this.factures = this.applyColumnFilters(factures);
        
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        
        
        // Extraire la liste des clients uniques pour le filtre (depuis la page actuelle uniquement)
        this.extractClientsList(this.factures);
        
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.showError("❌ Une erreur s'est produite lors du chargement des factures.");
        this.loading = false;
        this.factures = [];
        this.cdr.detectChanges();
      }
    });
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadFactures(page, this.searchTerm);
    }
  }

  onPageSizeChange(event: any): void {
    const newPageSize = parseInt(event.target.value);
    if (newPageSize > 0) {
      this.pageSize = newPageSize;
      this.loadFactures(1, this.searchTerm);
    }
  }

  onSearch(): void {
    this.loadFactures(1, this.searchTerm);
  }

  onSearchKeyPress(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearch();
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPages, startPage + maxPagesToShow - 1);
    
    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    
    return pages;
  }

  getDisplayRange(): string {
    const start = ((this.currentPage - 1) * this.pageSize) + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start} à ${end}`;
  }

  showError(message: string) {
    this.successMessage = message;
    this.isError = true;

    setTimeout(() => {
      this.successMessage = null;
    }, 5000);
  }

  showNotification(message: string, isError: boolean = false) {
    this.successMessage = message;
    this.isError = isError;

    setTimeout(() => {
      this.successMessage = null;
    }, 5000);
  }

  // Tri par colonne
  onSort(column: string): void {
    if (this.sortColumn === column) {
      // Inverser la direction si on clique sur la même colonne
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      // Nouvelle colonne, trier par défaut en DESC
      this.sortColumn = column;
      this.sortDirection = 'DESC';
    }
    this.loadFactures(1, this.searchTerm);
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort';
    }
    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // Filtres avancés
  toggleAdvancedFilters(): void {
    this.showAdvancedFilters = !this.showAdvancedFilters;
  }

  applyAdvancedFilters(factures: any[]): any[] {
    // Les filtres sont appliqués côté serveur via la recherche
    // Pour les filtres complexes, on peut filtrer côté client aussi
    let filtered = [...factures];
    
    if (this.filterDateFrom) {
      const fromDate = new Date(this.filterDateFrom);
      filtered = filtered.filter(f => {
        if (!f.facture_dat) return false;
        const factureDate = new Date(f.facture_dat);
        return factureDate >= fromDate;
      });
    }
    
    if (this.filterDateTo) {
      const toDate = new Date(this.filterDateTo);
      toDate.setHours(23, 59, 59, 999); // Fin de journée
      filtered = filtered.filter(f => {
        if (!f.facture_dat) return false;
        const factureDate = new Date(f.facture_dat);
        return factureDate <= toDate;
      });
    }
    
    if (this.filterClient) {
      filtered = filtered.filter(f => 
        f.nom?.toLowerCase().includes(this.filterClient.toLowerCase())
      );
    }
    
    if (this.filterMontantMin !== null && this.filterMontantMin !== undefined) {
      filtered = filtered.filter(f => (f.facture_ttc || 0) >= this.filterMontantMin!);
    }
    
    if (this.filterMontantMax !== null && this.filterMontantMax !== undefined) {
      filtered = filtered.filter(f => (f.facture_ttc || 0) <= this.filterMontantMax!);
    }
    
    return filtered;
  }

  onFilterChange(): void {
    // Recharger les données avec les nouveaux filtres
    this.loadFactures(this.currentPage, this.searchTerm);
  }

  resetFilters(): void {
    this.filterDateFrom = '';
    this.filterDateTo = '';
    this.filterClient = '';
    this.filterMontantMin = null;
    this.filterMontantMax = null;
    this.loadFactures(1, this.searchTerm, true);
  }

  extractClientsList(factures: any[]): void {
    const clients = new Set<string>();
    factures.forEach(f => {
      if (f.client) {
        clients.add(f.client);
      }
    });
    this.clientsList = Array.from(clients).sort();
  }

  // Appliquer les filtres de colonnes
  applyColumnFilters(factures: any[]): any[] {
    let filtered = [...factures];

    // Filtre par numéro de facture
    if (this.columnFilters.facture_num) {
      filtered = filtered.filter(f => 
        f.facture_num?.toLowerCase().includes(this.columnFilters.facture_num.toLowerCase())
      );
    }

    // Filtre par date
    if (this.columnFilters.facture_dat) {
      const filterDate = new Date(this.columnFilters.facture_dat);
      filtered = filtered.filter(f => {
        if (!f.facture_dat) return false;
        const factureDate = new Date(f.facture_dat);
        return factureDate.toDateString() === filterDate.toDateString();
      });
    }

    // Filtre par client
    if (this.columnFilters.client) {
      filtered = filtered.filter(f => 
        f.client?.toLowerCase().includes(this.columnFilters.client.toLowerCase())
      );
    }

    // Filtre par montant HT
    if (this.columnFilters.total_ht) {
      const amount = parseFloat(this.columnFilters.total_ht);
      if (!isNaN(amount)) {
        filtered = filtered.filter(f => (f.total_ht || 0) >= amount);
      }
    }

    // Filtre par TVA
    if (this.columnFilters.total_tva) {
      const amount = parseFloat(this.columnFilters.total_tva);
      if (!isNaN(amount)) {
        filtered = filtered.filter(f => (f.total_tva || 0) >= amount);
      }
    }

    // Filtre par TTC
    if (this.columnFilters.total_ttc) {
      const amount = parseFloat(this.columnFilters.total_ttc);
      if (!isNaN(amount)) {
        filtered = filtered.filter(f => (f.total_ttc || 0) >= amount);
      }
    }

    // Filtre par statut
    if (this.columnFilters.status) {
      filtered = filtered.filter(f => 
        f.status?.toLowerCase().includes(this.columnFilters.status.toLowerCase())
      );
    }

    return filtered;
  }

  // Gérer les changements de filtres de colonnes
  onColumnFilterChange(column: string, value: any): void {
    this.columnFilters[column] = value;
    // Appliquer le filtre immédiatement sur les données de la page actuelle
    this.factures = this.applyColumnFilters([...this.allFactures]);
  }

  // Gérer le filtre Etat avec checkboxes
  onEtatFilterChange(option: any): void {
    option.checked = !option.checked;
    this.columnFilters.etat = this.etatOptions
      .filter(opt => opt.checked)
      .map(opt => opt.value);
    this.loadFactures(1, this.searchTerm);
  }

  // Sélectionner/désélectionner tout pour le filtre Etat
  toggleAllEtatFilters(selectAll: boolean): void {
    this.etatOptions.forEach(opt => opt.checked = selectAll);
    if (selectAll) {
      this.columnFilters.etat = this.etatOptions.map(opt => opt.value);
    } else {
      this.columnFilters.etat = [];
    }
    this.loadFactures(1, this.searchTerm);
  }

  // Vérifier si tous les états sont sélectionnés
  areAllEtatFiltersSelected(): boolean {
    return this.etatOptions.every(opt => opt.checked);
  }

  // Réinitialiser les filtres de colonnes
  clearColumnFilters(): void {
    this.columnFilters = {
      facture_num: '',
      facture_dat: '',
      client: '',
      total_ht: '',
      total_tva: '',
      total_ttc: '',
      status: ''
    };
    this.loadFactures(1, this.searchTerm);
  }

  // Gestion du menu contextuel des colonnes
  showColumnContextMenu(event: MouseEvent, column: string): void {
    event.preventDefault();
    event.stopPropagation();
    
    this.activeColumnMenu = column;
    
    // Positionner le menu près de l'en-tête de colonne
    const rect = (event.target as HTMLElement).closest('th')?.getBoundingClientRect();
    if (rect) {
      this.menuPosition = {
        x: rect.right - 250, // Ajuster pour que le menu ne dépasse pas
        y: rect.bottom + 5
      };
    } else {
      this.menuPosition = {
        x: event.clientX,
        y: event.clientY
      };
    }
    
    // S'assurer que le menu ne dépasse pas de l'écran
    if (this.menuPosition.x < 10) {
      this.menuPosition.x = 10;
    }
    if (this.menuPosition.y < 10) {
      this.menuPosition.y = 10;
    }
    
    this.showColumnMenu = true;
  }

  hideColumnContextMenu(): void {
    this.showColumnMenu = false;
    this.activeColumnMenu = '';
  }

  // Toggle visibilité d'une colonne
  toggleColumnVisibility(column: string): void {
    this.columnVisibility[column] = !this.columnVisibility[column];
    this.hideColumnContextMenu();
    this.cdr.detectChanges();
  }

  // Épingler/Désépingler une colonne
  togglePinColumn(column: string): void {
    const index = this.pinnedColumns.indexOf(column);
    if (index > -1) {
      this.pinnedColumns.splice(index, 1);
    } else {
      this.pinnedColumns.push(column);
    }
    this.hideColumnContextMenu();
    this.cdr.detectChanges();
  }

  isColumnPinned(column: string): boolean {
    return this.pinnedColumns.includes(column);
  }

  // Ajuster automatiquement la taille d'une colonne
  autoSizeColumn(column: string): void {
    // Utiliser setTimeout pour s'assurer que le DOM est rendu
    setTimeout(() => {
      const table = document.getElementById('facturationTable');
      if (table) {
        const columnIndex = this.getColumnIndex(column);
        if (columnIndex >= 0) {
          let maxWidth = 100; // Largeur minimale
          
          // Parcourir toutes les cellules de la colonne pour trouver la largeur maximale
          const headerCell = table.querySelector(`thead tr:first-child th:nth-child(${columnIndex + 1})`);
          if (headerCell) {
            const headerWidth = (headerCell as HTMLElement).scrollWidth;
            if (headerWidth > maxWidth) {
              maxWidth = headerWidth;
            }
          }
          
          const cells = table.querySelectorAll(`tbody td:nth-child(${columnIndex + 1})`);
          cells.forEach((cell: any) => {
            const cellWidth = cell.scrollWidth;
            if (cellWidth > maxWidth) {
              maxWidth = cellWidth;
            }
          });
          
          // Ajouter un peu de padding
          maxWidth += 30;
          this.columnWidths[column] = maxWidth + 'px';
          this.cdr.detectChanges();
        }
      }
    }, 100);
    this.hideColumnContextMenu();
  }

  // Ajuster automatiquement toutes les colonnes
  autoSizeAllColumns(): void {
    const columns = ['facture_num', 'facture_dat', 'nom', 'facture_ht', 'facture_tva', 'facture_ttc'];
    columns.forEach(col => {
      if (this.columnVisibility[col]) {
        this.autoSizeColumn(col);
      }
    });
  }

  // Réinitialiser toutes les colonnes
  resetColumns(): void {
    this.columnVisibility = {
      facture_num: true,
      facture_dat: true,
      nom: true,
      facture_ht: true,
      facture_tva: true,
      facture_ttc: true
    };
    this.pinnedColumns = [];
    this.columnWidths = {};
    this.hideColumnContextMenu();
    this.cdr.detectChanges();
  }

  // Obtenir l'index d'une colonne
  getColumnIndex(column: string): number {
    const columnOrder = ['facture_num', 'facture_dat', 'client', 'total_ht', 'total_tva', 'total_ttc', 'status'];
    return columnOrder.indexOf(column);
  }

  // Obtenir le nom d'affichage d'une colonne
  getColumnDisplayName(column: string): string {
    const names: any = {
      facture_num: 'Numéro',
      facture_dat: 'Date',
      client: 'Client',
      total_ht: 'HT',
      total_tva: 'TVA',
      total_ttc: 'TTC',
      status: 'Statut'
    };
    return names[column] || column;
  }

  // Obtenir toutes les colonnes disponibles
  getAllColumns(): string[] {
    return ['facture_num', 'facture_dat', 'client', 'total_ht', 'total_tva', 'total_ttc', 'status'];
  }

  // Obtenir la classe CSS pour le badge de statut
  getStatusBadgeClass(status: string): string {
    if (!status) return 'badge-secondary';
    const statusLower = status.toLowerCase().trim();
    if (statusLower === 'réglé' || statusLower === 'regele' || statusLower === 'regle') {
      return 'badge-success';
    } else if (statusLower === 'en cours' || statusLower === 'encours') {
      return 'badge-warning';
    } else if (statusLower === 'non réglé' || statusLower === 'non regele' || statusLower === 'non regle') {
      return 'badge-danger';
    }
    return 'badge-secondary';
  }

  // Afficher toutes les colonnes
  showAllColumns(): void {
    this.getAllColumns().forEach(col => {
      this.columnVisibility[col] = true;
    });
    this.hideColumnContextMenu();
    this.cdr.detectChanges();
  }

  // Compter les colonnes visibles
  getVisibleColumnsCount(): number {
    return Object.keys(this.columnVisibility).filter(key => this.columnVisibility[key]).length;
  }

  // Export des données
  exportToCSV(): void {
    const headers = ['Numéro', 'Date', 'Client', 'HT', 'TVA', 'TTC'];
    const rows = this.factures.map(f => [
      f.facture_num || '',
      f.facture_dat ? new Date(f.facture_dat).toLocaleDateString('fr-FR') : '',
      f.nom || '',
      (f.facture_ht || 0).toFixed(2),
      (f.facture_tva || 0).toFixed(2),
      (f.facture_ttc || 0).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `factures_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    this.showNotification('✅ Export CSV réussi !', false);
  }

  onPrintFacture(facture_id: any, type: 'standard' | 'contrat' = 'standard') {
    if (!facture_id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'ID de facture introuvable.' });
      return;
    }
    
    Swal.fire({
      title: 'Génération du PDF...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    
    const serviceCall = type === 'contrat' 
      ? this.emailService.generateFactureContratPDF(facture_id.toString())
      : this.emailService.generateFacturePDF(facture_id.toString());
    
    serviceCall.subscribe({
      next: (res: any) => {
        Swal.close();
        const url = res?.pdfUrl;
        if (url) {
          window.open(url, '_blank');
        } else {
          Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reçu.' });
        }
      },
      error: (err: any) => {
        Swal.close();
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la génération du PDF." });
      }
    });
  }
}
