import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import Swal from 'sweetalert2';
import { firstValueFrom, forkJoin } from 'rxjs';
import { BaseService } from 'src/app/service/base.service';
import { StockService } from 'src/app/service/stock.service';

@Component({
  selector: 'app-stock-preparation',
  templateUrl: './stock-preparation.component.html',
  styleUrls: ['./stock-preparation.component.css']
})
export class StockPreparationComponent implements OnInit {
  loading = false;
  loadingCommandes = false;
  preparations: any[] = [];
  commandes: any[] = [];
  selectedCommandeIds = new Set<number>();

  searchTerm = '';
  currentPage = 1;
  pageSize = 25;
  total = 0;
  totalPages = 1;

  showFilterRow = false;
  sortColumn = 'date';
  sortDirection: 'ASC' | 'DESC' = 'DESC';
  columnFilters: any = { numero: '', date: '', commande_numero: '', client: '', etat: '' };

  // Add modal (same spirit as livraison)
  preparationForm!: FormGroup;
  nextPreparationNumero = 'BP25-0001';
  clients: any[] = [];
  filteredClients: any[] = [];
  commerciaux: any[] = [];
  filteredCommerciaux: any[] = [];
  employes: any[] = [];
  filteredEmployes: any[] = [];
  depots: any[] = [];
  searchClient = '';
  searchCommercial = '';
  searchEmploye = '';
  loadingCreate = false;

  constructor(
    private stockService: StockService,
    private baseService: BaseService,
    private fb: FormBuilder,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initForm();
    this.loadPreparations();
  }

  initForm(): void {
    const now = new Date();
    const pad = (n: number) => `${n}`.padStart(2, '0');
    const datetimeLocal = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    this.preparationForm = this.fb.group({
      date: [datetimeLocal, Validators.required],
      description: [''],
      part_id: [0],
      contact_id: [0],
      employe_id: [0],
      depot_id: [null],
      date_fin: ['']
    });
  }

  resetFormState(): void {
    this.initForm();
    this.searchClient = '';
    this.searchCommercial = '';
    this.searchEmploye = '';
    this.filteredClients = [];
    this.filteredCommerciaux = [];
    this.filteredEmployes = [];
  }

  loadPreparations(page: number = this.currentPage): void {
    this.loading = true;
    this.currentPage = page;
    this.stockService.getPreparations({ page: this.currentPage, pageSize: this.pageSize, search: this.searchTerm }).subscribe({
      next: (res: any) => {
        this.preparations = Array.isArray(res?.data) ? res.data : [];
        const pagination = res?.pagination || {};
        this.total = Number(pagination.total || 0);
        this.totalPages = Number(pagination.totalPages || 1);
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        Swal.fire('Erreur', err?.error?.message || 'Impossible de charger les bons de préparation.', 'error');
      }
    });
  }

  get displayPreparations(): any[] {
    let rows = [...(this.preparations || [])];
    rows = rows.filter((r: any) => {
      const dateLabel = r?.date ? new Date(r.date).toLocaleDateString('fr-FR') : '';
      const etatLabel = this.getEtatLabel(r);
      return (!this.columnFilters.numero || String(r?.numero || '').toLowerCase().includes(String(this.columnFilters.numero).toLowerCase()))
        && (!this.columnFilters.date || dateLabel.includes(String(this.columnFilters.date)))
        && (!this.columnFilters.commande_numero || String(r?.commande_numero || '').toLowerCase().includes(String(this.columnFilters.commande_numero).toLowerCase()))
        && (!this.columnFilters.client || String(r?.client || '').toLowerCase().includes(String(this.columnFilters.client).toLowerCase()))
        && (!this.columnFilters.etat || etatLabel.toLowerCase().includes(String(this.columnFilters.etat).toLowerCase()));
    });
    rows.sort((a: any, b: any) => {
      const av = this.getSortValue(a, this.sortColumn);
      const bv = this.getSortValue(b, this.sortColumn);
      const cmp = av < bv ? -1 : av > bv ? 1 : 0;
      return this.sortDirection === 'ASC' ? cmp : -cmp;
    });
    return rows;
  }

  private getSortValue(row: any, column: string): any {
    switch (column) {
      case 'date': return new Date(row?.date || 0).getTime();
      case 'progression': return this.getProgressPercent(row);
      case 'etat': return this.getEtatRank(row);
      default: return String(row?.[column] ?? '').toLowerCase();
    }
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = column === 'date' ? 'DESC' : 'ASC';
    }
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return 'fa-sort text-muted';
    return this.sortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  clearColumnFilters(): void {
    this.columnFilters = { numero: '', date: '', commande_numero: '', client: '', etat: '' };
  }

  onSearch(): void { this.loadPreparations(1); }

  onPageSizeChange(event: Event): void {
    const value = Number((event.target as HTMLSelectElement).value || 25);
    this.pageSize = Number.isFinite(value) && value > 0 ? value : 25;
    this.loadPreparations(1);
  }

  getPageNumbers(): number[] {
    const max = 7;
    if (this.totalPages <= max) return Array.from({ length: this.totalPages }, (_, i) => i + 1);
    let start = Math.max(1, this.currentPage - Math.floor(max / 2));
    let end = Math.min(this.totalPages, start + max - 1);
    if ((end - start + 1) < max) start = Math.max(1, end - max + 1);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  onPageChange(page: number): void {
    if (page < 1 || page > this.totalPages || page === this.currentPage) return;
    this.loadPreparations(page);
  }

  getDisplayRange(): string {
    if (this.total === 0) return '0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.total);
    return `${start}-${end}`;
  }

  private normalize(value: string | null | undefined): string {
    return (value || '')
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private openModalById(id: string): void {
    const modalEl = document.getElementById(id);
    if (modalEl) {
      const bs = (window as any).bootstrap;
      if (bs?.Modal) new bs.Modal(modalEl).show();
    }
  }

  private hideModalById(id: string): void {
    const modalEl = document.getElementById(id);
    const bs = (window as any).bootstrap;
    const modal = modalEl && bs?.Modal ? bs.Modal.getInstance(modalEl) : null;
    modal?.hide();
  }

  openAddPreparationModal(): void {
    this.resetFormState();
    forkJoin({
      clients: this.baseService.getClient(),
      commerciaux: this.baseService.getCommercialAutocomplete(),
      employes: this.baseService.getEmployeAutocomplete(),
      depots: this.baseService.getDepots(),
      nextNumero: this.stockService.getNextPreparationNumero()
    }).subscribe({
      next: (res: any) => {
        const clientsData = res?.clients?.data || res?.clients || [];
        const commerciauxData = res?.commerciaux?.data || res?.commerciaux || [];
        const employesData = res?.employes?.data || res?.employes || [];
        const depotsData = res?.depots?.data || res?.depots || [];
        this.clients = (Array.isArray(clientsData) ? clientsData : []).filter((c: any) => Number(c?.type) === 1);
        this.commerciaux = Array.isArray(commerciauxData) ? commerciauxData : [];
        this.employes = Array.isArray(employesData) ? employesData : [];
        this.depots = Array.isArray(depotsData) ? depotsData : [];
        this.nextPreparationNumero = res?.nextNumero?.numero || this.nextPreparationNumero;
        this.openModalById('addPreparationModal');
      },
      error: () => {
        Swal.fire('Erreur', 'Impossible de charger les données du formulaire.', 'error');
      }
    });
  }

  onSearchClientChange(value: string): void {
    this.searchClient = value || '';
    const term = this.normalize(this.searchClient);
    if (!term) {
      this.filteredClients = [];
      this.preparationForm.patchValue({ part_id: 0 }, { emitEvent: false });
      return;
    }
    this.filteredClients = (this.clients || []).filter((c: any) => this.normalize(c?.nom).includes(term)).slice(0, 20);
  }

  onCommercialSearchChange(value: string): void {
    this.searchCommercial = value || '';
    const term = this.normalize(this.searchCommercial);
    if (!term) {
      this.filteredCommerciaux = [];
      this.preparationForm.patchValue({ contact_id: 0 }, { emitEvent: false });
      return;
    }
    this.filteredCommerciaux = (this.commerciaux || []).filter((c: any) => this.normalize(c?.nom).includes(term)).slice(0, 20);
  }

  onEmployeSearchChange(value: string): void {
    this.searchEmploye = value || '';
    const term = this.normalize(this.searchEmploye);
    if (!term) {
      this.filteredEmployes = [];
      this.preparationForm.patchValue({ employe_id: 0 }, { emitEvent: false });
      return;
    }
    this.filteredEmployes = (this.employes || []).filter((e: any) => {
      const label = e?.nom_complet || `${e?.nom || ''} ${e?.prenom || ''}`;
      return this.normalize(label).includes(term);
    }).slice(0, 20);
  }

  selectClient(client: any): void {
    this.searchClient = client?.nom || '';
    this.filteredClients = [];
    this.preparationForm.patchValue({ part_id: Number(client?.part_id || 0) });
  }

  selectCommercial(commercial: any): void {
    this.searchCommercial = commercial?.nom || '';
    this.filteredCommerciaux = [];
    this.preparationForm.patchValue({ contact_id: Number(commercial?.id || 0) });
  }

  selectEmploye(employe: any): void {
    this.searchEmploye = employe?.nom_complet || [employe?.nom, employe?.prenom].filter(Boolean).join(' ').trim();
    this.filteredEmployes = [];
    this.preparationForm.patchValue({ employe_id: Number(employe?.id || 0) });
  }

  createPreparationHeader(): void {
    this.onSubmitPreparation();
  }

  onSubmitPreparation(): void {
    if (!this.preparationForm) return;
    this.loadingCreate = true;
    const v = this.preparationForm.value;
    const payload = {
      description: v.description || 'Bon de préparation',
      date: v.date ? String(v.date).replace('T', ' ') + ':00' : null,
      part_id: Number(v.part_id || 0) || null,
      contact_id: Number(v.contact_id || 0) || null,
      employe_id: Number(v.employe_id || 0) || null,
      depot_id: Number(v.depot_id || 0) || null,
      date_fin: v.date_fin || null
    };
    this.stockService.createPreparation(payload).subscribe({
      next: (res: any) => {
        this.loadingCreate = false;
        this.hideModalById('addPreparationModal');
        Swal.fire('Succès', res?.message || 'Bon de préparation créé.', 'success');
        if (res?.preparationId) {
          this.router.navigate(['/Edit-Preparation', res.preparationId]);
          return;
        }
        this.loadPreparations(1);
      },
      error: (err) => {
        this.loadingCreate = false;
        Swal.fire('Erreur', err?.error?.message || 'Création impossible.', 'error');
      }
    });
  }

  openCommandesModal(): void {
    this.selectedCommandeIds.clear();
    this.loadingCommandes = true;
    this.stockService.getCommandesDisponiblesPourPreparation().subscribe({
      next: (res: any) => {
        this.commandes = Array.isArray(res?.data) ? res.data : [];
        this.loadingCommandes = false;
        this.openModalById('commandesPreparationModal');
      },
      error: (err) => {
        this.loadingCommandes = false;
        Swal.fire('Erreur', err?.error?.message || 'Impossible de charger les commandes.', 'error');
      }
    });
  }

  toggleCommandeSelection(commandeId: number, checked: boolean): void {
    if (!commandeId) return;
    checked ? this.selectedCommandeIds.add(commandeId) : this.selectedCommandeIds.delete(commandeId);
  }

  isCommandeSelected(commandeId: number): boolean { return this.selectedCommandeIds.has(Number(commandeId)); }

  toggleAllCommandes(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedCommandeIds.clear();
    if (checked) this.commandes.forEach((c: any) => { const id = Number(c?.document_id || 0); if (id > 0) this.selectedCommandeIds.add(id); });
  }

  async transfererCommandesVersPreparation(): Promise<void> {
    const ids = Array.from(this.selectedCommandeIds);
    if (ids.length === 0) { Swal.fire('Info', 'Sélectionnez au moins une commande.', 'info'); return; }
    const confirm = await Swal.fire({ icon: 'question', title: 'Confirmer le transfert', text: `${ids.length} commande(s) vers préparation`, showCancelButton: true, confirmButtonText: 'Oui, transférer', cancelButtonText: 'Annuler' });
    if (!confirm.isConfirmed) return;
    Swal.fire({ title: 'Transfert en cours...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      for (const commandeId of ids) await firstValueFrom(this.stockService.createPreparation({ sourceCommandeId: commandeId }));
      Swal.fire('Succès', `${ids.length} bon(s) de préparation créé(s).`, 'success');
      this.hideModalById('commandesPreparationModal');
      this.loadPreparations(1);
    } catch (err: any) {
      Swal.fire('Erreur', err?.error?.message || 'Erreur pendant le transfert.', 'error');
    }
  }

  async transfererVersLivraison(preparation: any): Promise<void> {
    const id = Number(preparation?.preparation_id || 0);
    if (!id) return;
    const confirm = await Swal.fire({ icon: 'question', title: 'Transférer vers bon de livraison', html: `Préparation <strong>${preparation?.numero || ''}</strong>`, showCancelButton: true, confirmButtonText: 'Transférer', cancelButtonText: 'Annuler' });
    if (!confirm.isConfirmed) return;
    this.stockService.transfererPreparationVersLivraison(id).subscribe({
      next: (res: any) => { Swal.fire('Succès', res?.message || `BL ${res?.numeroLivraison || ''} créé.`, 'success'); this.loadPreparations(this.currentPage); },
      error: (err) => Swal.fire('Erreur', err?.error?.message || 'Transfert impossible.', 'error')
    });
  }

  imprimerPreparation(preparation: any): void {
    const id = Number(preparation?.preparation_id || 0);
    if (!id) return;
    this.stockService.exportPreparationPdf(id).subscribe({
      next: (response: any) => {
        const blob = response?.body;
        if (!blob) {
          Swal.fire('Erreur', 'PDF introuvable.', 'error');
          return;
        }
        const blobUrl = window.URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
      },
      error: (err) => {
        Swal.fire('Erreur', err?.error?.message || 'Impossible d\'ouvrir le PDF.', 'error');
      }
    });
  }

  editPreparation(preparation: any): void {
    const id = Number(preparation?.preparation_id || 0);
    if (!id) return;
    this.router.navigate(['/Edit-Preparation', id]);
  }

  getPreparedQuantity(row: any): number {
    return Math.max(0, Number(row?.total_quantite || 0));
  }

  getOrderedQuantity(row: any): number {
    return Math.max(0, Number(row?.total_demande || 0));
  }

  getRemainingToPrepare(row: any): number {
    return Math.max(0, this.getOrderedQuantity(row) - this.getPreparedQuantity(row));
  }

  getTransferredQuantity(row: any): number {
    return Math.max(0, Number(row?.total_transfere || 0));
  }

  getRemainingToTransfer(row: any): number {
    return Math.max(0, this.getPreparedQuantity(row) - this.getTransferredQuantity(row));
  }

  isPreparationComplete(row: any): boolean {
    const ordered = this.getOrderedQuantity(row);
    const prepared = this.getPreparedQuantity(row);
    return ordered > 0 && prepared === ordered;
  }

  getProgressPercent(row: any): number {
    const total = this.getOrderedQuantity(row);
    if (total <= 0) return 0;
    return Math.min(100, Math.max(0, (this.getPreparedQuantity(row) / total) * 100));
  }

  getProgressText(row: any): string {
    return `${this.getPreparedQuantity(row)} / ${this.getOrderedQuantity(row)} (${this.getProgressPercent(row).toFixed(0)}%)`;
  }

  getProgressTooltip(row: any): string {
    return [
      `Total demande : ${this.getOrderedQuantity(row)}`,
      `Total prepare : ${this.getPreparedQuantity(row)}`,
      `Reste a preparer : ${this.getRemainingToPrepare(row)}`,
      `Avancement : ${this.getProgressPercent(row).toFixed(0)}%`
    ].join('\n');
  }

  canTransferPreparation(row: any): boolean {
    return this.getRemainingToTransfer(row) > 0;
  }

  private getEtatRank(row: any): number {
    if (this.getPreparedQuantity(row) <= 0) return 0;
    if (this.isPreparationComplete(row)) return 2;
    return 1;
  }

  getEtatBadgeClass(row: any): string {
    if (this.isPreparationComplete(row)) return 'bg-success';
    if (this.getPreparedQuantity(row) > 0) return 'bg-info text-dark';
    return 'bg-warning text-dark';
  }

  getEtatLabel(row: any): string {
    if (this.isPreparationComplete(row)) return 'Transfere';
    if (this.getPreparedQuantity(row) > 0) return 'Partiel';
    return 'Brouillon';
  }
}

