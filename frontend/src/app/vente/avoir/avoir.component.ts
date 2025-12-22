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
  selector: 'app-avoir',
  templateUrl: './avoir.component.html',
  styleUrls: ['./avoir.component.css']
})
export class AvoirComponent implements OnInit, AfterViewInit, OnDestroy {
  avoirs: any[] = [];
  loading: boolean = true;
  loadingAvoirs: boolean = false;
  searchTerm = '';
  clients: any[] = [];
  filteredClients: any[] = [];
  selectedClient: any = null;
  AvoirForm!: FormGroup;
  successMessage: string | null = null;
  isError: boolean = false;
  nextAvoirNumero: string = 'AV25-0001';
  typeAvoir: 'FINANCIER' | 'MARCHANDISE' = 'FINANCIER';

  // Pagination pour les avoirs
  currentPageAvoirs: number = 1;
  pageSizeAvoirs: number = 25;
  totalRecordsAvoirs: number = 0;
  totalPagesAvoirs: number = 0;

  // Tri pour les avoirs
  sortColumnAvoirs: string = 'facture_dat';
  sortDirectionAvoirs: 'ASC' | 'DESC' = 'DESC';

  // Filtres avancés pour les avoirs
  showAdvancedFiltersAvoirs: boolean = false;
  filterDateFromAvoirs: string = '';
  filterDateToAvoirs: string = '';
  filterClientAvoirs: string = '';

  // Liste des clients pour le filtre
  clientsListAvoirs: string[] = [];

  // Pour avoir financier
  facturesDisponibles: any[] = [];
  selectedFacture: any = null;

  // Pour avoir marchandise
  retoursDisponibles: any[] = [];
  selectedRetour: any = null;

  // Client sélectionné (affiché automatiquement)
  selectedClientName: string = '';
  selectedClientId: number | null = null;

  private clientSearchSub?: Subscription;

  constructor(
    private ventesService: VentesService,
    private router: Router,
    private baseService: BaseService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private emailService: EmailService
  ) { }

  ngOnInit(): void {
    this.getAvoirs();
    this.AllClients();
    this.initForm();
    this.resetFormState();
    this.loadNextAvoirNumero();
  }

  initForm(): void {
    this.AvoirForm = this.fb.group({
      date: [new Date().toISOString().substring(0, 10), Validators.required],
      part_id: [0],
      clientSearch: [''],
      clientDisplay: [''], // Champ Client en lecture seule
      facture_id: [null], // Pour avoir financier
      retour_id: [null], // Pour avoir marchandise
      montant_ht: [0],
      montant_tva: [0],
      description: ['']
    });

    this.setupFormListeners();
  }

  private setupFormListeners(): void {
    this.clientSearchSub?.unsubscribe();

    this.clientSearchSub = this.clientSearchControl.valueChanges
      .pipe(
        debounceTime(150),
        distinctUntilChanged()
      )
      .subscribe(value => {
        this.onSearchChange(value);
      });
  }

  get clientSearchControl(): FormControl {
    return this.AvoirForm.get('clientSearch') as FormControl;
  }

  ngAfterViewInit(): void {
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.clientSearchSub?.unsubscribe();
  }

  resetFormState(): void {
    this.searchTerm = '';
    this.filteredClients = [];
    this.selectedClient = null;
    this.selectedFacture = null;
    this.selectedRetour = null;
    this.selectedClientName = '';
    this.selectedClientId = null;
  }

  loadAvoirs(page: number = 1, search: string = '') {
    this.loadingAvoirs = true;
    this.currentPageAvoirs = page;
    this.searchTerm = search;

    // Réinitialiser les filtres avancés si nécessaire
    if (page === 1 && !search) {
      this.filterDateFromAvoirs = '';
      this.filterDateToAvoirs = '';
      this.filterClientAvoirs = '';
    }

    this.ventesService.getAvoirs({
      page: page,
      pageSize: this.pageSizeAvoirs,
      orderBy: this.sortColumnAvoirs,
      orderDirection: this.sortDirectionAvoirs,
      search: search
    }).subscribe({
      next: (response: any) => {
        const result = response.data || [];
        const pagination = response.pagination || {};

        // Les données sont déjà filtrées et paginées par le serveur
        this.avoirs = Array.isArray(result) ? result : [];
        this.totalRecordsAvoirs = pagination.total || 0;
        this.totalPagesAvoirs = pagination.totalPages || 1;

        console.log(`[AvoirComponent] Page ${page}/${this.totalPagesAvoirs}, ${this.avoirs.length} avoirs chargés sur ${this.totalRecordsAvoirs} total`);

        // Extraire la liste des clients uniques pour le filtre (depuis la page actuelle uniquement)
        this.extractClientsListAvoirs(this.avoirs);

        this.loadingAvoirs = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[AvoirComponent] ❌ Erreur lors du chargement des avoirs:', err);
        this.showError("❌ Une erreur s'est produite lors du chargement des avoirs.");
        this.loadingAvoirs = false;
        this.avoirs = [];
        this.cdr.detectChanges();
      }
    });
  }

  getAvoirs(): void {
    // Toujours utiliser loadAvoirs avec pagination dès le démarrage
    this.loadAvoirs(1, '');
  }

  AllClients() {
    this.baseService.getClient().subscribe(res => {
      this.clients = res.data || (Array.isArray(res) ? res : []);
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

    this.AvoirForm.patchValue({
      clientSearch: client.nom,
      part_id: client.part_id
    }, { emitEvent: false });
    this.filteredClients = [];
    this.searchTerm = client.nom;
    this.cdr.detectChanges();
  }

  loadNextAvoirNumero() {
    this.ventesService.getNextAvoirNumero().subscribe({
      next: (response: any) => {
        this.nextAvoirNumero = response.numero || 'AV25-0001';
      },
      error: (err) => {
        console.error('Erreur chargement numéro avoir:', err);
      }
    });
  }

  onChangeTypeAvoir(type: 'FINANCIER' | 'MARCHANDISE') {
    this.typeAvoir = type;
    this.selectedFacture = null;
    this.selectedRetour = null;
    this.selectedClientName = '';
    this.selectedClientId = null;
    this.AvoirForm.patchValue({
      facture_id: null,
      retour_id: null,
      clientDisplay: '',
      part_id: 0,
      montant_ht: 0,
      montant_tva: 0
    });

    if (type === 'FINANCIER') {
      this.loadFacturesDisponibles();
    } else {
      this.loadRetoursDisponibles();
    }
  }

  loadFacturesDisponibles() {
    // Charger les factures disponibles pour créer un avoir financier
    this.ventesService.getFactures({ page: 1, pageSize: 100 }).subscribe({
      next: (response: any) => {
        this.facturesDisponibles = response.data || (Array.isArray(response) ? response : []);
      },
      error: (err) => {
        console.error('Erreur chargement factures:', err);
        this.facturesDisponibles = [];
      }
    });
  }

  loadRetoursDisponibles() {
    // Charger les retours disponibles pour créer un avoir marchandise
    this.ventesService.getRetours({ page: 1, pageSize: 100 }).subscribe({
      next: (response: any) => {
        this.retoursDisponibles = response.data || (Array.isArray(response) ? response : []);
      },
      error: (err) => {
        console.error('Erreur chargement retours:', err);
        this.retoursDisponibles = [];
      }
    });
  }

  selectFacture(factureId: any) {
    const facture = this.facturesDisponibles.find(f => f.facture_id == factureId);
    if (facture) {
      this.selectedFacture = facture;

      // Le nom du client est déjà dans les données de la facture
      const clientName = facture.nom || '';
      this.selectedClientName = clientName;

      // Récupérer le part_id et les montants depuis l'API
      this.ventesService.getFactureById(facture.facture_id).subscribe({
        next: (res: any) => {
          const factureData = res.data || res;
          const clientId = factureData?.part_id || facture?.part_id || null;
          this.selectedClientId = clientId;

          if (!clientId) {
            console.warn('[selectFacture] ⚠️ part_id non trouvé pour la facture:', facture.facture_id);
          }

          // Récupérer les montants depuis v_facture_montant
          this.ventesService.getFactureMontant(facture.facture_id).subscribe({
            next: (montant: any) => {
              const totalHt = montant?.data?.total_ht || montant?.total_ht || 0;
              const totalTva = montant?.data?.total_tva || montant?.total_tva || 0;

              this.AvoirForm.patchValue({
                facture_id: facture.facture_id,
                montant_ht: totalHt,
                montant_tva: totalTva,
                clientDisplay: clientName,
                part_id: clientId || 0
              });

            },
            error: (err) => {
              console.error('Erreur récupération montants facture:', err);
              // Fallback sur les données de la facture si v_facture_montant échoue
              this.AvoirForm.patchValue({
                facture_id: facture.facture_id,
                montant_ht: facture.facture_ht || 0,
                montant_tva: facture.facture_tva || 0,
                clientDisplay: clientName,
                part_id: clientId || 0
              });

              if (!clientId) {
                console.warn('[selectFacture] ⚠️ part_id toujours non défini après fallback');
              }
            }
          });
        },
        error: (err) => {
          console.error('Erreur récupération détails facture:', err);
          // Essayer de récupérer le part_id depuis la liste des factures disponibles
          const clientIdFromList = facture.part_id || null;

          // Récupérer uniquement les montants depuis v_facture_montant
          this.ventesService.getFactureMontant(facture.facture_id).subscribe({
            next: (montant: any) => {
              const totalHt = montant?.data?.total_ht || montant?.total_ht || 0;
              const totalTva = montant?.data?.total_tva || montant?.total_tva || 0;

              this.AvoirForm.patchValue({
                facture_id: facture.facture_id,
                montant_ht: totalHt,
                montant_tva: totalTva,
                clientDisplay: clientName,
                part_id: clientIdFromList || 0
              });

              if (clientIdFromList) {
                this.selectedClientId = clientIdFromList;
              } else {
                console.warn('[selectFacture] ⚠️ part_id non disponible dans la liste des factures');
              }
            },
            error: (err2) => {
              console.error('Erreur récupération montants facture:', err2);
              // Utiliser les données de la facture si disponibles
              this.AvoirForm.patchValue({
                facture_id: facture.facture_id,
                montant_ht: facture.facture_ht || 0,
                montant_tva: facture.facture_tva || 0,
                clientDisplay: clientName,
                part_id: clientIdFromList || 0
              });

              if (clientIdFromList) {
                this.selectedClientId = clientIdFromList;
              } else {
                console.error('[selectFacture] ❌ Impossible de récupérer le part_id');
              }
            }
          });
        }
      });
    }
  }

  selectRetour(retourId: any) {
    const retour = this.retoursDisponibles.find(r => r.document_id == retourId);
    if (retour) {
      this.selectedRetour = retour;

      // Le client est déjà dans les données du retour
      const clientName = retour.client || '';
      const clientId = retour.part_id || null;

      // Calculer automatiquement les montants HT et TVA depuis le retour
      const montantHt = retour.total_ht || 0;
      const montantTva = retour.total_tva || 0;

      this.selectedClientName = clientName;
      this.selectedClientId = clientId;

      this.AvoirForm.patchValue({
        retour_id: retour.document_id,
        clientDisplay: clientName,
        part_id: clientId || 0,
        montant_ht: montantHt,
        montant_tva: montantTva
      });
    }
  }

  onSubmit(): void {
    if (this.AvoirForm.valid) {
      const formValue = {
        ...this.AvoirForm.value
      };

      // S'assurer que le part_id est bien défini pour un avoir financier
      if (this.typeAvoir === 'FINANCIER') {
        // Utiliser le part_id du formulaire, ou celui du client sélectionné, ou celui de la facture
        const partId = formValue.part_id || this.selectedClientId || this.selectedFacture?.part_id || null;

        if (!partId || partId === 0) {
          this.showError('❌ Le client (part_id) est requis pour créer un avoir financier. Veuillez sélectionner une facture valide.');
          return;
        }

        formValue.part_id = partId;
      }

      const serviceCall = this.typeAvoir === 'FINANCIER'
        ? this.ventesService.addAvoirFinancier(formValue)
        : this.ventesService.addAvoirMarchandise(formValue);

      serviceCall.subscribe({
        next: (response: any) => {
          this.showSuccess(`✅ Avoir ${response.facture_num || ''} créé avec succès !`);
          const modal = document.getElementById('addAvoirModal');
          if (modal) {
            const bsModal = (window as any).bootstrap?.Modal?.getInstance(modal);
            if (bsModal) {
              bsModal.hide();
            }
          }
          this.AvoirForm.reset();
          this.resetFormState();
          this.initForm();
          this.loadAvoirs(this.currentPageAvoirs, this.searchTerm);
          this.loadNextAvoirNumero();
        },
        error: (err) => {
          console.error('Erreur création avoir:', err);
          this.showError(`❌ Une erreur s'est produite lors de la création de l'avoir: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    } else {
      this.showError("❗ Le formulaire est invalide. Veuillez remplir tous les champs requis.");
    }
  }

  removeAvoir(avoir: any, index: number) {
    this.removeAvoirById(avoir.facture_id, avoir.facture_num);
  }

  removeAvoirById(id: number, numero?: string) {
    Swal.fire({
      title: 'Confirmer la suppression',
      html: `Voulez-vous vraiment supprimer l'avoir <strong>${numero || 'N/A'}</strong> ?<br><br><small class="text-muted">Cette action est irréversible.</small>`,
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

        this.ventesService.RemoveAvoir(idsToDelete).subscribe({
          next: (res: any) => {
            Swal.fire({
              icon: 'success',
              title: 'Supprimé !',
              text: `L'avoir ${numero || 'N/A'} a été supprimé avec succès.`,
              confirmButtonText: 'OK',
              timer: 2000,
              timerProgressBar: true
            }).then(() => {
              this.loadAvoirs(this.currentPageAvoirs, this.searchTerm);
            });
          },
          error: (err: any) => {
            console.error('Erreur suppression avoir:', err);
            Swal.fire({
              icon: 'error',
              title: 'Erreur',
              text: `Une erreur s'est produite lors de la suppression: ${err.error?.message || err.message || 'Erreur inconnue'}`,
              confirmButtonText: 'OK'
            });
          }
        });
      }
    });
  }

  onPrintAvoir(avoir: any) {
    if (!avoir || !avoir.facture_id) {
      this.showError("❌ Impossible d'imprimer l'avoir : ID manquant.");
      return;
    }

    this.loadingAvoirs = true;
    this.emailService.generateAvoirPDF(avoir.facture_id.toString()).subscribe({
      next: (response: any) => {
        this.loadingAvoirs = false;
        if (response && response.pdfUrl) {
          window.open(response.pdfUrl, '_blank');
        } else {
          this.showError("❌ Erreur lors de la génération du PDF.");
        }
      },
      error: (err) => {
        this.loadingAvoirs = false;
        console.error('Erreur impression avoir:', err);
        this.showError("❌ Une erreur s'est produite lors de la génération du PDF.");
      }
    });
  }

  // Pagination
  onPageChangeAvoirs(page: number) {
    if (page >= 1 && page <= this.totalPagesAvoirs && page !== this.currentPageAvoirs) {
      this.currentPageAvoirs = page;
      this.loadAvoirs(page, this.searchTerm);
    }
  }

  // Tri
  sortAvoirs(column: string) {
    if (this.sortColumnAvoirs === column) {
      this.sortDirectionAvoirs = this.sortDirectionAvoirs === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumnAvoirs = column;
      this.sortDirectionAvoirs = 'DESC';
    }
    this.loadAvoirs(this.currentPageAvoirs, this.searchTerm);
  }

  // Recherche
  onSearchAvoirs() {
    this.currentPageAvoirs = 1;
    this.loadAvoirs(1, this.searchTerm);
  }

  // Filtres avancés
  toggleAdvancedFiltersAvoirs() {
    this.showAdvancedFiltersAvoirs = !this.showAdvancedFiltersAvoirs;
  }

  applyAdvancedFiltersAvoirs(avoirs: any[]): any[] {
    let filtered = [...avoirs];

    if (this.filterDateFromAvoirs) {
      filtered = filtered.filter(a => {
        const date = new Date(a.facture_dat);
        const fromDate = new Date(this.filterDateFromAvoirs);
        return date >= fromDate;
      });
    }

    if (this.filterDateToAvoirs) {
      filtered = filtered.filter(a => {
        const date = new Date(a.facture_dat);
        const toDate = new Date(this.filterDateToAvoirs);
        toDate.setHours(23, 59, 59, 999);
        return date <= toDate;
      });
    }

    if (this.filterClientAvoirs) {
      filtered = filtered.filter(a =>
        a.nom && a.nom.toLowerCase().includes(this.filterClientAvoirs.toLowerCase())
      );
    }

    return filtered;
  }

  extractClientsListAvoirs(avoirs: any[]) {
    const clientsSet = new Set<string>();
    avoirs.forEach(a => {
      if (a.nom) {
        clientsSet.add(a.nom);
      }
    });
    this.clientsListAvoirs = Array.from(clientsSet).sort();
  }

  clearAdvancedFiltersAvoirs() {
    this.filterDateFromAvoirs = '';
    this.filterDateToAvoirs = '';
    this.filterClientAvoirs = '';
    this.loadAvoirs(this.currentPageAvoirs, this.searchTerm);
  }

  getPageNumbersAvoirs(): number[] {
    const pages: number[] = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, this.currentPageAvoirs - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(this.totalPagesAvoirs, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  getDisplayRangeAvoirs(): string {
    const start = ((this.currentPageAvoirs - 1) * this.pageSizeAvoirs) + 1;
    const end = Math.min(this.currentPageAvoirs * this.pageSizeAvoirs, this.totalRecordsAvoirs);
    return `${start} à ${end}`;
  }

  // Utilitaires
  normalizeValue(value: string | null | undefined): string {
    if (!value) return '';
    return value.toString().toLowerCase().trim();
  }

  matchTerm(source: string | null | undefined, term: string | null | undefined): boolean {
    if (!source || !term) return false;
    return this.normalizeValue(source).includes(this.normalizeValue(term));
  }

  showSuccess(message: string) {
    this.successMessage = message;
    this.isError = false;
    setTimeout(() => {
      this.successMessage = null;
    }, 5000);
  }

  showError(message: string) {
    this.successMessage = message;
    this.isError = true;
    setTimeout(() => {
      this.successMessage = null;
    }, 5000);
  }
}

