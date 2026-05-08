import { AfterViewInit, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import { CaisseService } from 'src/app/service/caisse.service';
import { EmailService } from 'src/app/service/email.service';
import { PdfPermissionsService } from 'src/app/service/pdf-permissions.service';
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
  isEditMode: boolean = false;
  editingAvoirId: number | null = null;
  editingAvoirInd: number | null = null;

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
  
  // Affichage de la ligne de filtres
  showFilterRow: boolean = false;
  
  // Liste des clients pour le filtre
  clientsListAvoirs: string[] = [];

  // Filtres par colonne (style Excel) pour les avoirs
  columnFilters: any = {
    facture_num: '',
    facture_dat: '',
    nom: '',
    type: '',
    facture_ht: '',
    facture_tva: '',
    facture_ttc: '',
    traitement_paiement: ''
  };

  allAvoirs: any[] = []; // Stocker tous les avoirs pour le filtrage

  // Gestion des colonnes (affichage/masquage, épinglage, etc.)
  columnVisibility: any = {
    facture_num: true,
    facture_dat: true,
    nom: true,
    type: true,
    facture_ht: true,
    facture_tva: true,
    facture_ttc: true,
    traitement_paiement: true
  };

  pinnedColumns: string[] = [];
  readonly defaultColumnWidths: Record<string, string> = {
    facture_num: '124px',
    facture_dat: '120px',
    nom: '220px',
    type: '120px',
    facture_ht: '112px',
    facture_tva: '112px',
    facture_ttc: '112px',
    traitement_paiement: '170px'
  };
  columnWidths: any = { ...this.defaultColumnWidths };
  showColumnMenu: boolean = false;
  activeColumnMenu: string = '';
  menuPosition: any = { x: 0, y: 0 };
  resizingColumn: string | null = null;
  resizeStartX = 0;
  resizeStartWidth = 0;
  detailMode: boolean = false;
  private sidebarStateBeforeDetailMode: boolean | null = null;
  private sidebarObserver?: MutationObserver;

  // Pour avoir financier
  facturesDisponibles: any[] = [];
  selectedFacture: any = null;
  facturesCompensation: any[] = [];
  modesReglement: any[] = [];
  caissesOuvertes: any[] = [];
  paymentTreatmentEnabled: boolean = false;
  selectedFacturePaymentInfo: any = null;

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
    private caisseService: CaisseService,
    private fb: FormBuilder,
    private cdr: ChangeDetectorRef,
    private emailService: EmailService,
    public pdfPermissionsService: PdfPermissionsService
  ) { }

  ngOnInit(): void {
    this.getAvoirs();
    this.AllClients();
    this.initForm();
    this.resetFormState();
    this.loadNextAvoirNumero();
    this.loadModeReglements();
    this.loadCaissesOuvertes();
    if (this.typeAvoir === 'FINANCIER') {
      this.loadFacturesDisponibles();
    }
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
      description: [''],
      traitement_paiement: ['CREDIT_CLIENT', Validators.required],
      montant_traitement: [0],
      facture_compensation_id: [null],
      facture_compensation_ind: [null],
      reference_remboursement: [''],
      caisse_remboursement_id: [null],
      note_traitement: ['']
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
    // Ajouter un listener pour fermer le menu contextuel quand on clique ailleurs
    document.addEventListener('click', (event) => {
      if (this.showColumnMenu) {
        const target = event.target as HTMLElement;
        if (!target.closest('.column-context-menu') && !target.closest('.column-menu-btn')) {
          this.hideColumnContextMenu();
        }
      }
    });

    this.startSidebarObserver();
    this.cdr.detectChanges();
  }

  ngOnDestroy(): void {
    this.clientSearchSub?.unsubscribe();
    this.onDocumentMouseUp();
    this.sidebarObserver?.disconnect();
    if (this.detailMode && this.sidebarStateBeforeDetailMode === false) {
      this.setSidebarHidden(false);
    }
  }

  resetFormState(): void {
    this.searchTerm = '';
    this.filteredClients = [];
    this.selectedClient = null;
    this.selectedFacture = null;
    this.selectedRetour = null;
    this.facturesCompensation = [];
    this.selectedFacturePaymentInfo = null;
    this.paymentTreatmentEnabled = false;
    this.selectedClientName = '';
    this.selectedClientId = null;
  }

  prepareAddAvoir(): void {
    this.isEditMode = false;
    this.editingAvoirId = null;
    this.editingAvoirInd = null;
    this.resetFormState();
    if (this.AvoirForm) {
      this.AvoirForm.reset({
        date: new Date().toISOString().substring(0, 10),
        part_id: 0,
        clientSearch: '',
        clientDisplay: '',
        facture_id: null,
        retour_id: null,
        montant_ht: 0,
        montant_tva: 0,
        description: '',
        traitement_paiement: 'CREDIT_CLIENT',
        montant_traitement: 0,
        facture_compensation_id: null,
        facture_compensation_ind: null,
        reference_remboursement: '',
        caisse_remboursement_id: null,
        note_traitement: ''
      });
    }
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
        const avoirsData = Array.isArray(result) ? result : [];
        this.avoirs = avoirsData;
        this.allAvoirs = [...avoirsData]; // Stocker une copie pour les filtres locaux
        this.totalRecordsAvoirs = pagination.total || 0;
        this.totalPagesAvoirs = pagination.totalPages || 1;

        // Extraire la liste des clients uniques pour le filtre (depuis la page actuelle uniquement)
        this.extractClientsListAvoirs(this.avoirs);

        // Appliquer les filtres de colonne s'ils existent
        this.applyColumnFilters();

        this.loadingAvoirs = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        this.showError("❌ Une erreur s'est produite lors du chargement des avoirs.");
        this.loadingAvoirs = false;
        this.avoirs = [];
        this.allAvoirs = [];
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

  loadModeReglements(): void {
    this.ventesService.getModeReglements().subscribe({
      next: (response: any) => {
        this.modesReglement = response?.data || (Array.isArray(response) ? response : []);
      },
      error: () => {
        this.modesReglement = [];
      }
    });
  }

  loadCaissesOuvertes(): void {
    this.caisseService.getCaisseDocuments({
      page: 1,
      pageSize: 200,
      orderBy: 'date',
      orderDirection: 'DESC'
    }).subscribe({
      next: (response: any) => {
        const rows = response?.data || (Array.isArray(response) ? response : []);
        this.caissesOuvertes = (Array.isArray(rows) ? rows : []).filter((caisse: any) => this.isCaisseOuverte(caisse));
      },
      error: () => {
        this.caissesOuvertes = [];
      }
    });
  }

  isCaisseOuverte(caisse: any): boolean {
    const etat = caisse?.etat;
    return etat === null || etat === undefined || String(etat).trim() === '';
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
      }
    });
  }

  onChangeTypeAvoir(type: 'FINANCIER' | 'MARCHANDISE') {
    this.typeAvoir = type;
    this.selectedFacture = null;
    this.selectedRetour = null;
    this.facturesCompensation = [];
    this.selectedFacturePaymentInfo = null;
    this.paymentTreatmentEnabled = false;
    this.selectedClientName = '';
    this.selectedClientId = null;
    this.AvoirForm.patchValue({
      facture_id: null,
      retour_id: null,
      clientDisplay: '',
      part_id: 0,
      montant_ht: 0,
      montant_tva: 0,
      traitement_paiement: 'CREDIT_CLIENT',
      montant_traitement: 0,
      facture_compensation_id: null,
      facture_compensation_ind: null,
      reference_remboursement: '',
      caisse_remboursement_id: null,
      note_traitement: ''
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
        const factures = response.data || (Array.isArray(response) ? response : []);
        this.facturesDisponibles = (Array.isArray(factures) ? factures : []).map((facture: any) => ({
          ...facture,
          nom: facture.client || facture.nom || ''
        }));
      },
      error: (err) => {
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
        this.retoursDisponibles = [];
      }
    });
  }

  selectFacture(factureId: any) {
    const facture = this.facturesDisponibles.find(f => f.facture_id == factureId);
    if (facture) {
      this.selectedFacture = facture;

      // Le nom du client est déjà dans les données de la facture
      const clientName = facture.client || facture.nom || '';
      this.selectedClientName = clientName;

      // Récupérer le part_id et les montants depuis l'API
      this.ventesService.getFactureById(facture.facture_id).subscribe({
        next: (res: any) => {
          const factureData = res.data || res;
          const clientId = factureData?.part_id || facture?.part_id || null;
          this.selectedClientId = clientId;

          if (!clientId) {
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
              this.afterDocumentSelected(clientId);

            },
            error: (err) => {
              // Fallback sur les données de la facture si v_facture_montant échoue
              this.AvoirForm.patchValue({
                facture_id: facture.facture_id,
                montant_ht: facture.facture_ht || 0,
                montant_tva: facture.facture_tva || 0,
                clientDisplay: clientName,
                part_id: clientId || 0
              });
              this.afterDocumentSelected(clientId);

              if (!clientId) {
              }
            }
          });
        },
        error: (err) => {
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
              this.afterDocumentSelected(clientIdFromList);

              if (clientIdFromList) {
                this.selectedClientId = clientIdFromList;
              } else {
              }
            },
            error: (err2) => {
              // Utiliser les données de la facture si disponibles
              this.AvoirForm.patchValue({
                facture_id: facture.facture_id,
                montant_ht: facture.facture_ht || 0,
                montant_tva: facture.facture_tva || 0,
                clientDisplay: clientName,
                part_id: clientIdFromList || 0
              });
              this.afterDocumentSelected(clientIdFromList);

              if (clientIdFromList) {
                this.selectedClientId = clientIdFromList;
              } else {
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
      this.afterDocumentSelected(clientId);
    }
  }

  private afterDocumentSelected(clientId: number | null | undefined): void {
    this.syncPaymentAmountWithAvoir(true);
    this.setPaymentTreatmentEnabled(false);
    if (clientId) {
      this.loadFacturesCompensation(clientId);
    } else {
      this.facturesCompensation = [];
    }
  }

  private setPaymentTreatmentEnabled(enabled: boolean): void {
    this.paymentTreatmentEnabled = enabled;

    if (!enabled && this.AvoirForm) {
      this.AvoirForm.patchValue({
        traitement_paiement: 'CREDIT_CLIENT',
        facture_compensation_id: null,
        facture_compensation_ind: null,
        reference_remboursement: '',
        caisse_remboursement_id: null
      }, { emitEvent: false });
    }
  }

  private isFactureEncaissee(facture: any): boolean {
    if (!facture) {
      return false;
    }

    const reglement = Number(facture?.reglement || facture?.montant_regle || facture?.total_reglement || 0);
    const solde = Number(facture?.solde || 0);
    const montantFacture = Number(facture?.facture || facture?.total_ttc || facture?.facture_ttc || 0);

    return reglement > 0 || (montantFacture > 0 && solde <= 0);
  }

  loadFacturesCompensation(partId: number): void {
    this.ventesService.getFacturesForLettrage(partId).subscribe({
      next: (response: any) => {
        const rows = response?.data || (Array.isArray(response) ? response : []);
        const factureOrigineId = Number(this.AvoirForm.get('facture_id')?.value || 0);
        this.selectedFacturePaymentInfo = (Array.isArray(rows) ? rows : [])
          .find((facture: any) => Number(facture?.document_id || 0) === factureOrigineId) || null;
        this.setPaymentTreatmentEnabled(this.isFactureEncaissee(this.selectedFacturePaymentInfo));

        this.facturesCompensation = (Array.isArray(rows) ? rows : [])
          .filter((facture: any) => Number(facture?.solde || 0) > 0)
          .filter((facture: any) => Number(facture?.document_id || 0) !== factureOrigineId)
          .map((facture: any) => ({
            ...facture,
            facture_ind: facture.facture_ind || 1
          }));

        this.cdr.detectChanges();
      },
      error: () => {
        this.facturesCompensation = [];
        this.selectedFacturePaymentInfo = null;
        this.setPaymentTreatmentEnabled(false);
      }
    });
  }

  getAvoirTtc(): number {
    const ht = Number(this.AvoirForm.get('montant_ht')?.value || 0);
    const tva = Number(this.AvoirForm.get('montant_tva')?.value || 0);
    return ht + tva;
  }

  syncPaymentAmountWithAvoir(force: boolean = false): void {
    const currentAmount = Number(this.AvoirForm.get('montant_traitement')?.value || 0);
    if (force || currentAmount <= 0) {
      this.AvoirForm.patchValue({
        montant_traitement: this.getAvoirTtc()
      }, { emitEvent: false });
    }
  }

  onTraitementPaiementChange(action: 'CREDIT_CLIENT' | 'REMBOURSEMENT' | 'COMPENSATION'): void {
    if (!this.paymentTreatmentEnabled && action !== 'CREDIT_CLIENT') {
      this.AvoirForm.patchValue({
        traitement_paiement: 'CREDIT_CLIENT'
      }, { emitEvent: false });
      return;
    }

    this.AvoirForm.patchValue({
      traitement_paiement: action
    }, { emitEvent: false });
    this.syncPaymentAmountWithAvoir();

    if (action !== 'COMPENSATION') {
      this.AvoirForm.patchValue({
        facture_compensation_id: null,
        facture_compensation_ind: null
      }, { emitEvent: false });
    }

    if (action !== 'REMBOURSEMENT') {
      this.AvoirForm.patchValue({
        reference_remboursement: '',
        caisse_remboursement_id: null
      }, { emitEvent: false });
    }

    if (action === 'REMBOURSEMENT') {
      if (this.modesReglement.length === 0) {
        this.loadModeReglements();
      }
      if (this.caissesOuvertes.length === 0) {
        this.loadCaissesOuvertes();
      }
    }
  }

  onFactureCompensationChange(factureId: any): void {
    const selectedFacture = this.facturesCompensation.find((facture: any) => facture.document_id == factureId);
    this.AvoirForm.patchValue({
      facture_compensation_ind: selectedFacture?.facture_ind || 1
    }, { emitEvent: false });
  }

  getPaymentTreatmentLabel(action: string): string {
    switch (action) {
      case 'REMBOURSEMENT':
        return 'Remboursement';
      case 'COMPENSATION':
        return 'Compensation';
      case 'CREDIT_CLIENT':
      default:
        return 'Credit client';
    }
  }

  getPaymentStatusLabel(status: string): string {
    switch (status) {
      case 'A_REMBOURSER':
        return 'A rembourser';
      case 'A_COMPENSER':
        return 'A compenser';
      case 'CREDIT_OUVERT':
      default:
        return 'Credit ouvert';
    }
  }

  getPaymentBadgeClass(action: string): string {
    switch (action) {
      case 'REMBOURSEMENT':
        return 'bg-danger';
      case 'COMPENSATION':
        return 'bg-warning text-dark';
      case 'CREDIT_CLIENT':
      default:
        return 'bg-info';
    }
  }

  onSubmit(): void {
    if (this.shouldUseAvoirTreatmentSubmit()) {
      this.onSubmitAvoirWithTreatment();
      return;
    }

    if (this.AvoirForm.valid) {
      const formValue = {
        ...this.AvoirForm.value
      };
      const traitementPaiement = formValue.traitement_paiement || 'CREDIT_CLIENT';
      const montantTraitement = Number(formValue.montant_traitement || this.getAvoirTtc() || 0);

      if ((traitementPaiement === 'REMBOURSEMENT' || traitementPaiement === 'COMPENSATION') && montantTraitement <= 0) {
        this.showError('Le montant du traitement du paiement doit etre superieur a zero.');
        return;
      }

      if (traitementPaiement === 'COMPENSATION' && !formValue.facture_compensation_id) {
        this.showError('Veuillez selectionner la facture sur laquelle imputer l avoir.');
        return;
      }

      const selectedCompensation = this.facturesCompensation.find((facture: any) => facture.document_id == formValue.facture_compensation_id);
      formValue.traitement_paiement = traitementPaiement;
      formValue.montant_traitement = montantTraitement;
      formValue.facture_compensation_ind = selectedCompensation?.facture_ind || formValue.facture_compensation_ind || null;

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
          this.showError(`❌ Une erreur s'est produite lors de la création de l'avoir: ${err.error?.message || err.message || 'Erreur inconnue'}`);
        }
      });
    } else {
      this.showError("❗ Le formulaire est invalide. Veuillez remplir tous les champs requis.");
    }
  }

  private shouldUseAvoirTreatmentSubmit(): boolean {
    return true;
  }

  private onSubmitAvoirWithTreatment(): void {
    if (!this.AvoirForm.valid) {
      this.showError("Le formulaire est invalide. Veuillez remplir tous les champs requis.");
      return;
    }

    if (this.isEditMode && this.editingAvoirId) {
      this.submitAvoirUpdate();
      return;
    }

    const formValue = this.buildAvoirPayload();
    if (!formValue) {
      return;
    }

    if (formValue.traitement_paiement === 'REMBOURSEMENT' || formValue.traitement_paiement === 'COMPENSATION') {
      this.confirmAndSubmitAvoir(formValue);
      return;
    }

    this.submitAvoirPayload(formValue);
  }

  private buildAvoirPayload(): any | null {
    const formValue = {
      ...this.AvoirForm.value
    };

    let traitementPaiement = formValue.traitement_paiement || 'CREDIT_CLIENT';
    if (!this.paymentTreatmentEnabled) {
      traitementPaiement = 'CREDIT_CLIENT';
    }

    const montantTraitement = Number(formValue.montant_traitement || this.getAvoirTtc() || 0);

    if ((traitementPaiement === 'REMBOURSEMENT' || traitementPaiement === 'COMPENSATION') && montantTraitement <= 0) {
      this.showError('Le montant du traitement du paiement doit etre superieur a zero.');
      return null;
    }

    if (traitementPaiement === 'REMBOURSEMENT') {
      if (!formValue.reference_remboursement) {
        this.showError('Veuillez selectionner le mode de remboursement.');
        return null;
      }

      if (!formValue.caisse_remboursement_id) {
        this.showError('Veuillez selectionner la caisse de remboursement.');
        return null;
      }

      formValue.mode_reglement_id = Number(formValue.reference_remboursement);
    }

    if (traitementPaiement === 'COMPENSATION' && !formValue.facture_compensation_id) {
      this.showError('Veuillez selectionner la facture sur laquelle imputer l avoir.');
      return null;
    }

    const selectedCompensation = this.facturesCompensation.find((facture: any) => facture.document_id == formValue.facture_compensation_id);
    formValue.traitement_paiement = traitementPaiement;
    formValue.montant_traitement = montantTraitement;
    formValue.facture_compensation_ind = selectedCompensation?.facture_ind || formValue.facture_compensation_ind || null;

    if (this.typeAvoir === 'FINANCIER') {
      const partId = formValue.part_id || this.selectedClientId || this.selectedFacture?.part_id || null;

      if (!partId || partId === 0) {
        this.showError('Le client (part_id) est requis pour creer un avoir financier. Veuillez selectionner une facture valide.');
        return null;
      }

      formValue.part_id = partId;
    }

    return formValue;
  }

  private confirmAndSubmitAvoir(formValue: any): void {
    const isRefund = formValue.traitement_paiement === 'REMBOURSEMENT';
    Swal.fire({
      title: isRefund ? 'Confirmer le remboursement' : 'Confirmer la compensation',
      html: isRefund
        ? 'Confirmer la creation de l avoir et de la ligne de depense dans la caisse selectionnee ?'
        : 'Confirmer la creation de l avoir et la compensation de la facture selectionnee ?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Oui, confirmer',
      cancelButtonText: 'Annuler',
      confirmButtonColor: isRefund ? '#dc3545' : '#f0ad4e',
      cancelButtonColor: '#6c757d',
      reverseButtons: true
    }).then((result) => {
      if (result.isConfirmed) {
        this.submitAvoirPayload(formValue);
      }
    });
  }

  private submitAvoirPayload(formValue: any): void {
    const serviceCall = this.typeAvoir === 'FINANCIER'
      ? this.ventesService.addAvoirFinancier(formValue)
      : this.ventesService.addAvoirMarchandise(formValue);

    serviceCall.subscribe({
      next: (response: any) => {
        this.showSuccess(`Avoir ${response.facture_num || ''} cree avec succes !`);
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
        this.loadCaissesOuvertes();
      },
      error: (err) => {
        this.showError(`Une erreur s'est produite lors de la creation de l'avoir: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  onEditAvoir(avoir: any): void {
    const avoirId = Number(avoir?.facture_id || 0);
    if (!avoirId) {
      this.showError("Impossible de modifier l'avoir : ID manquant.");
      return;
    }

    this.ventesService.getAvoirById(avoirId).subscribe({
      next: (response: any) => {
        const data = response?.data || response || avoir;
        this.isEditMode = true;
        this.editingAvoirId = avoirId;
        this.editingAvoirInd = Number(data?.facture_ind || avoir?.facture_ind || 0) || null;
        this.typeAvoir = data?.type_avoir === 'MARCHANDISE' ? 'MARCHANDISE' : 'FINANCIER';
        this.selectedClientName = data?.client || data?.client_nom || data?.nom || avoir?.nom || '';
        this.selectedClientId = data?.part_id || null;
        this.selectedFacture = this.typeAvoir === 'FINANCIER' ? data : null;
        this.selectedRetour = this.typeAvoir === 'MARCHANDISE' ? data : null;
        this.paymentTreatmentEnabled = true;

        this.AvoirForm.patchValue({
          date: this.toDateInput(data?.facture_dat || data?.date || avoir?.facture_dat),
          part_id: data?.part_id || 0,
          clientDisplay: this.selectedClientName,
          facture_id: this.typeAvoir === 'FINANCIER' ? avoirId : null,
          retour_id: data?.retour_id || null,
          montant_ht: Number(data?.facture_ht ?? avoir?.facture_ht ?? 0),
          montant_tva: Number(data?.facture_tva ?? avoir?.facture_tva ?? 0),
          description: data?.description || '',
          traitement_paiement: data?.traitement_paiement || avoir?.traitement_paiement || 'CREDIT_CLIENT',
          montant_traitement: Number(data?.montant_traitement ?? avoir?.montant_traitement ?? 0),
          facture_compensation_id: data?.facture_compensation_id || null,
          facture_compensation_ind: data?.facture_compensation_ind || null,
          reference_remboursement: data?.mode_reglement_id || data?.reference_remboursement || '',
          caisse_remboursement_id: data?.caisse_document_id || null,
          note_traitement: data?.note_traitement || ''
        }, { emitEvent: false });

        const modal = document.getElementById('addAvoirModal');
        if (modal) {
          const bsModal = (window as any).bootstrap?.Modal?.getOrCreateInstance(modal);
          bsModal?.show();
        }
      },
      error: (err) => {
        this.showError(`Impossible de charger l'avoir: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  private submitAvoirUpdate(): void {
    if (!this.editingAvoirId) {
      return;
    }

    const rawValue = this.AvoirForm.getRawValue();
    const payload = {
      date: rawValue.date,
      facture_ind: this.editingAvoirInd,
      montant_ht: Number(rawValue.montant_ht || 0),
      montant_tva: Number(rawValue.montant_tva || 0),
      description: rawValue.description || null
    };

    this.ventesService.updateAvoir(this.editingAvoirId, payload).subscribe({
      next: () => {
        this.showSuccess('Avoir modifie avec succes !');
        const modal = document.getElementById('addAvoirModal');
        if (modal) {
          const bsModal = (window as any).bootstrap?.Modal?.getInstance(modal);
          bsModal?.hide();
        }
        this.prepareAddAvoir();
        this.loadAvoirs(this.currentPageAvoirs, this.searchTerm);
      },
      error: (err) => {
        this.showError(`Une erreur s'est produite lors de la modification: ${err.error?.message || err.message || 'Erreur inconnue'}`);
      }
    });
  }

  private toDateInput(value: any): string {
    if (!value) {
      return new Date().toISOString().substring(0, 10);
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return new Date().toISOString().substring(0, 10);
    }

    return date.toISOString().substring(0, 10);
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

  // ===== FILTRES PAR COLONNE (STYLE EXCEL) =====
  onColumnFilterChange(column: string, value: string): void {
    this.columnFilters[column] = value;
    this.applyColumnFilters();
  }

  applyColumnFilters(): void {
    this.avoirs = this.allAvoirs.filter(item => {
      return Object.keys(this.columnFilters).every(key => {
        const filterValue = this.columnFilters[key];
        if (!filterValue) return true;
        
        const itemValue = item[key];
        if (itemValue === null || itemValue === undefined) return false;
        
        return itemValue.toString().toLowerCase().includes(filterValue.toLowerCase());
      });
    });
    
    this.totalRecordsAvoirs = this.avoirs.length;
    this.cdr.detectChanges();
  }

  clearColumnFilters(): void {
    this.columnFilters = {
      facture_num: '',
      facture_dat: '',
      nom: '',
      type: '',
      facture_ht: '',
      facture_tva: '',
      facture_ttc: '',
      traitement_paiement: ''
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
      facture_num: true,
      facture_dat: true,
      nom: true,
      type: true,
      facture_ht: true,
      facture_tva: true,
      facture_ttc: true,
      traitement_paiement: true
    };
    this.pinnedColumns = [];
    this.columnWidths = { ...this.defaultColumnWidths };
    this.hideColumnContextMenu();
  }

  getColumnWidth(column: string): string {
    return this.columnWidths[column] || this.defaultColumnWidths[column] || 'auto';
  }

  getColumnIndex(column: string): number {
    const columns = Object.keys(this.columnVisibility);
    return columns.indexOf(column);
  }

  getColumnDisplayName(column: string): string {
    const names: any = {
      facture_num: 'Numéro',
      facture_dat: 'Date',
      nom: 'Client',
      type: 'Type',
      facture_ht: 'Total HT',
      facture_tva: 'Total TVA',
      facture_ttc: 'Total TTC',
      traitement_paiement: 'Traitement'
    };
    return names[column] || column;
  }

  getAllColumns(): string[] {
    return Object.keys(this.columnVisibility);
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

  startColumnResize(event: MouseEvent, column: string, headerEl: HTMLElement): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizingColumn = column;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = headerEl?.offsetWidth || parseInt(String(this.getColumnWidth(column) || ''), 10) || 220;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.resizingColumn) {
      return;
    }

    const delta = event.clientX - this.resizeStartX;
    const minByColumn: any = {
      nom: 150
    };
    const maxByColumn: any = {
      nom: 560
    };
    const minWidth = minByColumn[this.resizingColumn] ?? 90;
    const maxWidth = maxByColumn[this.resizingColumn] ?? 600;
    const nextWidth = Math.max(minWidth, Math.min(maxWidth, this.resizeStartWidth + delta));
    this.columnWidths[this.resizingColumn] = `${nextWidth}px`;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    if (!this.resizingColumn) {
      return;
    }

    this.resizingColumn = null;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  toggleDetailMode(): void {
    if (!this.detailMode) {
      this.sidebarStateBeforeDetailMode = this.isSidebarHidden();
    }

    this.detailMode = !this.detailMode;
    this.applyDetailMode();
  }

  private applyDetailMode(): void {
    if (this.detailMode) {
      this.setSidebarHidden(true);
      return;
    }

    if (this.sidebarStateBeforeDetailMode === false) {
      this.setSidebarHidden(false);
    }
    this.sidebarStateBeforeDetailMode = null;
  }

  private isSidebarHidden(): boolean {
    return !!document.querySelector('.wrapper.sidebar-hidden-desktop');
  }

  private setSidebarHidden(hidden: boolean): void {
    const currentlyHidden = this.isSidebarHidden();
    if (currentlyHidden === hidden) {
      return;
    }

    const selector = hidden ? '.toggle-sidebar' : '.btn-sidebar-toggle-float, .toggle-sidebar';
    const toggleButton = document.querySelector(selector) as HTMLElement | null;
    toggleButton?.click();
  }

  private startSidebarObserver(): void {
    const wrapper = document.querySelector('.wrapper');
    if (!wrapper) {
      return;
    }

    this.sidebarObserver?.disconnect();
    this.sidebarObserver = new MutationObserver(() => {
      if (this.detailMode && !this.isSidebarHidden()) {
        this.detailMode = false;
        this.applyDetailMode();
        this.cdr.detectChanges();
      }
    });

    this.sidebarObserver.observe(wrapper, {
      attributes: true,
      attributeFilter: ['class']
    });
  }
}

