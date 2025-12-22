import { Component, OnInit, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import { CaisseService } from 'src/app/service/caisse.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-edit-reglement',
  templateUrl: './edit-reglement.component.html',
  styleUrls: ['./edit-reglement.component.css']
})
export class EditReglementComponent implements OnInit {
  reglementForm!: FormGroup;
  reglementId: string | null = null;
  isEditMode: boolean = false;
  loading: boolean = false;
  
  clients: any[] = [];
  filteredClients: any[] = [];
  modesReglement: any[] = [];
  
  // Factures pour le lettrage
  factures: any[] = [];
  filteredFactures: any[] = [];
  loadingFactures: boolean = false;
  selectedFactures: Set<number> = new Set();
  montantRestant: number = 0;
  montantUtilise: number = 0;
  
  // Pagination
  currentPage: number = 1;
  pageSize: number = 10;
  totalPages: number = 1;
  
  // Filtres
  searchFilter: string = '';
  filterStatut: string = 'all'; // 'all', 'pending', 'in-progress', 'paid'
  filterNumero: string = '';
  showFilterStatut: boolean = false;
  showFilterNumero: boolean = false;
  
  // Tri
  sortColumn: string = '';
  sortDirection: 'asc' | 'desc' = 'desc';
  
  // Ordre des colonnes
  columnOrder: string[] = ['checkbox', 'numero', 'date', 'facture', 'avoir', 'reglement', 'reste', 'solde', 'statut'];
  
  // Configuration des colonnes
  columnConfig: any = {
    'checkbox': { label: '', align: 'center', width: '50px' },
    'numero': { label: 'Numéro', align: 'left', width: 'auto' },
    'date': { label: 'Date', align: 'left', width: 'auto' },
    'facture': { label: 'Facture', align: 'right', width: 'auto' },
    'avoir': { label: 'Avoir', align: 'right', width: 'auto' },
    'reglement': { label: 'Règlement', align: 'right', width: 'auto' },
    'reste': { label: 'Reste à payé', align: 'right', width: 'auto' },
    'solde': { label: 'Solde', align: 'right', width: 'auto' },
    'statut': { label: 'Statut', align: 'center', width: 'auto' }
  };
  
  successMessage: string | null = null;
  isError: boolean = false;
  infoMessage: string | null = null;

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private baseService: BaseService,
    private ventesService: VentesService,
    private caisseService: CaisseService
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadClients();
    this.loadModeReglements();
    
    this.reglementId = this.route.snapshot.paramMap.get('id');
    this.isEditMode = this.reglementId !== null && this.reglementId !== 'new';
    
    if (this.isEditMode && this.reglementId) {
      this.loadReglementById(+this.reglementId);
    }

    // Écouter les changements du champ clientSearch
    this.reglementForm.get('clientSearch')?.valueChanges.subscribe(value => {
      this.onClientSearchChange(value);
    });
    
    // Écouter les changements du montant pour mettre à jour le lettrage
    this.reglementForm.get('montant')?.valueChanges.subscribe(() => {
      this.updateMontantRestant();
      this.updateFactureStatus();
    });
  }

  initForm(): void {
    this.reglementForm = this.fb.group({
      numero: ['', Validators.required],
      date: [new Date().toISOString().substring(0, 10), Validators.required],
      part_id: [0, Validators.required],
      clientSearch: ['', Validators.required],
      mode: [null, Validators.required],
      reference: [''],
      montant: [0, [Validators.required, Validators.min(0.01)]]
    });
  }

  loadClients(): void {
    this.baseService.getClient().subscribe({
      next: (data: any) => {
        this.clients = data || [];
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement des clients:', err);
      }
    });
  }

  loadModeReglements(): void {
    this.ventesService.getModeReglements().subscribe({
      next: (response: any) => {
        this.modesReglement = response?.data || [];
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement des modes de règlement:', err);
      }
    });
  }

  loadReglementById(id: number): void {
    this.loading = true;
    this.ventesService.getReglementById(id).subscribe({
      next: (response: any) => {
        const reglement = response?.data || response;
        if (reglement) {
          this.reglementForm.patchValue({
            numero: reglement.numero || '',
            date: reglement.date ? new Date(reglement.date).toISOString().substring(0, 10) : '',
            part_id: reglement.part_id || 0,
            clientSearch: reglement.client || '',
            mode: reglement.mode_id || null,
            reference: reglement.reference || '',
            montant: reglement.montant || 0
          });
          
          // Charger les factures si un client est sélectionné
          if (reglement.part_id) {
            this.loadFacturesForLettrage(reglement.part_id);
          }
        }
        this.loading = false;
      },
      error: (err: any) => {
        console.error('Erreur lors du chargement du règlement:', err);
        this.showError('Erreur lors du chargement du règlement');
        this.loading = false;
      }
    });
  }

  onClientSearchChange(searchTerm: string): void {
    if (!searchTerm || searchTerm.trim().length === 0) {
      this.filteredClients = [];
      return;
    }
    
    const term = searchTerm.trim().toLowerCase();
    this.filteredClients = this.clients.filter(client =>
      client.nom?.toLowerCase().includes(term)
    ).slice(0, 10); // Limiter à 10 résultats
  }

  selectClient(client: any): void {
    this.reglementForm.patchValue({
      part_id: client.part_id,
      clientSearch: client.nom
    });
    this.filteredClients = [];
    
    // Charger les factures du client pour le lettrage
    if (client.part_id) {
      this.loadFacturesForLettrage(client.part_id);
    }
  }
  
  loadFacturesForLettrage(part_id: number): void {
    console.log('[EditReglementComponent] 📥 Chargement factures pour part_id:', part_id);
    this.loadingFactures = true;
    this.factures = [];
    this.filteredFactures = [];
    this.selectedFactures.clear();
    this.searchFilter = '';
    this.filterStatut = 'all';
    this.filterNumero = '';
    this.showFilterStatut = false;
    this.showFilterNumero = false;
    this.currentPage = 1;
    const montantInitial = this.reglementForm.get('montant')?.value || 0;
    this.montantRestant = montantInitial;
    this.montantUtilise = 0;
    
    if (!part_id || part_id === 0) {
      console.warn('[EditReglementComponent] ⚠️ part_id invalide:', part_id);
      this.loadingFactures = false;
      return;
    }
    
    this.ventesService.getFacturesForLettrage(part_id).subscribe({
      next: (response: any) => {
        console.log('[EditReglementComponent] 📥 Réponse API factures:', response);
        
        // Gérer différents formats de réponse
        let facturesData: any[] = [];
        
        if (Array.isArray(response)) {
          // Si la réponse est directement un tableau
          facturesData = response;
        } else if (response && typeof response === 'object' && response.data) {
          // Si la réponse est un objet avec une propriété data
          facturesData = Array.isArray(response.data) ? response.data : [];
        } else if (response && typeof response === 'object' && Array.isArray(response)) {
          // Fallback pour objets avec propriétés numériques (tableaux-like)
          facturesData = Array.from(response);
        }
        
        console.log(`[EditReglementComponent] 📋 ${facturesData.length} factures reçues`);
        
        this.factures = facturesData.map((facture: any) => {
          const factureMontant = Math.abs(facture.facture || 0);
          const avoir = Math.abs(facture.avoir || 0);
          const reglement = Math.abs(facture.reglement || 0);
          const solde = Math.abs(facture.solde || 0);
          
          return {
            ...facture,
            montant_facture: factureMontant,
            avoir: avoir,
            reglement_initial: reglement,
            reglement_applique: 0,
            solde_initial: solde,
            reste_a_payer: solde
          };
        });
        
        console.log(`[EditReglementComponent] ✅ ${this.factures.length} factures traitées`);
        if (this.factures.length > 0) {
          console.log('[EditReglementComponent] Exemple facture:', this.factures[0]);
        }
        
        this.applyFilter();
        this.loadingFactures = false;
        this.updateFactureStatus();
      },
      error: (err: any) => {
        console.error('[EditReglementComponent] ❌ Erreur lors du chargement des factures:', err);
        console.error('[EditReglementComponent] ❌ Détails:', err.error || err.message);
        this.factures = [];
        this.filteredFactures = [];
        this.loadingFactures = false;
      }
    });
  }
  
  applyFilter(): void {
    let filtered = [...this.factures];
    
    // Filtre de recherche texte
    if (this.searchFilter && this.searchFilter.trim() !== '') {
      const filter = this.searchFilter.toLowerCase().trim();
      filtered = filtered.filter(facture => 
        (facture.numero && facture.numero.toLowerCase().includes(filter)) ||
        (facture.date && facture.date.toString().includes(filter))
      );
    }
    
    // Filtre par numéro
    if (this.filterNumero && this.filterNumero.trim() !== '') {
      const filter = this.filterNumero.toLowerCase().trim();
      filtered = filtered.filter(facture => 
        facture.numero && facture.numero.toLowerCase().includes(filter)
      );
    }
    
    // Filtre par statut
    if (this.filterStatut !== 'all') {
      filtered = filtered.filter(facture => {
        const statusClass = this.getFactureStatusClass(facture);
        if (this.filterStatut === 'paid') {
          return statusClass === 'status-paid';
        } else if (this.filterStatut === 'in-progress') {
          return statusClass === 'status-in-progress';
        } else if (this.filterStatut === 'pending') {
          return statusClass === 'status-pending';
        }
        return true;
      });
    }
    
    // Appliquer le tri
    if (this.sortColumn) {
      filtered = this.sortFactures(filtered, this.sortColumn, this.sortDirection);
    }
    
    // Appliquer le tri
    if (this.sortColumn) {
      filtered = this.sortFactures(filtered, this.sortColumn, this.sortDirection);
    }
    
    this.filteredFactures = filtered;
    this.totalPages = Math.ceil(this.filteredFactures.length / this.pageSize);
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    }
  }
  
  sortFactures(factures: any[], column: string, direction: 'asc' | 'desc'): any[] {
    return [...factures].sort((a, b) => {
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
        case 'facture':
          aValue = parseFloat(a.montant_facture || 0);
          bValue = parseFloat(b.montant_facture || 0);
          break;
        case 'avoir':
          aValue = parseFloat(a.avoir || 0);
          bValue = parseFloat(b.avoir || 0);
          break;
        case 'reglement':
          aValue = parseFloat(a.reglement_applique || 0);
          bValue = parseFloat(b.reglement_applique || 0);
          break;
        case 'reste':
          aValue = parseFloat(a.reste_a_payer || 0);
          bValue = parseFloat(b.reste_a_payer || 0);
          break;
        case 'solde':
          aValue = parseFloat(a.solde_initial || 0);
          bValue = parseFloat(b.solde_initial || 0);
          break;
        case 'statut':
          aValue = this.getFactureStatus(a);
          bValue = this.getFactureStatus(b);
          break;
        default:
          return 0;
      }
      
      if (aValue < bValue) {
        return direction === 'asc' ? -1 : 1;
      }
      if (aValue > bValue) {
        return direction === 'asc' ? 1 : -1;
      }
      return 0;
    });
  }
  
  onSort(column: string): void {
    if (this.sortColumn === column) {
      // Inverser la direction
      this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      // Nouvelle colonne, trier par défaut en descendant
      this.sortColumn = column;
      this.sortDirection = 'desc';
    }
    this.currentPage = 1;
    this.applyFilter();
  }
  
  getSortIcon(column: string): string {
    if (this.sortColumn !== column) {
      return 'fa-sort text-muted';
    }
    return this.sortDirection === 'asc' ? 'fa-sort-up text-primary' : 'fa-sort-down text-primary';
  }
  
  moveColumn(columnKey: string, direction: 'left' | 'right'): void {
    const currentIndex = this.columnOrder.indexOf(columnKey);
    if (currentIndex === -1) return;
    
    const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= this.columnOrder.length) return;
    
    // Échanger les colonnes
    [this.columnOrder[currentIndex], this.columnOrder[newIndex]] = 
      [this.columnOrder[newIndex], this.columnOrder[currentIndex]];
  }
  
  canMoveColumn(columnKey: string, direction: 'left' | 'right'): boolean {
    const currentIndex = this.columnOrder.indexOf(columnKey);
    if (currentIndex === -1) return false;
    
    if (direction === 'left') {
      return currentIndex > 0;
    } else {
      return currentIndex < this.columnOrder.length - 1;
    }
  }
  
  getColumnIndex(columnKey: string): number {
    return this.columnOrder.indexOf(columnKey);
  }
  
  toggleFilterStatut(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.showFilterStatut = !this.showFilterStatut;
    this.showFilterNumero = false;
  }
  
  toggleFilterNumero(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.showFilterNumero = !this.showFilterNumero;
    this.showFilterStatut = false;
  }
  
  clearFilterStatut(): void {
    this.filterStatut = 'all';
    this.showFilterStatut = false;
    this.currentPage = 1;
    this.applyFilter();
  }
  
  clearFilterNumero(): void {
    this.filterNumero = '';
    this.showFilterNumero = false;
    this.currentPage = 1;
    this.applyFilter();
  }
  
  onFilterNumeroChange(): void {
    this.currentPage = 1;
    this.applyFilter();
  }
  
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    // Fermer les filtres si on clique en dehors
    const target = event.target as HTMLElement;
    if (!target.closest('.filter-header') && !target.closest('.filter-dropdown')) {
      this.showFilterStatut = false;
      this.showFilterNumero = false;
    }
  }
  
  onSearchChange(): void {
    this.currentPage = 1;
    this.applyFilter();
  }
  
  onFilterStatutChange(): void {
    this.currentPage = 1;
    this.applyFilter();
  }
  
  getPaginatedFactures(): any[] {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    return this.filteredFactures.slice(start, end);
  }
  
  goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
    }
  }
  
  changePageSize(size: number): void {
    this.pageSize = size;
    this.currentPage = 1;
    this.totalPages = Math.ceil(this.filteredFactures.length / this.pageSize);
  }
  
  toggleFactureSelection(facture: any): void {
    const documentId = facture.document_id;
    
    if (this.selectedFactures.has(documentId)) {
      // Décocher : remettre le montant initial
      this.selectedFactures.delete(documentId);
      facture.reste_a_payer = facture.solde_initial;
      facture.reglement_applique = 0;
    } else {
      // Vérifier si le montant restant est suffisant
      if (this.montantRestant <= 0) {
        this.showInfo('⚠️ Le montant du règlement est entièrement utilisé. Impossible de cocher cette facture.');
        return;
      }
      
      // Cocher : appliquer le règlement
      this.selectedFactures.add(documentId);
    }
    
    // Recalculer tous les montants après chaque changement
    this.recalculateLettrage();
  }
  
  recalculateLettrage(): void {
    const montantReglement = this.reglementForm.get('montant')?.value || 0;
    let montantRestant = montantReglement;
    let montantUtiliseTotal = 0;
    
    // Réinitialiser toutes les factures sélectionnées
    this.factures.forEach(facture => {
      if (this.selectedFactures.has(facture.document_id)) {
        facture.reste_a_payer = facture.solde_initial;
        facture.reglement_applique = 0;
      }
    });
    
    // Appliquer le règlement aux factures sélectionnées dans l'ordre
    this.factures.forEach(facture => {
      if (this.selectedFactures.has(facture.document_id) && montantRestant > 0) {
        const soldeActuel = facture.solde_initial;
        const montantApplique = Math.min(montantRestant, soldeActuel);
        let nouveauReste = soldeActuel - montantApplique;
        
        // Arrondir le reste à payer si entre -5 et 5
        if (nouveauReste >= -5 && nouveauReste <= 5) {
          nouveauReste = Math.round(nouveauReste);
        }
        
        facture.reste_a_payer = Math.max(0, nouveauReste);
        facture.reglement_applique = montantApplique;
        montantRestant = Math.max(0, montantRestant - montantApplique);
        montantUtiliseTotal += montantApplique;
      }
    });
    
    this.montantRestant = montantRestant;
    this.montantUtilise = montantUtiliseTotal;
    this.updateFactureStatus();
    this.updateInfoMessage();
  }
  
  roundIfNeeded(value: number): number {
    // Arrondir si la valeur est entre -5 et 5
    if (value >= -5 && value <= 5) {
      return Math.round(value);
    }
    return value;
  }
  
  isFactureReglee(reste_a_payer: number): boolean {
    // Considérer comme réglée si le reste est entre -5 et 5 (après arrondi)
    const rounded = this.roundIfNeeded(reste_a_payer);
    return rounded >= -5 && rounded <= 5;
  }
  
  updateInfoMessage(): void {
    if (this.montantRestant <= 0 && this.montantUtilise > 0) {
      this.infoMessage = `✅ Le montant du règlement est entièrement utilisé (${this.montantUtilise.toFixed(2)} DH utilisés)`;
    } else if (this.montantRestant > 0) {
      this.infoMessage = `💰 Montant restant: ${this.montantRestant.toFixed(2)} DH`;
    } else {
      this.infoMessage = null;
    }
  }
  
  showInfo(message: string): void {
    this.infoMessage = message;
    setTimeout(() => {
      if (this.infoMessage === message) {
        this.infoMessage = null;
      }
    }, 5000);
  }
  
  updateMontantRestant(): void {
    // Cette méthode est appelée quand le montant change
    this.recalculateLettrage();
  }
  
  updateFactureStatus(): void {
    this.factures.forEach(facture => {
      const solde = facture.reste_a_payer;
      const montantFacture = facture.montant_facture;
      
      // Vérifier si la facture est réglée (arrondi entre -5 et 5)
      if (this.isFactureReglee(solde)) {
        facture.status = 'Facture Réglé';
        facture.statusClass = 'status-paid';
      } else if (solde > 5 && solde < montantFacture) {
        facture.status = 'En Cours';
        facture.statusClass = 'status-in-progress';
      } else {
        facture.status = 'En Attente';
        facture.statusClass = 'status-pending';
      }
    });
  }
  
  getReglementApplique(facture: any): number {
    if (this.isFactureSelected(facture.document_id)) {
      // Si la facture est cochée, afficher le montant du règlement appliqué
      return facture.reglement_applique || 0;
    }
    // Si la facture n'est pas cochée, afficher le règlement initial + l'avance si en cours
    const reglementInitial = facture.reglement_initial || 0;
    const status = this.getFactureStatusClass(facture);
    if (status === 'status-in-progress') {
      // Pour "en cours", ajouter la valeur de l'avance (montant_facture - reste_a_payer)
      const avance = facture.montant_facture - facture.reste_a_payer;
      return reglementInitial + avance;
    }
    return reglementInitial;
  }
  
  formatDate(date: any): string {
    if (!date) return '';
    const d = new Date(date);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  }
  
  formatNumber(value: number): string {
    const rounded = this.roundIfNeeded(value);
    return rounded.toFixed(2);
  }
  
  getFactureStatus(facture: any): string {
    const solde = facture.reste_a_payer;
    const montantFacture = facture.montant_facture;
    
    // Utiliser la même logique que updateFactureStatus
    if (this.isFactureReglee(solde)) {
      return 'Facture Réglé';
    } else if (solde > 5 && solde < montantFacture) {
      return 'En Cours';
    } else {
      return 'En Attente';
    }
  }
  
  getFactureStatusClass(facture: any): string {
    const solde = facture.reste_a_payer;
    const montantFacture = facture.montant_facture;
    
    // Utiliser la même logique que updateFactureStatus
    if (this.isFactureReglee(solde)) {
      return 'status-paid';
    } else if (solde > 5 && solde < montantFacture) {
      return 'status-in-progress';
    } else {
      return 'status-pending';
    }
  }
  
  isFactureSelected(documentId: number): boolean {
    return this.selectedFactures.has(documentId);
  }
  
  toggleAllFactures(event: any): void {
    const checked = event.target.checked;
    const facturesToToggle = this.getPaginatedFactures();
    
    if (checked) {
      // Cocher toutes les factures visibles qui ont un solde > 0 et qui peuvent être cochées
      facturesToToggle.forEach(facture => {
        if (facture.solde_initial > 0 && 
            !this.selectedFactures.has(facture.document_id) &&
            this.montantRestant > 0) {
          this.selectedFactures.add(facture.document_id);
        }
      });
    } else {
      // Décocher toutes les factures visibles
      facturesToToggle.forEach(facture => {
        if (this.selectedFactures.has(facture.document_id)) {
          this.selectedFactures.delete(facture.document_id);
          facture.reste_a_payer = facture.solde_initial;
          facture.reglement_applique = 0;
        }
      });
    }
    
    this.recalculateLettrage();
  }
  
  isAllSelected(): boolean {
    const facturesToCheck = this.getPaginatedFactures().filter(f => f.solde_initial > 0);
    if (facturesToCheck.length === 0) return false;
    return facturesToCheck.every(f => this.selectedFactures.has(f.document_id));
  }
  
  isSomeSelected(): boolean {
    const facturesToCheck = this.getPaginatedFactures();
    const selected = facturesToCheck.some(f => this.selectedFactures.has(f.document_id));
    const allSelected = this.isAllSelected();
    return selected && !allSelected;
  }
  
  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxPages / 2));
    let end = Math.min(this.totalPages, start + maxPages - 1);
    
    if (end - start < maxPages - 1) {
      start = Math.max(1, end - maxPages + 1);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  }
  
  getStartIndex(): number {
    return (this.currentPage - 1) * this.pageSize + 1;
  }
  
  getEndIndex(): number {
    return Math.min(this.currentPage * this.pageSize, this.filteredFactures.length);
  }

  onSubmit(): void {
    if (this.reglementForm.invalid) {
      this.markFormGroupTouched(this.reglementForm);
      this.showError('Veuillez remplir tous les champs obligatoires');
      return;
    }

    const formValue = this.reglementForm.value;
    const reglementData = {
      numero: formValue.numero,
      date: formValue.date,
      part_id: formValue.part_id,
      mode: formValue.mode,
      reference: formValue.reference || '',
      montant: formValue.montant
    };

    this.loading = true;

    if (this.isEditMode && this.reglementId) {
      // Mise à jour
      this.ventesService.updateReglement(+this.reglementId, reglementData).subscribe({
        next: () => {
          this.showSuccess('Règlement modifié avec succès');
          setTimeout(() => {
            this.router.navigate(['/Reglement']);
          }, 1500);
        },
        error: (err: any) => {
          console.error('Erreur lors de la modification:', err);
          this.showError('Erreur lors de la modification du règlement');
          this.loading = false;
        }
      });
    } else {
      // Création
      this.ventesService.addReglement(reglementData).subscribe({
        next: () => {
          this.showSuccess('Règlement créé avec succès');
          setTimeout(() => {
            this.router.navigate(['/Reglement']);
          }, 1500);
        },
        error: (err: any) => {
          console.error('Erreur lors de la création:', err);
          this.showError('Erreur lors de la création du règlement');
          this.loading = false;
        }
      });
    }
  }

  markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();
      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  showSuccess(message: string): void {
    this.successMessage = message;
    this.isError = false;
    setTimeout(() => {
      this.successMessage = null;
    }, 5000);
  }

  showError(message: string): void {
    this.successMessage = message;
    this.isError = true;
    this.loading = false;
    setTimeout(() => {
      this.successMessage = null;
    }, 5000);
  }

  onCancel(): void {
    this.router.navigate(['/Reglement']);
  }
  
  // Enregistrer le lettrage des factures
  onSubmitLettrage(): void {
    if (!this.reglementId) {
      this.showError('ID du règlement manquant');
      return;
    }
    
    if (this.selectedFactures.size === 0) {
      this.showError('Veuillez sélectionner au moins une facture');
      return;
    }
    
    // Préparer les données de lettrage
    const lettrages: any[] = [];
    this.factures.forEach(facture => {
      if (this.selectedFactures.has(facture.document_id) && facture.reglement_applique > 0) {
        lettrages.push({
          document_id: facture.document_id,
          facture_ind: 1,
          montant: facture.reglement_applique
        });
      }
    });
    
    if (lettrages.length === 0) {
      this.showError('Aucune facture avec un montant de règlement valide');
      return;
    }
    
    this.loading = true;
    
    this.ventesService.saveLettrageFactures(+this.reglementId, lettrages).subscribe({
      next: (response) => {
        if (response.success) {
          // Créer automatiquement l'enregistrement en caisse
          this.createCaisseFromReglement(lettrages);
        } else {
          this.loading = false;
          this.showError(response.message || 'Erreur lors de l\'enregistrement du lettrage');
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Erreur lors de l\'enregistrement du lettrage:', error);
        this.showError(error.error?.message || 'Erreur lors de l\'enregistrement du lettrage');
      }
    });
  }
  
  // Créer automatiquement un document de caisse depuis le règlement
  private createCaisseFromReglement(lettrages: any[]): void {
    const reglementData = {
      regle_id: this.reglementId,
      numero: this.reglementForm.get('numero')?.value,
      date: this.reglementForm.get('date')?.value,
      part_id: this.reglementForm.get('part_id')?.value,
      montant: this.reglementForm.get('montant')?.value,
      client_nom: this.reglementForm.get('clientSearch')?.value
    };
    
    this.caisseService.createCaisseFromReglement(reglementData, lettrages).subscribe({
      next: (response) => {
        this.loading = false;
        if (response.success) {
          this.showSuccess('Lettrage enregistré et document de caisse créé avec succès');
          const part_id = this.reglementForm.get('part_id')?.value;
          if (part_id) {
            setTimeout(() => {
              this.loadFacturesForLettrage(part_id);
            }, 1000);
          }
        } else {
          this.showSuccess('Lettrage enregistré, mais erreur lors de la création du document de caisse');
        }
      },
      error: (error) => {
        this.loading = false;
        console.error('Erreur lors de la création du document de caisse:', error);
        // Ne pas bloquer si l'enregistrement en caisse échoue
        this.showSuccess('Lettrage enregistré, mais erreur lors de la création du document de caisse');
        const part_id = this.reglementForm.get('part_id')?.value;
        if (part_id) {
          setTimeout(() => {
            this.loadFacturesForLettrage(part_id);
          }, 1000);
        }
      }
    });
  }
}

