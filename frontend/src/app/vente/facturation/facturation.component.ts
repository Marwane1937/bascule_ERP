import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { VentesService } from 'src/app/service/ventes.service';
import { EmailService } from 'src/app/service/email.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-facturation',
  templateUrl: './facturation.component.html',
  styleUrls: ['./facturation.component.css']
})
export class FacturationComponent implements OnInit, AfterViewInit {
  factures: any[] = [];
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
  
  // Liste des clients pour le filtre
  clientsList: string[] = [];

  constructor(
    private ventesService: VentesService,
    private router: Router,
    private emailService: EmailService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Toujours utiliser loadFactures avec pagination dès le démarrage
    this.loadFactures(1, '', false);
  }

  ngAfterViewInit(): void {
    // Ne rien faire ici
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
    }

    this.ventesService.getFactures({
      page: page,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: search
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};
        
        // Les données sont déjà filtrées et paginées par le serveur
        this.factures = Array.isArray(result) ? result : [];
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        
        console.log(`[FacturationComponent] Page ${page}/${this.totalPages}, ${this.factures.length} factures chargées sur ${this.totalRecords} total`);
        
        // Extraire la liste des clients uniques pour le filtre (depuis la page actuelle uniquement)
        this.extractClientsList(this.factures);
        
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[FacturationComponent] ❌ Erreur lors du chargement des factures:', err);
        console.error('[FacturationComponent] ❌ Détails de l\'erreur:', JSON.stringify(err, null, 2));
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
      if (f.nom) {
        clients.add(f.nom);
      }
    });
    this.clientsList = Array.from(clients).sort();
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
        console.error('Erreur génération PDF :', err);
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la génération du PDF." });
      }
    });
  }
}
