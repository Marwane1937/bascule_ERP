import { AfterViewInit, ChangeDetectorRef, Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import { EmailService } from 'src/app/service/email.service';
import Swal from 'sweetalert2';
import { Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';


@Component({
  selector: 'app-retour',
  templateUrl: './retour.component.html',
  styleUrls: ['./retour.component.css']
})
export class RetourComponent implements OnInit, AfterViewInit, OnDestroy {
  retours: any[] = [];
  dataTableRetour: any;
  loading: boolean = true;
  loadingRetours: boolean = false;
  searchTerm = '';
  searchTermRetours: string = '';
  clients: any[] = [];
  filteredClients: any[] = [];
  selectedClient: any = null;
  searchCommercial = '';
  commerciaux: any[] = [];
  filteredCommerciaux: any[] = [];
  selectedCommercial: any = null;
  RetourForm!: FormGroup;
  successMessage: string | null = null;
  isError: boolean = false;
  nextRetourNumero: string = 'RT25-0001';

  // Pagination pour les retours
  currentPageRetours: number = 1;
  pageSizeRetours: number = 25;
  totalRecordsRetours: number = 0;
  totalPagesRetours: number = 0;

  // Tri pour les retours
  sortColumnRetours: string = 'date';
  sortDirectionRetours: 'ASC' | 'DESC' = 'DESC';

  // Filtres avancés pour les retours
  showAdvancedFiltersRetours: boolean = false;
  filterDateFromRetours: string = '';
  filterDateToRetours: string = '';
  filterClientRetours: string = '';

  // Liste des clients pour le filtre
  clientsListRetours: string[] = [];

  private clientSearchSub?: Subscription;
  private commercialSearchSub?: Subscription;

  constructor(
    private ventesService: VentesService,
    private router: Router,
    private baseService: BaseService,
    private fb: FormBuilder,
    private emailService: EmailService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.getRetours();
    this.AllClients();
    this.AllCommerciaux();
    this.initForm();
    this.resetFormState();
    this.loadNextRetourNumero();
  }

  initForm(): void {
    this.RetourForm = this.fb.group({
      date: [new Date().toISOString().substring(0, 10), Validators.required],
      description: [''],
      part_id: [0],
      contact_id: [0],
      date_fin: [''],
      etat: [3],
      clientSearch: [''],
      commercialSearch: ['']
    });

    this.setupFormListeners();
  }

  private setupFormListeners(): void {
    this.clientSearchSub?.unsubscribe();
    this.commercialSearchSub?.unsubscribe();

    this.clientSearchSub = this.clientSearchControl.valueChanges
      .pipe(
        debounceTime(150),
        distinctUntilChanged()
      )
      .subscribe(value => {
        this.searchTerm = value || '';
        this.onSearchChange(value);
      });

    this.commercialSearchSub = this.commercialSearchControl.valueChanges
      .pipe(
        debounceTime(150),
        distinctUntilChanged()
      )
      .subscribe(value => {
        this.searchCommercial = value || '';
        this.onCommercialSearchChange(value);
      });
  }

  private resetFormState(): void {
    if (!this.RetourForm) {
      return;
    }

    this.RetourForm.reset({
      date: new Date().toISOString().substring(0, 10),
      description: '',
      part_id: 0,
      contact_id: 0,
      date_fin: '',
      etat: 3,
      clientSearch: '',
      commercialSearch: ''
    }, { emitEvent: false });

    this.filteredClients = [];
    this.filteredCommerciaux = [];
    this.searchTerm = '';
    this.searchCommercial = '';
  }

  private normalizeValue(value: string | null | undefined): string {
    if (!value) {
      return '';
    }

    return value
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private matchTerm(haystack: string, searchTerm: string): boolean {
    const normalizedHaystack = this.normalizeValue(haystack);
    const tokens = this.normalizeValue(searchTerm)
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) {
      return false;
    }

    return tokens.every(token => normalizedHaystack.includes(token));
  }

  ngAfterViewInit(): void {
    const anyWindow = window as any;
    // @ts-ignore
    if (typeof ($) !== 'undefined') {
      // @ts-ignore
      $('#addRetourModal').on('shown.bs.modal', () => {
        this.resetFormState();
        this.loadNextRetourNumero();
      });

      // @ts-ignore
      $('#addRetourModal').on('hidden.bs.modal', () => {
        this.resetFormState();
      });
    }
  }

  loadNextRetourNumero(): void {
    this.ventesService.getNextRetourNumero().subscribe({
      next: (response: any) => {
        if (response && response.numero) {
          this.nextRetourNumero = response.numero;
        }
      },
      error: (err) => {
        console.error('Erreur lors du chargement du numéro de retour:', err);
      }
    });
  }

  loadRetours(page: number = 1, search: string = '', resetFilters: boolean = false): void {
    this.loadingRetours = true;
    this.currentPageRetours = page;
    this.searchTermRetours = search;

    if (resetFilters) {
      this.filterDateFromRetours = '';
      this.filterDateToRetours = '';
      this.filterClientRetours = '';
    }

    this.ventesService.getRetours({
      page: page,
      pageSize: this.pageSizeRetours,
      orderBy: this.sortColumnRetours,
      orderDirection: this.sortDirectionRetours,
      search: search
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};

        // Les données sont déjà filtrées et paginées par le serveur
        this.retours = Array.isArray(result) ? result : [];
        this.totalRecordsRetours = pagination.total || 0;
        this.totalPagesRetours = pagination.totalPages || 1;

        console.log(`[RetourComponent] Page ${page}/${this.totalPagesRetours}, ${this.retours.length} retours chargés sur ${this.totalRecordsRetours} total`);

        // Extraire la liste des clients uniques pour le filtre (depuis la page actuelle uniquement)
        this.extractClientsListRetours(this.retours);

        this.loadingRetours = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[RetourComponent] ❌ Erreur lors du chargement des retours:', err);
        this.showError("❌ Une erreur s'est produite lors du chargement des retours.");
        this.loadingRetours = false;
        this.retours = [];
        this.cdr.detectChanges();
      }
    });
  }

  getRetours(): void {
    // Toujours utiliser loadRetours avec pagination dès le démarrage
    this.loadRetours(1, '', false);
  }

  AllClients() {
    this.baseService.getClient().subscribe((response: any) => {
      this.clients = response?.data || (Array.isArray(response) ? response : []);
      this.filteredClients = [];
    })
  }

  onSearchChange(term: string | null | undefined) {
    if (!term || this.normalizeValue(term).length === 0) {
      this.filteredClients = [];
      return;
    }

    if (!Array.isArray(this.clients) || this.clients.length === 0) {
      this.filteredClients = [];
      return;
    }

    this.filteredClients = this.clients.filter(client => {
      if (!client) {
        return false;
      }

      const searchSources = [
        client.nom,
        client.raison_sociale,
        client.raisonSociale,
        client.rs,
        client.part_ref,
        client.nom_commercial,
        client.email,
        client.telephone
      ];

      return searchSources.some(source => source && this.matchTerm(source, term));
    });
  }

  selectClient(client: any) {
    if (!client) return;

    this.RetourForm.patchValue({
      clientSearch: client.nom,
      part_id: client.part_id
    }, { emitEvent: false });
    this.filteredClients = [];
    this.searchTerm = client.nom;
    this.cdr.detectChanges();
  }

  AllCommerciaux() {
    this.baseService.getCommercial().subscribe((response: any) => {
      this.commerciaux = response?.data || (Array.isArray(response) ? response : []);
      this.filteredCommerciaux = [];
    })
  }

  onCommercialSearchChange(term: string | null | undefined) {
    if (!term || this.normalizeValue(term).length === 0) {
      this.filteredCommerciaux = [];
      return;
    }

    if (!Array.isArray(this.commerciaux) || this.commerciaux.length === 0) {
      this.filteredCommerciaux = [];
      return;
    }

    this.filteredCommerciaux = this.commerciaux.filter(com => {
      if (!com) {
        return false;
      }

      const searchSources = [
        com.nom,
        com.prenom,
        com.fullname,
        com.email,
        com.telephone
      ];

      return searchSources.some(source => source && this.matchTerm(source, term));
    });
  }

  selectCommercial(com: any) {
    this.RetourForm.patchValue({
      commercialSearch: com.nom,
      contact_id: com.id
    }, { emitEvent: false });
    this.filteredCommerciaux = [];
    this.searchCommercial = com.nom;
  }

  onSubmit(): void {
    if (this.RetourForm.valid) {
      const formValue = {
        ...this.RetourForm.value
      };

      this.ventesService.addRetour(formValue).subscribe({
        next: (response: any) => {
          this.showSuccess(`✅ Retour ${response.numero || ''} créé avec succès !`);
          const modal = document.getElementById('addRetourModal');
          if (modal) {
            const bsModal = (window as any).bootstrap?.Modal?.getInstance(modal);
            if (bsModal) {
              bsModal.hide();
            }
          }
          this.RetourForm.reset();
          this.initForm();
          this.loadRetours(this.currentPageRetours, this.searchTermRetours);
          this.loadNextRetourNumero();
        },
        error: (err) => {
          console.error('Erreur création retour:', err);
          this.showError(`❌ Une erreur s'est produite lors de la création du retour: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    } else {
      this.showError("❗ Le formulaire est invalide. Veuillez remplir tous les champs requis.");
    }
  }

  removeRetour(retour: any, index: number) {
    this.removeRetourById(retour.document_id, retour.numero);
  }

  removeRetourById(id: number, numero?: string) {
    Swal.fire({
      title: 'Confirmer la suppression',
      html: `Voulez-vous vraiment supprimer le retour <strong>${numero || 'N/A'}</strong> ?<br><br><small class="text-muted">Cette action est irréversible.</small>`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Oui, supprimer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: '#dc3545',
      cancelButtonColor: '#6c757d',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        const idsToDelete = [id];

        this.ventesService.RemoveRetour(idsToDelete).subscribe({
          next: (res: any) => {
            Swal.fire({
              icon: 'success',
              title: 'Supprimé !',
              text: `Le retour ${numero || 'N/A'} a été supprimé avec succès.`,
              confirmButtonText: 'OK',
              timer: 2000,
              timerProgressBar: true
            }).then(() => {
              this.loadRetours(this.currentPageRetours, this.searchTermRetours);
            });
          },
          error: (err: any) => {
            console.error('Erreur de suppression :', err);
            Swal.fire({
              icon: 'error',
              title: 'Erreur',
              text: `Une erreur s'est produite lors de la suppression : ${err.error?.message || err.message || 'Erreur inconnue'}`,
              confirmButtonText: 'Fermer'
            });
          }
        });
      }
    });
  }

  showSuccess(message: string) {
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: message,
      confirmButtonText: 'OK'
    }).then(() => {
      this.getRetours();
    });
  }

  showError(message: string) {
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: message,
      confirmButtonText: 'Fermer'
    });
  }

  get clientSearchControl() {
    return this.RetourForm.get('clientSearch') as FormControl;
  }

  get commercialSearchControl() {
    return this.RetourForm.get('commercialSearch') as FormControl;
  }

  // Méthodes de pagination pour les retours
  onPageChangeRetours(page: number): void {
    if (page >= 1 && page <= this.totalPagesRetours && page !== this.currentPageRetours) {
      this.loadRetours(page, this.searchTermRetours);
    }
  }

  onPageSizeChangeRetours(event: any): void {
    const newPageSize = parseInt(event.target.value);
    if (newPageSize > 0) {
      this.pageSizeRetours = newPageSize;
      this.loadRetours(1, this.searchTermRetours);
    }
  }

  onSearchRetours(): void {
    this.loadRetours(1, this.searchTermRetours);
  }

  onSearchKeyPressRetours(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.onSearchRetours();
    }
  }

  getPageNumbersRetours(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPageRetours - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPagesRetours, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  getDisplayRangeRetours(): string {
    const start = ((this.currentPageRetours - 1) * this.pageSizeRetours) + 1;
    const end = Math.min(this.currentPageRetours * this.pageSizeRetours, this.totalRecordsRetours);
    return `${start} à ${end}`;
  }

  // Tri par colonne pour les retours
  onSortRetours(column: string): void {
    if (this.sortColumnRetours === column) {
      this.sortDirectionRetours = this.sortDirectionRetours === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumnRetours = column;
      this.sortDirectionRetours = 'DESC';
    }
    this.loadRetours(1, this.searchTermRetours);
  }

  getSortIconRetours(column: string): string {
    if (this.sortColumnRetours !== column) {
      return 'fa-sort';
    }
    return this.sortDirectionRetours === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // Filtres avancés pour les retours
  toggleAdvancedFiltersRetours(): void {
    this.showAdvancedFiltersRetours = !this.showAdvancedFiltersRetours;
  }

  applyAdvancedFiltersRetours(retours: any[]): any[] {
    let filtered = [...retours];

    if (this.filterDateFromRetours) {
      const fromDate = new Date(this.filterDateFromRetours);
      filtered = filtered.filter(r => {
        if (!r.date) return false;
        const retourDate = new Date(r.date);
        return retourDate >= fromDate;
      });
    }

    if (this.filterDateToRetours) {
      const toDate = new Date(this.filterDateToRetours);
      toDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(r => {
        if (!r.date) return false;
        const retourDate = new Date(r.date);
        return retourDate <= toDate;
      });
    }

    if (this.filterClientRetours) {
      filtered = filtered.filter(r =>
        r.client?.toLowerCase().includes(this.filterClientRetours.toLowerCase())
      );
    }

    return filtered;
  }

  onFilterChangeRetours(): void {
    this.loadRetours(this.currentPageRetours, this.searchTermRetours);
  }

  resetFiltersRetours(): void {
    this.filterDateFromRetours = '';
    this.filterDateToRetours = '';
    this.filterClientRetours = '';
    this.loadRetours(1, this.searchTermRetours, true);
  }

  extractClientsListRetours(retours: any[]): void {
    const clients = new Set<string>();
    retours.forEach(r => {
      if (r.client) {
        clients.add(r.client);
      }
    });
    this.clientsListRetours = Array.from(clients).sort();
  }

  isFacturee(retour: any): boolean {
    if (!retour || !retour.facture) {
      return false;
    }
    return retour.facture.toUpperCase().trim() === 'FACTURE';
  }

  // Export des données pour les retours
  exportToCSVRetours(): void {
    const headers = ['Numéro', 'Date', 'Client', 'Commercial', 'HT', 'TVA', 'TTC'];
    const rows = this.retours.map(r => [
      r.numero || '',
      r.date ? new Date(r.date).toLocaleDateString('fr-FR') : '',
      r.client || '',
      r.commercial || '',
      (r.total_ht || 0).toFixed(2),
      (r.total_tva || 0).toFixed(2),
      (r.total_ttc || 0).toFixed(2)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `retours_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.showNotification('✅ Export CSV réussi !', false);
  }

  showNotification(message: string, isError: boolean = false): void {
    this.successMessage = message;
    this.isError = isError;
    setTimeout(() => {
      this.successMessage = null;
    }, 5000);
  }

  OnEditRetour(document_id: any) {
    this.router.navigate(['/Edit-Retour/' + document_id]);
  }

  OnPrintRetour(document_id: any) {
    // Afficher un loader pendant la génération du PDF
    Swal.fire({
      title: 'Génération du PDF...',
      allowOutsideClick: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    // Utiliser generateRetourPDF pour les retours
    this.emailService.generateRetourPDF(document_id.toString()).subscribe({
      next: (res: any) => {
        Swal.close();
        const url = res?.pdfUrl;
        if (url) {
          // Ouvrir le PDF dans un nouvel onglet
          window.open(url, '_blank');
        } else {
          Swal.fire({
            icon: 'error',
            title: 'Erreur',
            text: 'Lien PDF non reçu.'
          });
        }
      },
      error: (err: any) => {
        Swal.close();
        console.error('Erreur génération PDF retour :', err);
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: err.error?.message || 'Erreur lors de la génération du PDF de retour.'
        });
      }
    });
  }

  ngOnDestroy(): void {
    this.clientSearchSub?.unsubscribe();
    this.commercialSearchSub?.unsubscribe();
  }
}

