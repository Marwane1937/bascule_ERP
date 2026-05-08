import { ChangeDetectorRef, Component, HostListener, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import Quill from 'quill';
import Swal from 'sweetalert2';
import { EmailService } from 'src/app/service/email.service';
import { PdfPermissionsService } from 'src/app/service/pdf-permissions.service';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, retry, switchMap } from 'rxjs/operators';
const QuillMention = require('quill-mention');
declare var bootstrap: any;
Quill.register('modules/mention', QuillMention.default); // ajoute .default ici

interface LivraisonNomenclatureNode {
  article_id: number;
  code: string;
  designation: string;
  quantite: number;
  quantiteTotale: number;
  prix: number;
  total: number;
  famille: string;
  unite: string;
  poidsStandard: number | null;
  poidsReel: number | null;
  children: LivraisonNomenclatureNode[];
}

@Component({
  selector: 'app-editlivraison',
  templateUrl: './editlivraison.component.html',
  styleUrls: ['./editlivraison.component.css']
})
export class EditlivraisonComponent implements OnInit {
  produits1: any[] = [];
  produitsNomenclature: any[] = [];
  pageLoading = false;
  saveProduitsLoading = false;
  lotsSaving = false;
  lotsDirty = false;
  editFacturation = false;
  mode: 'editor' | 'table' = 'table'; // OK mode TABLE par d?faut
  ligneSelectionnee: number | null = null; // OK ligne actuellement s?lectionn?e pour ?dition
  modules: any = {}; // Quill modules ici
  editInfos = false;
  LivraisonForm!: FormGroup;
  clients: any;
  filteredClients: any[] = [];
  searchTerm = '';
  searchCommercial = '';
  commerciaux: any[] = [];
  filteredCommerciaux: any[] = [];
  depots: any[] = [];
  selectedCommercial: any = null;
  produitsOriginal: any[] = [];
  reductionMode: 'percent' | 'amount' = 'percent'; // Valeur par d?faut
  reducMode: 'pourcentage' | 'montant' = 'pourcentage';
  produitsSupprimes: number[] = [];
  successMessage: string | null = null;
  isError: boolean = false;
  emailForm: FormGroup;
  info: any;
  condition: any;
  isSending: boolean = false;
  numeroLivraison: string = 'LV25-0001'; // Num?ro par d?faut
  detailsColumnWidth = '420px';
  private resizingDetailsColumn = false;
  private detailsResizeStartX = 0;
  private detailsResizeStartWidth = 460;

  livraison = {
    client: 'Nom du client',
    commercial: 'Nom du commercial',
    adresse: 'Adresse du client',
    date: new Date().toISOString().substring(0, 10), // format yyyy-MM-dd pour input date
    description: 'Description de la livraison',
    depot_nom: ''
  };

  produits: any[] = [{
    id: 0,
    ligne: 1,
    designation: '',
    article_id: 0,
    pu: 0,
    qte: 1,
    reduc: 0,
    taxe: 0.2,
    total: 0,
    reducMode: 'montant',
    articleSearch: '',
    depot_id: null as number | null,
    stock_disponible: null as number | null,
    nomenclatureOnly: false,
    isNomenclature: false,
    nomenclatureComponents: [] as LivraisonNomenclatureNode[],
    nomenclatureLoading: false,
    nomenclatureError: '',
    nomenclatureTotal: 0
  }]
  lotDetails: any[] = [];
  lotDetailsOriginal: any[] = [];
  activeProductTab: 'produits' | 'lots' = 'produits';
  compositionDeletedRows: any[] = [];
  compositionRows: any[] = [];
  compositionEditorHtml = '';
  compositionDragContext: { index: number } | null = null;
  compositionInputFocused = false;
  compositionEditorTouched = false;

  filteredArticles: { [key: number]: any[] } = {}; // Liste filtr?e d'articles par index de ligne
  highlightedArticleIndex: { [key: number]: number } = {};

  selectedInfo = {
    document_id: this.route.snapshot.paramMap.get('document_id')!,
    date: '2024-12-31',
    condition: '30 jours',
    expedition: 'Transport interne',
    transporteur: 'Inconnu'
  };

  conditions: string[] = [
    '30 jours',
    '60 jours',
    '90 jours',
    '120 jours',
    'Virement'
  ];

  expeditions: string[] = [
    'Transport interne',
    'Transport externe',
    'Livraison express'
  ];

  transporteurs: string[] = [
    'Inconnu', 'Amana', 'ARAMEX', 'Barid Al-Maghrib', 'Cathedis', 'Chronopost', 'Colis Priv?',
    'DHL', 'FedEx', 'GLS', 'Jumia Logistics', 'La Voie Express', 'Maroc Express',
    'Mondial Relay', 'TNT', 'UPS', 'Yamato Transport'
  ].sort();

  fraisPort = 0;
  sousTotal = 0;
  taxeTotal = 0;
  reducTotal = 0;
  totalGeneral = 0;
  isClientExonerated = false; // m?me logique que edit-devis / edit-commande
  private exoCheckToken = 0;
  private produitsLoadingPromise: Promise<void> | null = null;
  private clientsLoadingPromise: Promise<void> | null = null;
  private commerciauxLoadingPromise: Promise<void> | null = null;
  private depotsLoadingPromise: Promise<void> | null = null;
  private produitsNomenclatureLoadingPromise: Promise<void> | null = null;

  constructor(private baseService: BaseService, private fb: FormBuilder, private route: ActivatedRoute,
    private venteSerivce: VentesService, private emailService: EmailService,
    private cdr: ChangeDetectorRef, public pdfPermissionsService: PdfPermissionsService
  ) {
    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      cc: [''],
      subject: ['Livraison ? votre attention'],
      body: ['Bonjour,\n\nVeuillez trouver ci-joint le bon de livraison demand?.\n\nCordialement,']
    });
  }

  ngOnInit(): void {
    this.modules = {};
    this.initForm();

      const id = +this.route.snapshot.paramMap.get('document_id')!;
    this.pageLoading = true;

    // Charger d'abord la livraison pour afficher la page sans attendre les listes volumineuses.
    this.venteSerivce.getLivraisonById(id).subscribe({
      next: (livraison) => {
        this.processLivraisonData(livraison);
        this.pageLoading = false;
        this.preloadReferenceData();
      },
      error: (err) => {
        this.pageLoading = false;
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors du chargement des données.' });
      }
    });

    // Abonnements sur les changements de texte
    this.LivraisonForm.get('clientSearch')?.valueChanges.subscribe(value => {
      this.searchTerm = value || '';
      this.onSearchChange(value);
    });

    this.LivraisonForm.get('commercialSearch')?.valueChanges.subscribe(value => {
      this.searchCommercial = value || '';
      this.onCommercialSearchChange(value);
    });

    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      cc: [''],
      subject: ['', Validators.required],
      body: ['', Validators.required]
    });
  }

  private preloadReferenceData(): void {
    const produitsPromise = this.AllProduits().catch(() => undefined);
    const nomenclaturePromise = this.AllProduitsNomenclature().catch(() => undefined);
    void Promise.all([produitsPromise, nomenclaturePromise]).then(() => this.refreshNomenclatureDisplays());
    void this.AllClients().catch(() => undefined);
    void this.AllCommerciaux().catch(() => undefined);
    void this.loadDepots().catch(() => undefined);
  }

  // Traitement des donn?es de livraison apr?s chargement parall?le
  private processLivraisonData(response: any): void {
    const data = response?.data || response;

    if (!data) {
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'Livraison introuvable.',
      });
      return;
    }

    this.numeroLivraison = data.numero || 'LV25-0001';

    const clientTrouve = this.clients?.find((c: any) => +c.part_id === +data.part_id);
    const commercialTrouve = this.commerciaux?.find((c: any) => +c.id === +data.contact_id);
    const clientDisplayName = clientTrouve?.nom || data.client || data.client_nom || '';
    const commercialDisplayName = commercialTrouve?.nom || data.commercial || data.commercial_nom || '';

    this.LivraisonForm.patchValue({
      date: data.date ? data.date.substring(0, 10) : '',
      description: data.description || '',
      part_id: data.part_id,
      contact_id: data.contact_id,
      depot_id: this.normalizeDepotId(data.depot_id ?? data.adresse_id),
      clientSearch: clientDisplayName,
      commercialSearch: commercialDisplayName
    });

    this.livraison = {
      ...this.livraison,
      client: clientDisplayName || this.livraison.client,
      commercial: commercialDisplayName || this.livraison.commercial,
      adresse: data?.clientInfo?.adresse || this.livraison.adresse,
      date: data.date || this.livraison.date,
      description: data.description || '',
      depot_nom: data.depot_nom || data.depot || this.livraison.depot_nom
    };

    // V?rifier l'exon?ration TVA au chargement (m?me que edit-devis)
    if (data.part_id) {
      this.checkClientExoneration(+data.part_id);
    } else {
      this.isClientExonerated = false;
    }

    // Traitement des d?tails
    if (!data.details || !Array.isArray(data.details)) {
      this.produits = [];
    } else {
      const mappedProduits = data.details.map((d: any, index: number) => {
        let reducMode: 'pourcentage' | 'montant' = 'pourcentage';
        let reducValue = 0;

        if (d.remise_montant != null && d.remise_montant !== 0) {
          reducMode = 'montant';
          reducValue = Number(d.remise_montant);
        } else if (d.remise != null && d.remise !== 0) {
          reducMode = 'pourcentage';
          reducValue = Number(d.remise) * 100;
        }

        const articleTrouve = this.produits1.find((a: any) => +a.article_id === +d.article_id);
        const produitNomenclatureTrouve = this.produitsNomenclature.find((a: any) => +a.article_id === +d.article_id);
        const pu = this.normalizePriceValue(d.prix ?? d.pu ?? 0);
        const qte = this.normalizeQuantityValue(d.quantite ?? d.qte ?? 1);

        return {
          id: d.id,
          ligne: Number(d.ligne || 0) || (index + 1),
          article_id: d.article_id,
          articleSearch: articleTrouve?.article_nom || produitNomenclatureTrouve?.article_nom || d.article_nom || d.designation || '',
          designation: d.designation || '',
          pu,
          qte,
          reduc: reducValue,
          reducMode: reducMode,
          taxe: this.normalizeTaxeValue(d.tva ?? 0.2),
          total: d.total || (pu * qte),
          type: Number(d.type ?? d.ligne_type ?? d.detail_type ?? 0) || 0,
          depot_id: this.normalizeDepotId(d.depot_id ?? d.adresse_id ?? data.depot_id ?? data.adresse_id),
          nomenclatureOnly: !!produitNomenclatureTrouve,
          isNomenclature: !!produitNomenclatureTrouve,
          nomenclatureComponents: [] as LivraisonNomenclatureNode[],
          nomenclatureLoading: false,
          nomenclatureError: '',
          nomenclatureTotal: 0,
          nomenclatureFromPersistedRows: false
        };
      });
      this.produits = this.attachPersistedNomenclatureRows(mappedProduits);
    }
    this.initializeCompositionState(Array.isArray(data.compositions) ? data.compositions : []);
    this.resetLotDetails(Array.isArray(data.lot_details) ? data.lot_details : []);

    // Traitement des infos client
    if (!data.Infos || !Array.isArray(data.Infos) || data.Infos.length === 0) {
      this.info = {
        nom: clientTrouve?.nom || '',
        adresse: '',
        telephone: '',
        email: '',
        ice: ''
      };
    } else {
      this.info = {
        nom: data.Infos[0].nom || '',
        adresse: data.Infos[0].adresse || '',
        telephone: data.Infos[0].telephone || '',
        email: data.Infos[0].email || '',
        ice: data.Infos[0].ice || ''
      };
    }

    // Traitement des conditions
    if (!data.condition || !Array.isArray(data.condition) || data.condition.length === 0) {
      this.selectedInfo = {
        document_id: data?.document_id?.toString() || '',
        date: data?.date || '',
        condition: '',
        expedition: '',
        transporteur: ''
      };
    } else {
      this.selectedInfo = {
        document_id: data.condition[0].document_id?.toString() || data?.document_id?.toString() || '',
        date: data.condition[0].date || data?.date || '',
        condition: data.condition[0].condition || data.condition[0].paiement || '',
        expedition: data.condition[0].expedition || data.condition[0].livraison || '',
        transporteur: data.condition[0].transporteur || ''
      };
    }

    this.applyHeaderDepotToLines(false);
    this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
    this.produits.forEach((_, i) => this.recalculateTotal(i));
    this.refreshNomenclatureDisplays();
  }

  private normalizeValue(value: string | null | undefined): string {
    if (!value) {
      return '';
    }
    return value
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
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

  initForm(): void {
    this.LivraisonForm = this.fb.group({
      date: ['', Validators.required],
      description: [''],
      part_id: [0],
      contact_id: [0],
      depot_id: [null, Validators.required],
      date_fin: [''],
      etat: [1],

      clientSearch: [''],   // le texte visible pour client
      commercialSearch: [''] // le texte visible pour commercial
    });
  }
  loadLivraisonById(id: number) {
    this.pageLoading = true;
    this.venteSerivce.getLivraisonById(id).subscribe({
      next: (response) => {
        // G?rer le format de r?ponse (peut ?tre { success: true, data: {...} } ou directement l'objet)
        const data = response?.data || response;

        if (!data) {
          this.pageLoading = false;
          Swal.fire({
            icon: 'error',
            title: 'Erreur',
            text: 'Aucune donnée reçue pour cette livraison'
          });
          return;
        }

        this.numeroLivraison = data?.numero || data?.stockNumero || data?.documentNumero || 'LV25-0001';

        this.LivraisonForm.patchValue({
          date: data?.date || '',
          description: data?.description || '',
          part_id: data?.part_id || 0,
          contact_id: data?.contact_id || 0,
          clientSearch: '',
          commercialSearch: ''
        }, { emitEvent: false });

        const waitForClients = () => {
          if ((!Array.isArray(this.clients) || this.clients.length === 0) ||
            (!Array.isArray(this.commerciaux) || this.commerciaux.length === 0)) {
            setTimeout(waitForClients, 100);
            return;
          }

          const dataPartId = data?.part_id != null ? Number(data.part_id) : null;
          const dataContactId = data?.contact_id != null ? Number(data.contact_id) : null;

          const clientTrouve = this.clients.find((c: any) => {
            if (!c) return false;
            const clientPartId = c.part_id != null ? Number(c.part_id) : null;
            return clientPartId !== null && dataPartId !== null && clientPartId === dataPartId;
          });

          const commercialTrouve = this.commerciaux.find((c: any) => {
            if (!c) return false;
            const commercialId = c.id != null ? Number(c.id) : null;
            return commercialId !== null && dataContactId !== null && commercialId === dataContactId;
          });

          const clientNom = clientTrouve?.nom || data.client || data.client_nom || '';
          const commercialNom = commercialTrouve?.nom || data.commercial || data.commercial_nom || '';

          this.livraison = {
            client: clientNom || 'Client inconnu',
            commercial: commercialNom || 'Commercial inconnu',
            adresse: clientTrouve?.adresse || data.clientInfo?.adresse || '',
            date: data.date,
            description: data.description || '',
            depot_nom: data.depot_nom || data.depot || ''
          };

          this.LivraisonForm.patchValue({
            clientSearch: clientNom,
            commercialSearch: commercialNom,
            part_id: clientTrouve?.part_id ?? data.part_id ?? 0,
            contact_id: commercialTrouve?.id ?? data.contact_id ?? 0,
            depot_id: this.normalizeDepotId(data?.depot_id ?? data?.adresse_id)
          }, { emitEvent: false });
        };

        waitForClients();

        const detailsArray = Array.isArray(data?.details) ? data.details : [];
        this.resetLotDetails(Array.isArray(data?.lot_details) ? data.lot_details : []);

        this.produits = detailsArray.map((detail: any, index: number) => {
          const articleId = detail.article_id != null ? Number(detail.article_id) : 0;

          // S'assurer que produits1 est charg? avant de chercher
          const produitTrouve = Array.isArray(this.produits1) && this.produits1.length > 0
            ? this.produits1.find(p => Number(p.article_id) === articleId)
            : null;
          const produitNomenclatureTrouve = Array.isArray(this.produitsNomenclature) && this.produitsNomenclature.length > 0
            ? this.produitsNomenclature.find(p => Number(p.article_id) === articleId)
            : null;

          let reduc = 0;
          let reducMode = 'montant';

          // V?rifier d'abord si remise_montant existe (priorit? au montant) - comme editCommande
          // Note: remise_montant peut ?tre 0, donc on v?rifie !== null et !== undefined
          if (detail.remise_montant != null && detail.remise_montant !== undefined) {
            reduc = +detail.remise_montant;
            reducMode = 'montant';
          } else if (detail.remise != null && detail.remise !== undefined) {
            // remise est un pourcentage d?cimal (0.1 = 10%), on le convertit en pourcentage (10)
            // Note: remise peut ?tre 0, donc on v?rifie !== null et !== undefined
            reduc = +detail.remise * 100; // Ex. 0.1 => 10%
            reducMode = 'pourcentage';
          }

          const taxe = this.normalizeTaxeValue(detail.taux_tva ?? detail.tva ?? produitTrouve?.taxe ?? 0.2);
          const pu = detail.pu ?? detail.prix ?? produitTrouve?.pu ?? 0;
          const qte = detail.qte ?? detail.quantite ?? 1;
          const designation = detail.designation || detail.description || produitTrouve?.article_nom || '';

          return {
            id: detail.id ?? detail.detail_id ?? 0,
            ligne: Number(detail.ligne || 0) || (index + 1),
            article_id: articleId,
            designation,
            pu: +pu,
            qte: +qte,
            reduc: +reduc,
            reducMode: reducMode,
            taxe: this.normalizeTaxeValue(taxe),
            total: 0,
            articleSearch: produitTrouve?.article_nom || produitNomenclatureTrouve?.article_nom || designation || '',
            depot_id: this.normalizeDepotId(detail.depot_id ?? detail.adresse_id ?? data?.depot_id ?? data?.adresse_id),
            nomenclatureOnly: !!produitNomenclatureTrouve,
            isNomenclature: !!produitNomenclatureTrouve,
            nomenclatureComponents: [] as LivraisonNomenclatureNode[],
            nomenclatureLoading: false,
            nomenclatureError: '',
            nomenclatureTotal: 0
          };
        });

        if (this.produits.length === 0) {
          this.produits = [{
            id: 0,
            ligne: 1,
            designation: '',
            article_id: 0,
            pu: 0,
            qte: 1,
            reduc: 0,
            taxe: this.normalizeTaxeValue(0.2),
            total: 0,
            reducMode: 'montant',
            articleSearch: '',
            depot_id: this.normalizeDepotId(data?.depot_id ?? data?.adresse_id),
            nomenclatureOnly: false,
            isNomenclature: false,
            nomenclatureComponents: [] as LivraisonNomenclatureNode[],
            nomenclatureLoading: false,
            nomenclatureError: '',
            nomenclatureTotal: 0
          }];
        }
        this.initializeCompositionState(Array.isArray(data?.compositions) ? data.compositions : []);

        this.info = {
          nom: data?.clientInfo?.nom || data?.client || data?.client_nom || '',
          adresse: data?.clientInfo?.adresse || '',
          telephone: data?.clientInfo?.telephone || '',
          email: data?.clientInfo?.email || '',
          ice: data?.clientInfo?.ice || ''
        };

        this.selectedInfo = {
          document_id: data?.document_id || data?.id || id.toString(),
          date: data?.date || '',
          condition: data?.condition || data?.condition_reglement || '',
          expedition: data?.expedition || '',
          transporteur: data?.transporteur || ''
        };

        this.applyHeaderDepotToLines(false);
        this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
        this.produits.forEach((_, i) => this.recalculateTotal(i));
        this.refreshNomenclatureDisplays();
        this.calculerTotaux();
        this.pageLoading = false;
      },
      error: (err) => {
        this.pageLoading = false;
        let errorMessage = 'Erreur lors du chargement de la livraison';
        if (err.status === 404) {
          errorMessage = 'Livraison non trouvée';
        } else if (err.status === 500) {
          errorMessage = err.error?.message || 'Erreur serveur lors du chargement de la livraison';
        } else if (err.error?.message) {
          errorMessage = err.error.message;
        }

        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: errorMessage,
          confirmButtonText: 'OK'
        });
      }
    });
  }

  toggleEdit(): void {
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    if (!this.editInfos) {
      this.editInfos = true;
      this.preloadReferenceData();
      return;
    }

    const depotId = this.normalizeDepotId(this.LivraisonForm.value?.depot_id);
    if (!depotId) {
      this.LivraisonForm.get('depot_id')?.markAsTouched();
      Swal.fire({
        icon: 'warning',
        title: 'Depot obligatoire',
        text: 'Veuillez selectionner un depot avant de valider la livraison.'
      });
      return;
    }

    const clientSearchValue = String(this.LivraisonForm.get('clientSearch')?.value || '').trim();
    const currentPartId = Number(this.LivraisonForm.get('part_id')?.value || 0);
    const selectedClient = Array.isArray(this.clients)
      ? this.clients.find((c: any) => Number(c?.part_id ?? c?.id ?? 0) === currentPartId)
      : null;
    const typedClientName = this.normalizeValue(clientSearchValue);

    let resolvedClient = selectedClient;
    if (!resolvedClient && typedClientName) {
      resolvedClient = (this.clients || []).find((c: any) => {
        const normalizedName = this.normalizeValue(c?.nom || '');
        return normalizedName === typedClientName
          || normalizedName.includes(typedClientName)
          || typedClientName.includes(normalizedName);
      }) || null;
    }

    if (typedClientName && !resolvedClient && !currentPartId) {
      Swal.fire({
        icon: 'warning',
        title: 'Client invalide',
        text: 'Veuillez sélectionner un client depuis la liste.'
      });
      return;
    }

    const resolvedPartId = Number(resolvedClient?.part_id ?? resolvedClient?.id ?? currentPartId ?? 0);
    if (!resolvedPartId) {
      Swal.fire({
        icon: 'warning',
        title: 'Client obligatoire',
        text: 'Veuillez sélectionner un client valide.'
      });
      return;
    }

    this.LivraisonForm.patchValue({
      part_id: resolvedPartId,
      clientSearch: resolvedClient?.nom || clientSearchValue
    }, { emitEvent: false });

    this.editInfos = false;
    const payload = {
      ...this.LivraisonForm.value,
      part_id: Number(resolvedPartId),
      depot_id: depotId
    };
    this.venteSerivce.updateLivraison(document_id, payload).subscribe({
      next: (res) => {
        this.livraison = {
          ...this.livraison,
          client: res?.clientInfo?.nom || res?.client_nom || resolvedClient?.nom || this.livraison.client,
          adresse: res?.clientInfo?.adresse || resolvedClient?.adresse || this.livraison.adresse
        };
        this.info = {
          nom: res?.clientInfo?.nom || resolvedClient?.nom || this.info?.nom,
          adresse: res?.clientInfo?.adresse || resolvedClient?.adresse || this.info?.adresse,
          telephone: res?.clientInfo?.telephone || this.info?.telephone,
          email: res?.clientInfo?.email || this.info?.email,
          ice: res?.clientInfo?.ice || this.info?.ice
        };
      },
      error: (err) => {
        this.editInfos = true;
        Swal.fire({
          icon: 'error',
          title: 'Erreur de mise à jour',
          text: err?.error?.message || err?.message || 'Impossible de mettre à jour les informations de la livraison.'
        });
      }
    });
  }

  getDepotLabel(): string {
    const depotId = this.normalizeDepotId(this.LivraisonForm.get('depot_id')?.value);
    if (!depotId) {
      return (this.livraison as any)?.depot_nom || '-';
    }
    const depot = (this.depots || []).find((d: any) => Number(d?.id) === depotId);
    return depot?.nom || (this.livraison as any)?.depot_nom || '-';
  }

  onDepotHeaderChange(): void {
    this.applyHeaderDepotToLines(true);
  }

  private applyHeaderDepotToLines(forceAll: boolean): void {
    const headerDepotId = this.normalizeDepotId(this.LivraisonForm.get('depot_id')?.value);
    if (!headerDepotId) return;
    this.produits = (this.produits || []).map((p: any) => {
      const current = this.normalizeDepotId(p?.depot_id);
      if (forceAll || !current) {
        return { ...p, depot_id: headerDepotId };
      }
      return p;
    });
  }

  private normalizeDepotId(value: any): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private normalizeTaxeValue(value: any): number {
    if (value === '' || value === null || value === undefined) {
      return 0;
    }

    const numericValue = typeof value === 'string'
      ? Number(value.replace(',', '.'))
      : Number(value);

    if (!Number.isFinite(numericValue)) {
      return 0;
    }

    const normalizedValue = numericValue > 1 ? numericValue / 100 : numericValue;
    return Math.min(Math.max(normalizedValue, 0), 1);
  }

  getTaxePercent(line: any): number {
    return Math.round(this.normalizeTaxeValue(line?.taxe) * 10000) / 100;
  }

  onTaxePercentChange(index: number, value: any): void {
    const produit = this.produits[index];
    if (!produit) {
      return;
    }

    const numericValue = typeof value === 'string'
      ? Number(value.replace(',', '.'))
      : Number(value);

    const safePercent = Number.isFinite(numericValue)
      ? Math.min(Math.max(numericValue, 0), 100)
      : 0;

    produit.taxe = safePercent / 100;
    this.recalculateTotal(index);
  }

  private resequenceProduitLignes(): void {
    this.produits.forEach((produit, index) => {
      produit.ligne = index + 1;
    });
  }

  AllProduits(): Promise<void> {
    if (Array.isArray(this.produits1) && this.produits1.length > 0) {
      return Promise.resolve();
    }
    if (this.produitsLoadingPromise) {
      return this.produitsLoadingPromise;
    }

    this.produitsLoadingPromise = new Promise((resolve, reject) => {
      this.baseService.getProduit().subscribe({
        next: data => {
          // G?rer diff?rents formats de r?ponse
          let produitsData = data;
          if (data && data.data && Array.isArray(data.data)) {
            produitsData = data.data;
          } else if (data && Array.isArray(data)) {
            produitsData = data;
          } else {
            produitsData = [];
          }

          this.produits1 = produitsData;
          this.configureQuillModules(); // important si tu utilises quill-mention
          this.produitsLoadingPromise = null;
          resolve(); // OK permet le .then()
        },
        error: error => {
          this.produits1 = [];
          this.produitsLoadingPromise = null;
          reject(error);
        }
      });
    });
    return this.produitsLoadingPromise;
  }

  AllProduitsNomenclature(): Promise<void> {
    if (Array.isArray(this.produitsNomenclature) && this.produitsNomenclature.length > 0) {
      return Promise.resolve();
    }
    if (this.produitsNomenclatureLoadingPromise) {
      return this.produitsNomenclatureLoadingPromise;
    }

    this.produitsNomenclatureLoadingPromise = new Promise((resolve, reject) => {
      this.baseService.getProduitsNomenclature().subscribe({
        next: (data: any) => {
          const produitsData = data?.data || data || [];
          this.produitsNomenclature = Array.isArray(produitsData) ? produitsData : [];
          this.produitsNomenclatureLoadingPromise = null;
          resolve();
        },
        error: (error) => {
          this.produitsNomenclature = [];
          this.produitsNomenclatureLoadingPromise = null;
          reject(error);
        }
      });
    });

    return this.produitsNomenclatureLoadingPromise;
  }

  configureQuillModules() {
    this.modules = {
      mention: {
        allowedChars: /^[A-Za-z\s0-9-]*$/,
        mentionDenotationChars: ["#"],
        source: (searchTerm: string, renderList: Function) => {
          const values = this.produits1.map(prod => ({
            id: prod.article_id,
            value: prod.article_nom
          }));

          const matches = values.filter(v =>
            v.value.toLowerCase().includes(searchTerm.toLowerCase())
          );
          renderList(matches, searchTerm);
        },
        onSelect: (item: any, insertItem: any) => {
          insertItem(item);
          return false;
        }

      },
      toolbar: [
        [{ 'font': [] }],
        [{ 'size': ['small', false, 'large', 'huge'] }],
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'script': 'sub' }, { 'script': 'super' }],
        [{ 'header': 1 }, { 'header': 2 }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        [{ 'indent': '-1' }, { 'indent': '+1' }],
        [{ 'direction': 'rtl' }],
        [{ 'align': [] }],
        ['link', 'image', 'video'],
        ['clean']
      ]

    };
  }

  getQuillModules() {
    const values = this.produits1.map(prod => ({
      id: prod.article_id,
      value: prod.article_nom
    }));

    return {
      mention: {
        allowedChars: /^[A-Za-z\s0-9-]*$/,
        mentionDenotationChars: ['#'],
        source: function (searchTerm: string, renderList: any) {
          const matches = values.filter(v =>
            v.value.toLowerCase().includes(searchTerm.toLowerCase())
          );
          renderList(matches, searchTerm);
        },
        onSelect: function (item: any, insertItem: any) {
          insertItem(item);
          return false;
        }
      },
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['clean']
      ]
    };
  }

  private normalizePriceValue(value: any): number {
    if (value === '' || value === null || value === undefined) {
      return 0;
    }

    const numericValue = typeof value === 'string'
      ? Number(value.replace(',', '.'))
      : Number(value);

    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  private normalizeQuantityValue(value: any): number {
    if (value === '' || value === null || value === undefined) {
      return 0;
    }

    const numericValue = typeof value === 'string'
      ? Number(value.replace(',', '.'))
      : Number(value);

    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  private getArticleSourceForLine(index: number): any[] {
    const line = this.produits?.[index];
    if (line?.nomenclatureOnly) {
      return Array.isArray(this.produitsNomenclature) ? this.produitsNomenclature : [];
    }
    return Array.isArray(this.produits1) ? this.produits1 : [];
  }

  private filterArticlesForSearch(articles: any[], term: string): any[] {
    return (Array.isArray(articles) ? articles : [])
      .filter((article: any) => {
        const articleNom = String(article?.article_nom || '').toLowerCase();
        const articleCode = String(article?.article_cod || article?.Code_Article || '').toLowerCase();
        return articleNom.includes(term) || articleCode.includes(term);
      })
      .slice(0, 50);
  }

  private isNomenclatureArticleId(articleId: any): boolean {
    const id = Number(articleId || 0);
    if (!id) {
      return false;
    }

    return (Array.isArray(this.produitsNomenclature) ? this.produitsNomenclature : [])
      .some((article: any) => Number(article?.article_id || 0) === id);
  }

  private getProductInfoById(articleId: any): any {
    const id = Number(articleId || 0);
    if (!id) {
      return null;
    }

    return (Array.isArray(this.produits1) ? this.produits1 : [])
      .find((article: any) => Number(article?.article_id || 0) === id) || null;
  }

  private extractNomenclatureRows(response: any): any[] {
    const rows = response?.data || response || [];
    return Array.isArray(rows) ? rows : [];
  }

  private buildNomenclatureNode(line: any, parentQuantity: number): LivraisonNomenclatureNode {
    const componentId = Number(line?.Composant_id ?? line?.composant_id ?? 0) || 0;
    const productInfo = this.getProductInfoById(componentId);
    const unitQuantity = this.normalizeQuantityValue(line?.Quantite ?? line?.quantite ?? 0);
    const totalQuantity = unitQuantity * parentQuantity;
    const price = this.normalizePriceValue(
      productInfo?.pu ??
      productInfo?.prix_vente ??
      productInfo?.prix ??
      line?.pu ??
      line?.prix ??
      0
    );

    return {
      article_id: componentId,
      code: productInfo?.article_cod || productInfo?.Code_Article || line?.composant_cod || '',
      designation: productInfo?.article_nom || line?.composant_nom || '',
      quantite: unitQuantity,
      quantiteTotale: totalQuantity,
      prix: price,
      total: price * totalQuantity,
      famille: line?.famille_nom || productInfo?.famille_nom || productInfo?.famille || '',
      unite: line?.unite_nom || productInfo?.unite_nom || productInfo?.unite || '',
      poidsStandard: line?.Poids_Standard != null ? this.normalizeQuantityValue(line.Poids_Standard) : null,
      poidsReel: line?.Poids_reel != null ? this.normalizeQuantityValue(line.Poids_reel) : null,
      children: []
    };
  }

  private buildNomenclatureNodes(
    composeId: any,
    parentQuantity: number,
    depth: number = 0,
    visited: Set<number> = new Set<number>()
  ): Observable<LivraisonNomenclatureNode[]> {
    const id = Number(composeId || 0);
    if (!id || depth > 4 || visited.has(id)) {
      return of([]);
    }

    const nextVisited = new Set(visited);
    nextVisited.add(id);

    return this.baseService.getArticleNomenclature(id).pipe(
      catchError(() => of({ data: [] })),
      switchMap((response: any) => {
        const rows = this.extractNomenclatureRows(response);
        if (rows.length === 0) {
          return of([]);
        }

        const nodeRequests: Observable<LivraisonNomenclatureNode>[] = rows.map((line: any) => {
          const node = this.buildNomenclatureNode(line, parentQuantity);
          if (!node.article_id || depth >= 4 || nextVisited.has(node.article_id) || !this.isNomenclatureArticleId(node.article_id)) {
            return of(node);
          }

          return this.buildNomenclatureNodes(node.article_id, node.quantiteTotale, depth + 1, nextVisited).pipe(
            map((children: LivraisonNomenclatureNode[]) => ({
              ...node,
              children
            }))
          );
        });

        return forkJoin(nodeRequests);
      })
    );
  }

  private refreshNomenclatureDisplays(): void {
    if (!Array.isArray(this.produits) || this.produits.length === 0) {
      return;
    }
    if (!Array.isArray(this.produitsNomenclature) || this.produitsNomenclature.length === 0) {
      return;
    }

    this.produits.forEach((_, index) => this.loadNomenclatureForLineIfNeeded(index));
  }

  private loadNomenclatureForLineIfNeeded(index: number): void {
    const line = this.produits?.[index];
    const articleId = Number(line?.article_id || 0);

    if (!line || !articleId) {
      this.clearNomenclatureDisplay(line);
      return;
    }

    if (line.nomenclatureFromPersistedRows && this.hasNomenclatureComponents(line)) {
      line.isNomenclature = true;
      line.nomenclatureOnly = true;
      line.nomenclatureLoading = false;
      line.nomenclatureError = '';
      this.updateNomenclatureDisplayTotals(line);
      return;
    }

    if (!Array.isArray(this.produitsNomenclature) || this.produitsNomenclature.length === 0) {
      void this.AllProduitsNomenclature()
        .then(() => this.loadNomenclatureForLineIfNeeded(index))
        .catch(() => this.clearNomenclatureDisplay(line));
      return;
    }

    if (!this.isNomenclatureArticleId(articleId)) {
      if (line.nomenclatureFromPersistedRows && this.hasNomenclatureComponents(line)) {
        line.isNomenclature = true;
        line.nomenclatureOnly = true;
        this.updateNomenclatureDisplayTotals(line);
        return;
      }
      this.clearNomenclatureDisplay(line);
      return;
    }

    line.isNomenclature = true;
    line.nomenclatureOnly = true;
    line.nomenclatureLoading = true;
    line.nomenclatureError = '';
    line.nomenclatureComponents = [];
    line.nomenclatureTotal = 0;

    const lineRef = line;
    const quantity = this.normalizeQuantityValue(line.qte) || 1;
    this.buildNomenclatureNodes(articleId, quantity).subscribe({
      next: (nodes: LivraisonNomenclatureNode[]) => {
        const currentLine = lineRef;
        if (!this.produits.includes(currentLine) || Number(currentLine?.article_id || 0) !== articleId) {
          return;
        }

        currentLine.nomenclatureComponents = nodes;
        currentLine.nomenclatureLoading = false;
        currentLine.nomenclatureError = nodes.length ? '' : 'Aucun composant defini pour cette nomenclature.';
        this.updateNomenclatureDisplayTotals(currentLine);
        this.collapsePersistedNomenclatureComponentRows(currentLine);
        this.cdr.detectChanges();
      },
      error: () => {
        const currentLine = lineRef;
        if (!this.produits.includes(currentLine) || Number(currentLine?.article_id || 0) !== articleId) {
          return;
        }

        currentLine.nomenclatureComponents = [];
        currentLine.nomenclatureLoading = false;
        currentLine.nomenclatureError = 'Impossible de charger les composants de cette nomenclature.';
        currentLine.nomenclatureTotal = 0;
        this.cdr.detectChanges();
      }
    });
  }

  private clearNomenclatureDisplay(line: any): void {
    if (!line) {
      return;
    }

    line.isNomenclature = false;
    if (!line.nomenclatureOnly) {
      line.nomenclatureOnly = false;
    }
    line.nomenclatureComponents = [];
    line.nomenclatureLoading = false;
    line.nomenclatureError = '';
    line.nomenclatureTotal = 0;
    line.nomenclatureFromPersistedRows = false;
  }

  private updateNomenclatureDisplayTotals(line: any): void {
    if (!line || !Array.isArray(line.nomenclatureComponents)) {
      return;
    }

    const quantity = this.normalizeQuantityValue(line.qte) || 0;
    this.updateNomenclatureNodeTotals(line.nomenclatureComponents, quantity);
    line.nomenclatureTotal = this.sumNomenclatureNodes(line.nomenclatureComponents);
  }

  private updateNomenclatureNodeTotals(nodes: LivraisonNomenclatureNode[], parentQuantity: number): void {
    nodes.forEach((node: LivraisonNomenclatureNode) => {
      node.quantiteTotale = this.normalizeQuantityValue(node.quantite) * parentQuantity;
      node.total = this.normalizePriceValue(node.prix) * node.quantiteTotale;
      if (Array.isArray(node.children) && node.children.length > 0) {
        this.updateNomenclatureNodeTotals(node.children, node.quantiteTotale);
      }
    });
  }

  private sumNomenclatureNodes(nodes: LivraisonNomenclatureNode[]): number {
    return nodes.reduce((total: number, node: LivraisonNomenclatureNode) => {
      const childrenTotal = Array.isArray(node.children) && node.children.length > 0
        ? this.sumNomenclatureNodes(node.children)
        : 0;
      return total + this.normalizePriceValue(node.total) + childrenTotal;
    }, 0);
  }

  private isPersistedNomenclatureLine(line: any): boolean {
    return Number(line?.type ?? line?.ligne_type ?? line?.detail_type ?? 0) === 1;
  }

  private buildPersistedNomenclatureNode(line: any, parentLine: any): LivraisonNomenclatureNode {
    const quantity = this.normalizeQuantityValue(line?.qte ?? line?.quantite ?? 0);
    const price = this.normalizePriceValue(line?.pu ?? line?.prix ?? 0);
    const parentQuantity = this.normalizeQuantityValue(parentLine?.qte ?? parentLine?.quantite ?? 1) || 1;

    return {
      article_id: Number(line?.article_id || 0),
      code: line?.article_cod || line?.code || '',
      designation: line?.articleSearch || line?.article_nom || line?.designation || '',
      quantite: parentQuantity > 0 ? quantity / parentQuantity : quantity,
      quantiteTotale: quantity,
      prix: price,
      total: quantity * price,
      famille: line?.famille_nom || line?.famille || '',
      unite: line?.unite_nom || line?.unite || '',
      poidsStandard: line?.poidsStandard ?? line?.Poids_Standard ?? null,
      poidsReel: line?.poidsReel ?? line?.Poids_reel ?? null,
      children: []
    };
  }

  private attachPersistedNomenclatureRows(lines: any[]): any[] {
    const visibleLines: any[] = [];
    let currentParent: any = null;

    (Array.isArray(lines) ? lines : []).forEach((line: any) => {
      if (this.isPersistedNomenclatureLine(line) && currentParent) {
        if (!currentParent.nomenclatureFromPersistedRows) {
          currentParent.nomenclatureComponents = [];
          currentParent.nomenclatureFromPersistedRows = true;
        }
        currentParent.isNomenclature = true;
        currentParent.nomenclatureOnly = true;
        currentParent.nomenclatureComponents.push(this.buildPersistedNomenclatureNode(line, currentParent));
        currentParent.nomenclatureTotal = this.sumNomenclatureNodes(currentParent.nomenclatureComponents);
        return;
      }

      visibleLines.push(line);
      if (!this.isPersistedNomenclatureLine(line)) {
        currentParent = line;
      }
    });

    return visibleLines;
  }

  private flattenNomenclatureNodes(nodes: LivraisonNomenclatureNode[]): LivraisonNomenclatureNode[] {
    const result: LivraisonNomenclatureNode[] = [];
    (Array.isArray(nodes) ? nodes : []).forEach((node: LivraisonNomenclatureNode) => {
      result.push(node);
      if (Array.isArray(node.children) && node.children.length > 0) {
        result.push(...this.flattenNomenclatureNodes(node.children));
      }
    });
    return result;
  }

  private syncNomenclatureNodeFromRows(node: LivraisonNomenclatureNode, rows: any[]): void {
    const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if (safeRows.length === 0) {
      return;
    }

    const quantity = safeRows.reduce((sum: number, row: any) => sum + this.normalizeQuantityValue(row?.qte ?? row?.quantite), 0);
    const total = safeRows.reduce((sum: number, row: any) => {
      const rowQuantity = this.normalizeQuantityValue(row?.qte ?? row?.quantite);
      const rowPrice = this.normalizePriceValue(row?.pu ?? row?.prix ?? node.prix);
      return sum + (rowQuantity * rowPrice);
    }, 0);
    const firstRow = safeRows[0] || {};

    node.quantiteTotale = quantity;
    node.prix = quantity > 0 ? total / quantity : this.normalizePriceValue(firstRow?.pu ?? firstRow?.prix ?? node.prix);
    node.total = total;
    node.code = firstRow.article_cod || node.code || '';
    node.designation = firstRow.articleSearch || firstRow.article_nom || firstRow.designation || node.designation || '';
    node.unite = firstRow.unite_nom || node.unite || '';
  }

  private syncNomenclatureBaseQuantities(nodes: LivraisonNomenclatureNode[], parentQuantity: number): void {
    const safeParentQuantity = this.normalizeQuantityValue(parentQuantity) || 1;
    (Array.isArray(nodes) ? nodes : []).forEach((node: LivraisonNomenclatureNode) => {
      node.quantite = safeParentQuantity > 0 ? this.normalizeQuantityValue(node.quantiteTotale) / safeParentQuantity : node.quantite;
      node.total = this.normalizePriceValue(node.prix) * this.normalizeQuantityValue(node.quantiteTotale);
      if (Array.isArray(node.children) && node.children.length > 0) {
        this.syncNomenclatureBaseQuantities(node.children, node.quantiteTotale);
      }
    });
  }

  private collapsePersistedNomenclatureComponentRows(rootLine: any): void {
    if (!rootLine || rootLine.nomenclatureFromPersistedRows || !this.hasNomenclatureComponents(rootLine)) {
      return;
    }

    const rootIndex = this.produits.indexOf(rootLine);
    const flatNodes = this.flattenNomenclatureNodes(rootLine.nomenclatureComponents);
    if (rootIndex < 0 || flatNodes.length === 0) {
      return;
    }

    const matchedGroups: Array<{ node: LivraisonNomenclatureNode; indexes: number[] }> = [];
    let cursor = rootIndex + 1;

    for (let nodeIndex = 0; nodeIndex < flatNodes.length; nodeIndex += 1) {
      const node = flatNodes[nodeIndex];
      const articleId = Number(node.article_id || 0);
      const indexes: number[] = [];

      while (cursor < this.produits.length && Number(this.produits[cursor]?.article_id || 0) === articleId) {
        indexes.push(cursor);
        cursor += 1;
        const nextNode = flatNodes[nodeIndex + 1];
        if (nextNode && Number(nextNode.article_id || 0) === articleId) {
          break;
        }
      }

      if (indexes.length === 0) {
        return;
      }
      matchedGroups.push({ node, indexes });
    }

    const indexesToRemove = new Set<number>();
    matchedGroups.forEach((group) => {
      group.indexes.forEach((index) => indexesToRemove.add(index));
      this.syncNomenclatureNodeFromRows(group.node, group.indexes.map((index) => this.produits[index]));
    });

    this.syncNomenclatureBaseQuantities(rootLine.nomenclatureComponents, this.normalizeQuantityValue(rootLine.qte) || 1);
    rootLine.nomenclatureFromPersistedRows = true;
    rootLine.nomenclatureTotal = this.sumNomenclatureNodes(rootLine.nomenclatureComponents);
    this.produits = this.produits.filter((_, index) => !indexesToRemove.has(index));
    this.filteredArticles = {};
  }

  hasNomenclatureComponents(line: any): boolean {
    return !!line && Array.isArray(line.nomenclatureComponents) && line.nomenclatureComponents.length > 0;
  }

  shouldDisplayNomenclatureComponents(line: any): boolean {
    return this.hasNomenclatureComponents(line) || !!line?.nomenclatureLoading || !!line?.nomenclatureError;
  }

  getNomenclatureTotal(line: any): number {
    return this.normalizePriceValue(line?.nomenclatureTotal);
  }

  trackByNomenclatureNode(index: number, node: LivraisonNomenclatureNode): string {
    return `${node.article_id}-${index}`;
  }

  setActiveProductTab(tab: 'produits' | 'lots'): void {
    this.activeProductTab = tab;
  }

  private resetLotDetails(rows: any[]): void {
    const normalizedRows = this.normalizeLotDetails(rows);
    this.lotDetails = normalizedRows;
    this.lotDetailsOriginal = JSON.parse(JSON.stringify(normalizedRows));
    this.lotsDirty = false;
  }

  private normalizeLotDetails(rows: any[]): any[] {
    const documentId = Number(this.route.snapshot.paramMap.get('document_id') || 0) || null;
    const normalizedRows = (Array.isArray(rows) ? rows : []).map((row: any, index: number) => {
      const detailId = Number(row?.detail_id || 0) || null;
      const ligne = Number(row?.ligne || 0) || (index + 1);
      const linkedProduct = this.produits.find((produit: any) => {
        const produitDetailId = Number(produit?.id ?? produit?.detail_id ?? 0) || null;
        const produitLigne = Number(produit?.ligne || 0) || null;
        return (detailId && produitDetailId === detailId) || (!!ligne && produitLigne === ligne);
      });
      const articleId = Number(row?.article_id || linkedProduct?.article_id || 0) || null;
      const article = this.findArticleById(articleId);
      const articleNom = String(
        row?.article_nom
        || row?.detail_designation
        || linkedProduct?.articleSearch
        || linkedProduct?.designation
        || article?.article_nom
        || ''
      ).trim();
      const serie = String(row?.serie || row?.numero_lot || '').trim();

      return {
        lot_row_id: Number(row?.lot_row_id || 0) || null,
        stock_id: Number(row?.stock_id || documentId || 0) || documentId,
        detail_id: detailId,
        ligne,
        article_id: articleId,
        article_nom: articleNom,
        serie,
        quantite: this.toFiniteNumber(row?.quantite) ?? 0,
        original_ligne: ligne,
        original_serie: serie,
        original_article_id: articleId
      };
    });

    const representedDetailIds = new Set(
      normalizedRows
        .map((row: any) => Number(row?.detail_id || 0))
        .filter((detailId: number) => Number.isFinite(detailId) && detailId > 0)
    );

    const placeholderRows = (Array.isArray(this.produits) ? this.produits : [])
      .map((produit: any, index: number) => {
        const detailId = Number(produit?.id ?? produit?.detail_id ?? 0) || null;
        if (!detailId || representedDetailIds.has(detailId)) {
          return null;
        }

        const articleId = Number(produit?.article_id || 0) || null;
        const article = this.findArticleById(articleId);
        const ligne = Number(produit?.ligne || 0) || (index + 1);
        const articleNom = String(
          produit?.articleSearch
          || produit?.designation
          || produit?.description
          || article?.article_nom
          || ''
        ).trim();
        const quantite = this.toFiniteNumber(produit?.qte ?? produit?.quantite) ?? 0;

        return {
          lot_row_id: null,
          stock_id: Number(produit?.document_id || documentId || 0) || documentId,
          detail_id: detailId,
          ligne,
          article_id: articleId,
          article_nom: articleNom,
          serie: '',
          quantite,
          original_ligne: ligne,
          original_serie: '',
          original_article_id: articleId
        };
      })
      .filter(Boolean) as any[];

    return [...normalizedRows, ...placeholderRows]
      .sort((a: any, b: any) => {
        const ligneA = Number(a?.ligne || 0) || 0;
        const ligneB = Number(b?.ligne || 0) || 0;
        if (ligneA !== ligneB) {
          return ligneA - ligneB;
        }
        return String(a?.serie || '').localeCompare(String(b?.serie || ''), 'fr', { sensitivity: 'base' });
      });
  }

  markLotsDirty(): void {
    this.lotsDirty = true;
  }

  private findArticleByName(articleLabel: any): any | null {
    const normalizedLabel = this.normalizeValue(articleLabel || '');
    if (!normalizedLabel || !Array.isArray(this.produits1)) {
      return null;
    }

    return this.produits1.find((article: any) =>
      this.normalizeValue(article?.article_nom) === normalizedLabel
      || this.normalizeValue(article?.article_cod) === normalizedLabel
    ) || null;
  }

  onLotArticleNameChange(lot: any): void {
    const matchedArticle = this.findArticleByName(lot?.article_nom);
    if (matchedArticle?.article_id) {
      lot.article_id = Number(matchedArticle.article_id) || lot.article_id;
      lot.article_nom = matchedArticle.article_nom || lot.article_nom;
    }
    this.markLotsDirty();
  }

  saveLotDetails(): void {
    const documentId = +this.route.snapshot.paramMap.get('document_id')!;

    if (!Array.isArray(this.lotDetails) || this.lotDetails.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Aucun lot',
        text: 'Aucun lot a enregistrer pour cette livraison.'
      });
      return;
    }

    const lignes = this.lotDetails.map((lot: any, index: number) => {
      const matchedArticle = this.findArticleByName(lot?.article_nom);
      return {
        lot_row_id: lot?.lot_row_id ?? null,
        stock_id: Number(lot?.stock_id || documentId) || documentId,
        detail_id: Number(lot?.detail_id || 0) || null,
        ligne: Number(lot?.ligne || 0) || (index + 1),
        article_id: Number(matchedArticle?.article_id || lot?.article_id || lot?.original_article_id || 0) || null,
        article_nom: String(lot?.article_nom || '').trim(),
        serie: String(lot?.serie || '').trim(),
        quantite: this.toFiniteNumber(lot?.quantite) ?? 0,
        original_ligne: Number(lot?.original_ligne || lot?.ligne || 0) || (index + 1),
        original_serie: String(lot?.original_serie || '').trim(),
        original_article_id: Number(lot?.original_article_id || lot?.article_id || 0) || null
      };
    });

    if (lignes.some((ligne: any) => !ligne.detail_id)) {
      Swal.fire({
        icon: 'error',
        title: 'Ligne lot invalide',
        text: 'Certaines lignes de lots ne sont pas reliees a une ligne produit.'
      });
      return;
    }

    this.lotsSaving = true;
    this.venteSerivce.SaveLivraisonLots(documentId, lignes).subscribe({
      next: () => {
        this.venteSerivce.getLivraisonById(documentId).subscribe({
          next: (refreshRes: any) => {
            this.processLivraisonData(refreshRes);
            this.setActiveProductTab('lots');
            this.lotsSaving = false;
            Swal.fire({
              icon: 'success',
              title: 'Lots enregistres',
              text: 'Les modifications des lots ont ete sauvegardees avec succes.'
            });
          },
          error: () => {
            this.resetLotDetails(this.lotDetails);
            this.setActiveProductTab('lots');
            this.lotsSaving = false;
            Swal.fire({
              icon: 'success',
              title: 'Lots enregistres',
              text: 'Les modifications des lots ont ete sauvegardees avec succes.'
            });
          }
        });
      },
      error: (err: any) => {
        this.lotsSaving = false;
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: err?.error?.message || err?.message || 'Erreur lors de la sauvegarde des lots.'
        });
      }
    });
  }

  private findArticleById(articleId: any): any | null {
    const safeId = Number(articleId || 0);
    if (!safeId || !Array.isArray(this.produits1)) {
      return null;
    }
    return this.produits1.find((article: any) => Number(article?.article_id) === safeId) || null;
  }

  private getCompositionProductKey(product: any, index: number): string {
    const stockDetailId = Number(product?.id || 0);
    return stockDetailId > 0 ? `id:${stockDetailId}` : `tmp:${index}`;
  }

  private buildCompositionRowFromProduct(product: any, index: number, existingRow: any = null): any {
    const articleId = Number(existingRow?.article_id ?? product?.article_id ?? 0) || 0;
    const article = this.findArticleById(articleId);
    return {
      key: this.getCompositionProductKey(product, index),
      id: existingRow?.id ?? null,
      stock_detail_id: Number(product?.id || existingRow?.stock_detail_id || 0) || null,
      article_id: articleId,
      article_nom: article?.article_nom || product?.articleSearch || product?.designation || existingRow?.article_nom || '',
      ligne: Number(existingRow?.ligne ?? index + 1) || (index + 1),
      quantite: existingRow?.quantite ?? null,
      prix: existingRow?.prix ?? null,
      taux_tva: existingRow?.taux_tva ?? null,
      quill_id: existingRow?.quill_id ?? null,
      designation: existingRow?.designation || '',
      etat: Number(existingRow?.etat ?? 1) || 1,
      type: Number(existingRow?.type ?? 2) || 2,
      product_qte: Number(product?.qte ?? 1) || 1,
      product_pu: Number(product?.pu ?? 0) || 0,
      product_tva: this.isClientExonerated ? 0 : Number(product?.taxe ?? 0.2) || 0
    };
  }

  private toFiniteNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') {
      return null;
    }

    const normalizedValue = typeof value === 'string'
      ? value.trim().replace(',', '.')
      : value;
    const parsed = Number(normalizedValue);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private captureCompositionCommercialValues(rows: any[] = this.compositionRows): { quantite: number | null; prix: number | null; taux_tva: number | null } | null {
    const firstRow = (Array.isArray(rows) ? rows : []).filter(Boolean)[0];

    if (!firstRow) {
      return null;
    }

    return {
      quantite: this.toFiniteNumber(firstRow?.quantite),
      prix: this.toFiniteNumber(firstRow?.prix),
      taux_tva: this.isClientExonerated ? 0 : this.toFiniteNumber(firstRow?.taux_tva)
    };
  }

  private normalizeCompositionRows(commercialValues: { quantite: number | null; prix: number | null; taux_tva: number | null } | null = null): void {
    this.compositionRows = (Array.isArray(this.compositionRows) ? this.compositionRows : [])
      .filter(Boolean)
      .map((row: any, index: number) => {
        const isFirst = index === 0;
        const rowQuantite = this.toFiniteNumber(row?.quantite);
        const rowPrix = this.toFiniteNumber(row?.prix);
        const rowTauxTva = this.toFiniteNumber(row?.taux_tva);
        const productQte = this.toFiniteNumber(row?.product_qte);
        const productPu = this.toFiniteNumber(row?.product_pu);
        const productTva = this.toFiniteNumber(row?.product_tva);
        return {
          ...row,
          ligne: index + 1,
          quantite: isFirst
            ? (commercialValues?.quantite ?? rowQuantite ?? productQte ?? 1)
            : null,
          prix: isFirst
            ? (commercialValues?.prix ?? rowPrix ?? productPu ?? 0)
            : null,
          taux_tva: isFirst
            ? (this.isClientExonerated ? 0 : (commercialValues?.taux_tva ?? rowTauxTva ?? productTva ?? 0))
            : null
        };
      });
  }

  private escapeCompositionHtml(value: any): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private buildCompositionEditorHtml(): string {
    return (this.compositionRows || [])
      .map((row: any, index: number) => {
        const title = this.escapeCompositionHtml(row?.article_nom || 'Article sans libelle');
        if (index === 0) {
          return `<p><strong>${index + 1}. ${title}</strong></p>`;
        }

        return `<p style="margin-left: 28px;">${index + 1}. ${title}</p>`;
      })
      .join('');
  }

  private syncCompositionEditorFromRows(force = false): void {
    if (this.compositionEditorTouched) {
      return;
    }

    if (!force && String(this.compositionEditorHtml || '').trim()) {
      return;
    }

    this.compositionEditorHtml = this.buildCompositionEditorHtml();
  }

  private initializeCompositionState(compositions: any[] = []): void {
    const compositionByDetail = new Map<number, any>();
    const sortedRows = (Array.isArray(compositions) ? compositions : [])
      .slice()
      .sort((a: any, b: any) => Number(a?.ligne || 0) - Number(b?.ligne || 0));

    sortedRows.forEach((row: any) => {
      const stockDetailId = Number(row?.stock_detail_id || 0);
      if (stockDetailId > 0 && !compositionByDetail.has(stockDetailId)) {
        compositionByDetail.set(stockDetailId, row);
      }
    });

    const firstStyledRow = sortedRows.find((row: any) => Number(row?.ligne || 0) === 1 && String(row?.designation || '').trim());
    this.compositionEditorHtml = firstStyledRow?.designation || '';
    this.compositionEditorTouched = false;

    const orderedProducts = (this.produits || [])
      .map((product: any, index: number) => {
        const existingRow = compositionByDetail.get(Number(product?.id || 0)) || null;
        return {
          product,
          originalIndex: index,
          sortOrder: Number(existingRow?.ligne || (index + 1)),
          existingRow
        };
      })
      .sort((a: any, b: any) => a.sortOrder - b.sortOrder || a.originalIndex - b.originalIndex);

    this.compositionRows = orderedProducts.map((entry: any, index: number) =>
      this.buildCompositionRowFromProduct(entry.product, index, entry.existingRow)
    );
    this.normalizeCompositionRows(this.captureCompositionCommercialValues(this.compositionRows));
    if (!String(this.compositionEditorHtml || '').trim()) {
      this.syncCompositionEditorFromRows(true);
    }
    this.compositionDeletedRows = [];
    this.compositionDragContext = null;
  }

  private syncCompositionRowsFromProduits(): void {
    const currentRows = Array.isArray(this.compositionRows) ? this.compositionRows : [];
    const commercialValues = this.captureCompositionCommercialValues(currentRows);
    const existingMap = new Map(
      currentRows.map((row: any) => [String(row?.key || ''), row])
    );
    const productEntries = (this.produits || []).map((product: any, index: number) => {
      const key = this.getCompositionProductKey(product, index);
      return {
        key,
        product,
        existingRow: existingMap.get(key) || existingMap.get(`id:${Number(product?.id || 0)}`) || null
      };
    });
    const productEntryMap = new Map(productEntries.map((entry: any) => [entry.key, entry]));
    const orderedEntries = currentRows
      .map((row: any) => productEntryMap.get(String(row?.key || '')))
      .filter(Boolean);
    const existingKeys = new Set(orderedEntries.map((entry: any) => entry.key));
    const remainingEntries = productEntries.filter((entry: any) => !existingKeys.has(entry.key));

    this.compositionRows = [...orderedEntries, ...remainingEntries].map((entry: any, index: number) =>
      this.buildCompositionRowFromProduct(entry.product, index, entry.existingRow)
    );

    this.normalizeCompositionRows(commercialValues);
  }

  private syncCompositionParentFromProduct(_product: any): void {
    this.syncCompositionRowsFromProduits();
  }

  private syncCompositionParentsFromProduits(): void {
    this.syncCompositionRowsFromProduits();
  }

  onCompositionFirstRowChange(): void {
    const firstRow = Array.isArray(this.compositionRows) && this.compositionRows.length > 0
      ? this.compositionRows[0]
      : null;
    if (!firstRow) {
      return;
    }

    firstRow.quantite = this.toFiniteNumber(firstRow.quantite);
    firstRow.prix = this.toFiniteNumber(firstRow.prix);
    firstRow.taux_tva = this.isClientExonerated ? 0 : this.toFiniteNumber(firstRow.taux_tva);
    this.syncCompositionEditorFromRows(true);
  }

  onCompositionEditorChange(_value: string): void {
    this.compositionEditorTouched = true;
  }

  onCompositionRowDragStart(index: number): void {
    this.compositionDragContext = { index };
  }

  onCompositionInputPointerDown(event: Event): void {
    event.stopPropagation();
    this.compositionInputFocused = true;
  }

  onCompositionInputBlur(): void {
    this.compositionInputFocused = false;
  }

  onCompositionDrop(event: CdkDragDrop<any[]>): void {
    const sourceIndex = Number(event.previousIndex ?? -1);
    const targetIndex = Number(event.currentIndex ?? -1);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex || sourceIndex >= this.compositionRows.length) {
      this.compositionDragContext = null;
      return;
    }

    const commercialValues = this.captureCompositionCommercialValues();
    const rows = [...this.compositionRows];
    moveItemInArray(rows, sourceIndex, targetIndex);
    this.compositionRows = rows;
    this.normalizeCompositionRows(commercialValues);
    this.syncCompositionEditorFromRows(true);
    this.compositionDragContext = null;
  }

  onCompositionDragEnd(): void {
    this.compositionDragContext = null;
    this.compositionInputFocused = false;
  }

  hasUnsavedCompositionRows(): boolean {
    return (this.compositionRows || []).some((row: any) => !Number(row?.stock_detail_id || 0));
  }

  getCompositionDisplayNumber(index: number): string {
    return `${index + 1}`;
  }

  private buildCompositionPayload(): any[] {
    return (this.compositionRows || []).map((row: any, index: number) => ({
      id: row?.id ?? null,
      stock_detail_id: row?.stock_detail_id ?? null,
      ligne: index + 1,
      article_id: Number(row?.article_id || 0) || 0,
      quill_id: row?.quill_id ?? null,
      quantite: index === 0 ? (this.toFiniteNumber(row?.quantite) ?? 0) : null,
      prix: index === 0 ? (this.toFiniteNumber(row?.prix) ?? 0) : null,
      taux_tva: index === 0 ? (this.isClientExonerated ? 0 : (this.toFiniteNumber(row?.taux_tva) ?? 0)) : null,
      designation: index === 0 ? String(this.compositionEditorHtml || '').trim() : '',
      etat: Number(row?.etat ?? 1) || 1,
      type: Number(row?.type ?? 2) || 2,
      update_mode: row?.id ? 'U' : 'I'
    }));
  }

  private persistComposition(documentId: number, options: { showSuccess?: boolean; refreshAfterSuccess?: boolean; onSuccess?: () => void } = {}): void {
    this.syncCompositionRowsFromProduits();

    const unsavedRows = (this.compositionRows || []).filter((row: any) => !Number(row?.stock_detail_id || 0));
    if (unsavedRows.length > 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Produits non enregistres',
        text: 'Veuillez d abord enregistrer les lignes produit avant de sauvegarder la composition.'
      });
      return;
    }

    const payload = this.buildCompositionPayload();
    if (payload.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Aucune composition',
        text: 'Aucune ligne de composition a enregistrer.'
      });
      return;
    }

    const invalidRow = payload.find((row: any) => !row?.stock_detail_id || !row?.article_id);
    if (invalidRow) {
      Swal.fire({
        icon: 'warning',
        title: 'Composition incomplete',
        text: 'Chaque ligne doit pointer vers un article valide.'
      });
      return;
    }

    if (Number(payload[0]?.quantite || 0) <= 0) {
      Swal.fire({
        icon: 'warning',
        title: 'Quantite invalide',
        text: 'La premiere ligne doit contenir une quantite superieure a zero.'
      });
      return;
    }

    this.venteSerivce.SaveLivraisonComposition(documentId, payload).subscribe({
      next: () => {
        const afterSuccess = () => {
          options.onSuccess?.();
          if (options.showSuccess !== false) {
            Swal.fire({
              icon: 'success',
              title: 'Composition enregistree',
              text: 'La composition de la livraison a ete mise a jour avec succes.'
            });
          }
        };

        if (options.refreshAfterSuccess !== false) {
          this.venteSerivce.getLivraisonById(documentId).subscribe({
            next: (refreshRes: any) => {
              this.processLivraisonData(refreshRes);
              this.setActiveProductTab('produits');
              afterSuccess();
            },
            error: () => {
              options.onSuccess?.();
              if (options.showSuccess !== false) {
                Swal.fire({
                  icon: 'success',
                  title: 'Composition enregistree',
                  text: 'La composition a ete enregistree, mais le rafraichissement a echoue.'
                });
              }
            }
          });
          return;
        }

        afterSuccess();
      },
      error: (err: any) => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: err?.error?.message || err?.message || 'Une erreur est survenue lors de l enregistrement de la composition.'
        });
      }
    });
  }

  saveComposition(): void {
    const documentId = +this.route.snapshot.paramMap.get('document_id')!;
    this.persistComposition(documentId, {
      showSuccess: true,
      refreshAfterSuccess: true
    });
  }

  recalculateTotal(index: number) {
    const prod = this.produits[index];
    const base = this.normalizePriceValue(prod.pu) * this.normalizeQuantityValue(prod.qte);

    // Correction selon le mode par produit
    if (prod.reducMode === 'pourcentage') {
      if (prod.reduc > 100) prod.reduc = 100;
      if (prod.reduc < 0) prod.reduc = 0;
    } else {
      if (prod.reduc < 0) prod.reduc = 0;
      if (prod.reduc > base) prod.reduc = base;
    }

    const reduction = prod.reducMode === 'pourcentage'
      ? (prod.reduc / 100) * base
      : prod.reduc;

    const baseApresReduc = base - reduction;

    prod.total = baseApresReduc;
    this.syncCompositionParentFromProduct(prod);
    this.updateNomenclatureDisplayTotals(prod);

    this.calculerTotaux();
  }

  calculerTotaux() {
    this.sousTotal = this.produits.reduce((acc, p) => acc + p.pu * p.qte, 0);

    this.reducTotal = this.produits.reduce((acc, p) => {
      const base = p.pu * p.qte;
      const reduc = p.reducMode === 'pourcentage'
        ? (p.reduc / 100) * base
        : p.reduc;
      return acc + reduc;
    }, 0);

    const baseApresReduc = this.sousTotal - this.reducTotal;

    // TVA: 0% si client exon?r? valide, sinon 20%
    this.taxeTotal = this.produits.reduce((acc, p) => {
      const base = p.pu * p.qte;
      const reduc = p.reducMode === 'pourcentage'
        ? (p.reduc / 100) * base
        : p.reduc;
      const baseApresReduc = Math.max(base - reduc, 0);
      const taux = this.isClientExonerated ? 0 : this.normalizeTaxeValue(p.taxe);
      const tva = taux * baseApresReduc;
      return acc + tva;
    }, 0);

    this.totalGeneral = baseApresReduc + this.taxeTotal + this.fraisPort;
  }

  private getCompositionFinancialSummary(): { sousTotal: number; reducTotal: number; taxeTotal: number; totalGeneral: number } {
    const firstRow = Array.isArray(this.compositionRows) && this.compositionRows.length > 0
      ? this.compositionRows[0]
      : null;
    const quantite = this.toFiniteNumber(firstRow?.quantite) || 0;
    const prix = this.toFiniteNumber(firstRow?.prix) || 0;
    const tauxTva = this.isClientExonerated ? 0 : (this.toFiniteNumber(firstRow?.taux_tva) || 0);
    const sousTotal = quantite * prix;
    const reducTotal = 0;
    const taxeTotal = sousTotal * tauxTva;

    return {
      sousTotal,
      reducTotal,
      taxeTotal,
      totalGeneral: sousTotal + taxeTotal
    };
  }

  getDisplayedSousTotal(): number {
    return this.sousTotal;
  }

  getDisplayedReducTotal(): number {
    return this.reducTotal;
  }

  getDisplayedTaxeTotal(): number {
    return this.taxeTotal;
  }

  getDisplayedTotalGeneral(): number {
    return this.totalGeneral;
  }

  // V?rifier si le client a une exon?ration TVA valide (m?me que edit-devis + fiabilisation)
  checkClientExoneration(part_id: number): void {
    const token = ++this.exoCheckToken;
    this.baseService.getAllExonerations(part_id).pipe(
      retry({ count: 2, delay: 300 }),
      catchError(() => of({ success: true, data: [] }))
    ).subscribe((response: any) => {
      if (token !== this.exoCheckToken) return;

      const exonerations = response?.data || response || [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const validExoneration = (Array.isArray(exonerations) ? exonerations : []).find((exon: any) => {
        if (!exon?.date_debut || !exon?.date_fin) return false;
        const dateDebut = new Date(exon.date_debut);
        dateDebut.setHours(0, 0, 0, 0);
        const dateFin = new Date(exon.date_fin);
        dateFin.setHours(0, 0, 0, 0);
        return today >= dateDebut && today <= dateFin;
      });

      this.isClientExonerated = !!validExoneration;
      this.syncCompositionParentsFromProduits();
      this.calculerTotaux();
      this.cdr.detectChanges();
    });
  }

  toggleReducMode() {
    this.reducMode = this.reducMode === 'pourcentage' ? 'montant' : 'pourcentage';
    this.produits.forEach((_, i) => this.recalculateTotal(i));
  }

  addProduit() {
    this.produits.push({
      id: 0,
      ligne: this.produits.length + 1,
      designation: '',
      article_id: 0,
      pu: 0,
      qte: 1,
      reduc: 0,
      taxe: this.normalizeTaxeValue(0.2),
      total: 0,
      reducMode: 'montant',
      articleSearch: '',
      depot_id: this.normalizeDepotId(this.LivraisonForm.get('depot_id')?.value),
      nomenclatureOnly: false,
      isNomenclature: false,
      nomenclatureComponents: [] as LivraisonNomenclatureNode[],
      nomenclatureLoading: false,
      nomenclatureError: '',
      nomenclatureTotal: 0
    });
    const newIndex = this.produits.length - 1;
    this.syncCompositionParentFromProduct(this.produits[newIndex]);
    this.recalculateTotal(newIndex);
  }

  addNomenclatureProduit() {
    this.mode = 'table';
    this.produits.push({
      id: 0,
      ligne: this.produits.length + 1,
      designation: '',
      article_id: 0,
      pu: 0,
      qte: 1,
      reduc: 0,
      taxe: this.normalizeTaxeValue(0.2),
      total: 0,
      reducMode: 'montant',
      articleSearch: '',
      depot_id: this.normalizeDepotId(this.LivraisonForm.get('depot_id')?.value),
      nomenclatureOnly: true,
      isNomenclature: true,
      nomenclatureComponents: [] as LivraisonNomenclatureNode[],
      nomenclatureLoading: false,
      nomenclatureError: '',
      nomenclatureTotal: 0
    });
    const newIndex = this.produits.length - 1;
    this.syncCompositionParentFromProduct(this.produits[newIndex]);
    this.recalculateTotal(newIndex);
    void this.AllProduitsNomenclature().catch(() => undefined);
  }

  removeProduit(index: number) {
    const produit = this.produits[index];

    // Si l'?l?ment a un ID, on le garde pour suppression backend
    if (produit.id) {
      this.produitsSupprimes.push(produit.id);

      this.venteSerivce.RemoveDetailLigneLivraison(this.produitsSupprimes).subscribe({
        next: (res: { message: string }) => {
          this.showNotification(res.message, false);
          this.produitsSupprimes = [];
        },
        error: (err: any) => {
          this.showNotification(err.message, true);
        }
      });

    }
    // Retirer la ligne du tableau
    this.compositionDeletedRows = this.compositionDeletedRows.filter((row: any) => Number(row?.stock_detail_id || 0) !== Number(produit?.id || 0));
    this.produits.splice(index, 1);
    this.compositionDragContext = null;
    this.resequenceProduitLignes();

    // Recalculer les totaux
    this.calculerTotaux();
  }

  onProduitDrop(event: CdkDragDrop<any[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.produits, event.previousIndex, event.currentIndex);
    this.resequenceProduitLignes();
    this.filteredArticles = {};
    this.highlightedArticleIndex = {};
    this.calculerTotaux();

    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    const lignesOrdre = this.produits
      .map((p, index) => ({ p, index }))
      .filter(({ p }) => Number(p?.id || 0) > 0 && Number(p?.article_id || 0) > 0)
      .map(({ p, index }) => {
        const desiredTax = this.isClientExonerated ? 0 : this.normalizeTaxeValue(p.taxe);
        const payload: any = {
          id: p.id,
          article_id: p.article_id,
          designation: p.designation,
          pu: p.pu,
          qte: p.qte,
          tva: desiredTax,
          ligne: index + 1,
          depot_id: this.normalizeDepotId(p.depot_id),
          document_id,
          update_mode: 'U'
        };

        if (p.reducMode === 'pourcentage') {
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          payload.remise = reducValue / 100;
          payload.remise_montant = null;
        } else {
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          payload.remise_montant = reducValue;
          payload.remise = null;
        }

        return payload;
      });

    const hasUnsavedRows = this.produits.some((p) => !Number(p?.id || 0));

    if (lignesOrdre.length === 0) {
      if (hasUnsavedRows) {
        this.showNotification('Ordre mis a jour. Enregistrez pour le sauvegarder.', false);
      }
      return;
    }

    this.venteSerivce.SaveLignesDetailLivraison(lignesOrdre).subscribe({
      next: () => {
        this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
        this.showNotification(
          hasUnsavedRows
            ? 'Ordre enregistre pour les lignes existantes. Enregistrez tout pour les nouvelles lignes.'
            : 'Ordre des lignes enregistre avec succes.',
          false
        );
      },
      error: () => {
        this.showNotification('Erreur lors de la sauvegarde de l ordre des lignes.', true);
      }
    });
  }

  startDetailsResize(event: MouseEvent, headerEl: HTMLElement): void {
    event.preventDefault();
    event.stopPropagation();
    this.resizingDetailsColumn = true;
    this.detailsResizeStartX = event.clientX;
    this.detailsResizeStartWidth = headerEl?.offsetWidth || parseInt(this.detailsColumnWidth, 10) || 480;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.resizingDetailsColumn) {
      return;
    }

    const delta = event.clientX - this.detailsResizeStartX;
    const nextWidth = Math.max(400, Math.min(840, this.detailsResizeStartWidth + delta));
    this.detailsColumnWidth = `${nextWidth}px`;
  }

  @HostListener('document:mouseup')
  onDocumentMouseUp(): void {
    if (!this.resizingDetailsColumn) {
      return;
    }

    this.resizingDetailsColumn = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  onProduitSelected(index: number) {
    const articleId = this.produits[index].article_id;
    const produitTrouve = this.produits1.find(p => +p.article_id === +articleId);
    if (produitTrouve) {
      this.produits[index].designation = produitTrouve.article_nom; // OK met la d?signation dans le champ
      this.produits[index].pu = produitTrouve.pu || 0;
      this.produits[index].qte = 1;
      this.produits[index].reduc = 0;
      this.produits[index].taxe = this.normalizeTaxeValue(produitTrouve.taxe ?? 0.2);
      this.recalculateTotal(index);
      this.loadNomenclatureForLineIfNeeded(index);
    }

    // OK Active le mode ?diteur pour cette ligne
    this.ligneSelectionnee = index;
    this.mode = 'editor';
  }

  // M?thodes pour l'auto-compl?tion des articles
  onArticleSearchChange(index: number, term: string) {
    if (!term) {
      this.filteredArticles[index] = [];
      this.highlightedArticleIndex[index] = -1;
      return;
    }

    term = term.trim().toLowerCase();

    if (term.length === 0) {
      this.filteredArticles[index] = [];
      this.highlightedArticleIndex[index] = -1;
      return;
    }

    const articleSource = this.getArticleSourceForLine(index);

    if (!Array.isArray(articleSource) || articleSource.length === 0) {
      const loader = this.produits?.[index]?.nomenclatureOnly
        ? this.AllProduitsNomenclature()
        : this.AllProduits();

      loader.then(() => {
        this.filteredArticles[index] = this.filterArticlesForSearch(this.getArticleSourceForLine(index), term);
        this.highlightedArticleIndex[index] = this.filteredArticles[index].length ? 0 : -1;
      }).catch(() => {
        this.filteredArticles[index] = [];
        this.highlightedArticleIndex[index] = -1;
      });
      return;
    }

    this.filteredArticles[index] = this.filterArticlesForSearch(articleSource, term);
    this.highlightedArticleIndex[index] = this.filteredArticles[index].length ? 0 : -1;
  }

  onArticleSearchKeydown(index: number, event: KeyboardEvent) {
    const articles = this.filteredArticles[index] || [];
    if (!articles.length) return;

    const currentIndex = this.highlightedArticleIndex[index] ?? -1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedArticleIndex[index] = currentIndex < articles.length - 1 ? currentIndex + 1 : 0;
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedArticleIndex[index] = currentIndex > 0 ? currentIndex - 1 : articles.length - 1;
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      const selectedArticle = articles[currentIndex >= 0 ? currentIndex : 0];
      if (selectedArticle) this.selectArticle(index, selectedArticle);
      return;
    }

    if (event.key === 'Escape') {
      this.filteredArticles[index] = [];
      this.highlightedArticleIndex[index] = -1;
    }
  }

  selectArticle(index: number, article: any) {
    this.produits[index].article_id = article.article_id;
    this.produits[index].articleSearch = article.article_nom;
    this.produits[index].stock_disponible = null;
    this.produits[index].nomenclatureFromPersistedRows = false;
    this.filteredArticles[index] = [];
    this.highlightedArticleIndex[index] = -1;

    // Mettre ? jour les autres propri?t?s
    this.produits[index].designation = article.article_nom;
    this.produits[index].pu = article.pu || article.prix_vente || article.prix || 0;
    this.produits[index].qte = 1;
    this.produits[index].reduc = 0;
    this.produits[index].taxe = this.normalizeTaxeValue(article.taxe ?? 0.2);
    this.produits[index].depot_id = this.normalizeDepotId(this.produits[index].depot_id ?? this.LivraisonForm.get('depot_id')?.value);
    this.produits[index].nomenclatureOnly = this.produits[index].nomenclatureOnly || this.isNomenclatureArticleId(article.article_id);
    this.produits[index].isNomenclature = this.isNomenclatureArticleId(article.article_id);
    this.updateLineStockDisponible(index, article.article_id);
    this.syncCompositionParentFromProduct(this.produits[index]);
    this.recalculateTotal(index);
    this.loadNomenclatureForLineIfNeeded(index);
  }

  private updateLineStockDisponible(index: number, articleId: any): void {
    const id = Number(articleId || 0);
    if (!id || !this.produits?.[index]) return;
    this.baseService.getArticleStockDisponible(id).pipe(
      catchError(() => of({ success: false, data: { stock_disponible: 0 } }))
    ).subscribe((response: any) => {
      if (!this.produits?.[index]) return;
      const raw = response?.data?.stock_disponible;
      const n = Number(raw);
      this.produits[index].stock_disponible = Number.isFinite(n) ? n : 0;
    });
  }

  isStockRuptureLine(line: any): boolean {
    if (!line || !Number(line?.article_id || 0)) return false;
    const n = Number(line?.stock_disponible);
    return Number.isFinite(n) && n <= 0;
  }

  private isPrixMissing(value: any): boolean {
    if (value === null || value === undefined || value === '') {
      return true;
    }

    return Number.isNaN(Number(value));
  }

  private escLetter(value: any): string {
    return String(value ?? '-')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  openArticleLetter(index: number): void {
    const line = this.produits?.[index];
    const articleId = Number(line?.article_id || 0);
    if (!articleId) {
      Swal.fire({ icon: 'info', title: 'Article non selectionne', text: 'Veuillez choisir un article d abord.' });
      return;
    }

    if (!Array.isArray(this.produits1) || this.produits1.length === 0) {
      void this.AllProduits()
        .then(() => this.openArticleLetter(index))
        .catch(() => {
          Swal.fire({ icon: 'warning', title: 'Detail indisponible', text: 'Impossible de charger les details article.' });
        });
      return;
    }

    const a = (this.produits1 || []).find((x: any) => Number(x?.article_id) === articleId);
    if (!a) {
      Swal.fire({ icon: 'warning', title: 'Detail indisponible', text: 'Details article non trouves.' });
      return;
    }

    const detail = {
      article_id: a.article_id,
      code: a.article_cod ?? a.Code_Article,
      designation: a.article_nom ?? a.Designation,
      code_barre: a.code_barre,
      famille: a.famille_nom ?? a.famille ?? a.Famille,
      unite: a.unite_nom ?? a.unite ?? a.Unite,
      quantite_unite: a.quantite_unite ?? a.prix_quantite ?? a['Quantite_unite'],
      stock_max: a.stock_max,
      stock_min: a.stock_min,
      perissabilite: a.perissabilite ?? a.Perissabilite,
      etat: a.etat ?? a.etat_article,
      prix_achat: a.prix_achat,
      prix_vente: a.prix_vente,
      depot: a.depot_nom ?? a.Depot
    };

    const item = (icon: string, label: string, value: any, valueStyle: string = '', isRaw: boolean = false) =>
      `<div style="display:grid;grid-template-columns:20px 120px 1fr;gap:8px;align-items:start;padding:6px 0;border-bottom:1px dashed rgba(92,60,28,.22);text-align:left;">
        <span style="color:#6f4420;">${icon}</span>
        <span style="font-weight:700;color:#5b3515;">${this.escLetter(label)}</span>
        <span style="color:#3a2512;word-break:break-word;${valueStyle}">${isRaw ? String(value ?? '-') : this.escLetter(value)}</span>
      </div>`;

    this.baseService.getArticleStockDisponible(articleId).pipe(
      catchError(() => of({ success: false, data: { article_id: articleId, stock_disponible: 0 } }))
    ).subscribe((response: any) => {
      const stockDisponibleRaw = response?.data?.stock_disponible;
      const stockDisponible = Number(stockDisponibleRaw ?? 0);
      const stockDisponiblePositive = Number.isFinite(stockDisponible) && stockDisponible > 0;
      const stockDisponibleColor = stockDisponiblePositive ? '#166534' : '#b91c1c';
      const stockDisponibleDisplay = Number.isFinite(stockDisponible)
        ? String(stockDisponible)
        : this.escLetter(stockDisponibleRaw ?? '-');
      if (this.produits?.[index]) {
        this.produits[index].stock_disponible = Number.isFinite(stockDisponible) ? stockDisponible : 0;
      }
      const ruptureBanner = (!stockDisponiblePositive)
        ? `<div style="margin:0 0 12px;padding:8px 10px;border:1px solid #dc2626;border-radius:8px;background:#fee2e2;color:#991b1b;font-weight:800;text-align:center;">Rupture de stock</div>`
        : '';

      const leftColumn = [
        item('&#9872;', 'ID', detail.article_id),
        item('&#10016;', 'Code', detail.code),
        item('&#9998;', 'Designation', detail.designation),
        item('&#8962;', 'Famille', detail.famille),
        item('&#9878;', 'Unite', detail.unite),
        item('&#8861;', 'Quantite unite', detail.quantite_unite),
        item('&#8703;', 'Etat', detail.etat)
      ].join('');

      const rightColumn = [
        item('&#8759;', 'Code barre', detail.code_barre),
        item('&#8595;', 'Stock min', detail.stock_min, 'color:#b91c1c;font-weight:800;animation:stockMinBlink 1s step-end infinite;'),
        item('&#9733;', 'Stock disponible', `<strong style="color:${stockDisponibleColor};font-weight:900;">${stockDisponibleDisplay}</strong>`, '', true),
        item('&#8593;', 'Stock max', detail.stock_max),
        item('&#9762;', 'Perissabilite', detail.perissabilite),
        item('&#10003;', 'Prix achat', detail.prix_achat),
        item('&#10010;', 'Prix vente', detail.prix_vente),
        item('&#9873;', 'Depot', detail.depot)
      ].join('');

      const editUrl = `/Edit-Produit/${encodeURIComponent(String(detail.article_id ?? ''))}`;

      const html = `
        <style>
          @keyframes stockMinBlink {
            0%, 45% { opacity: 1; }
            46%, 100% { opacity: 0.25; }
          }
        </style>
        <div style="
          position:relative;
          border:1px solid #9c7443;
          border-radius:12px;
          padding:22px 18px 14px;
          background:
            radial-gradient(circle at 12% 16%, rgba(117,74,34,.18) 0, rgba(117,74,34,0) 22%),
            radial-gradient(circle at 86% 78%, rgba(117,74,34,.14) 0, rgba(117,74,34,0) 20%),
            repeating-linear-gradient(-38deg, rgba(114,74,37,.045) 0, rgba(114,74,37,.045) 6px, rgba(114,74,37,.015) 6px, rgba(114,74,37,.015) 12px),
            linear-gradient(180deg,#f3e1be 0%,#ead2a7 100%);
          box-shadow: inset 0 1px 0 rgba(255,248,233,.72), inset 0 0 42px rgba(120,84,48,.12);
          font-family: Palatino Linotype, Bookman Old Style, Garamond, Times New Roman, serif;">
          <div style="
            text-align:center;
            font-size:1.35rem;
            letter-spacing:.11em;
            font-weight:700;
            text-transform:uppercase;
            color:#5f3b17;
            margin-bottom:14px;
            padding-bottom:8px;
            border-bottom:1px solid rgba(90,58,27,.4);">Fiche Article</div>
          ${ruptureBanner}

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div style="border:1px solid rgba(113,73,35,.22);border-radius:8px;padding:8px 10px;background:rgba(255,248,231,.4);">${leftColumn}</div>
            <div style="border:1px solid rgba(113,73,35,.22);border-radius:8px;padding:8px 10px;background:rgba(255,248,231,.4);">${rightColumn}</div>
          </div>

          <div style="display:flex;justify-content:flex-end;gap:10px;margin-top:14px;">
            <a href="${editUrl}" style="text-decoration:none;padding:7px 12px;border-radius:8px;border:1px solid #6d451f;background:#7f5126;color:#f8e9cc;font-weight:700;">Edit Produit</a>
          </div>
        </div>
      `;

      Swal.fire({
        html,
        width: 900,
        background: 'transparent',
        confirmButtonText: 'Fermer',
        customClass: { confirmButton: 'medieval-letter-btn' }
      });
    });
  }

  activerModeEditor() {
    this.mode = 'editor';

    // S'il n'y a pas de ligne s?lectionn?e, on s?lectionne la premi?re par d?faut
    if (this.ligneSelectionnee === null && this.produits.length > 0) {
      this.ligneSelectionnee = 0;
    }
  }

  AllClients(): Promise<void> {
    if (Array.isArray(this.clients) && this.clients.length > 0) {
      return Promise.resolve();
    }
    if (this.clientsLoadingPromise) {
      return this.clientsLoadingPromise;
    }

    this.clientsLoadingPromise = new Promise((resolve, reject) => {
      this.baseService.getClient().subscribe({
        next: (data) => {
        // G?rer diff?rents formats de r?ponse
          let clientsData = data;
          if (data && data.data && Array.isArray(data.data)) {
            clientsData = data.data;
          } else if (data && Array.isArray(data)) {
            clientsData = data;
          } else {
            clientsData = [];
          }

          this.clients = (clientsData || []).filter((client: any) => Number(client?.type) === 1);
          this.filteredClients = [...this.clients];
          this.clientsLoadingPromise = null;
          resolve();
        },
        error: (err) => {
          this.clients = [];
          this.filteredClients = [];
          this.clientsLoadingPromise = null;
          reject(err);
        }
      });
    });

    return this.clientsLoadingPromise;
  }

  onSearchChange(term: string | null | undefined) {
    if ((!Array.isArray(this.clients) || this.clients.length === 0) && term && this.normalizeValue(term).length > 0) {
      void this.AllClients()
        .then(() => this.onSearchChange(term))
        .catch(() => {
          this.filteredClients = [];
        });
      return;
    }

    if (!term || this.normalizeValue(term).length === 0) {
      this.filteredClients = [...this.clients];
      return;
    }

    if (!Array.isArray(this.clients) || this.clients.length === 0) {
      this.filteredClients = [];
      return;
    }

    this.filteredClients = this.clients.filter((client: any) => {
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
    if (!client) {
      return;
    }

    this.LivraisonForm.patchValue({
      clientSearch: client.nom,
      part_id: client.part_id ?? client.id ?? 0 // certains retours API utilisent id
    }, { emitEvent: false });
    this.livraison = {
      ...this.livraison,
      client: client.nom || this.livraison.client,
      adresse: client.adresse || this.livraison.adresse
    };
    this.info = {
      ...(this.info || {}),
      nom: client.nom || this.info?.nom,
      adresse: client.adresse || this.info?.adresse,
      telephone: client.telephone || this.info?.telephone,
      email: client.email || this.info?.email,
      ice: client.ice || this.info?.ice
    };
    this.filteredClients = [];
    this.searchTerm = client.nom; // facultatif si tu veux garder cette variable
    const selectedPartId = Number(client.part_id ?? client.id ?? 0);
    if (selectedPartId) {
      this.checkClientExoneration(selectedPartId);
    } else {
      this.isClientExonerated = false;
      this.calculerTotaux();
    }
  }
  get clientSearchControl() {
    return this.LivraisonForm.get('clientSearch') as FormControl;
  }

  AllCommerciaux(): Promise<void> {
    if (Array.isArray(this.commerciaux) && this.commerciaux.length > 0) {
      return Promise.resolve();
    }
    if (this.commerciauxLoadingPromise) {
      return this.commerciauxLoadingPromise;
    }

    this.commerciauxLoadingPromise = new Promise((resolve, reject) => {
      this.baseService.getCommercial().subscribe({
        next: (data) => {
        // G?rer diff?rents formats de r?ponse
          let commerciauxData = data;
          if (data && data.data && Array.isArray(data.data)) {
            commerciauxData = data.data;
          } else if (data && Array.isArray(data)) {
            commerciauxData = data;
          } else {
            commerciauxData = [];
          }

          this.commerciaux = commerciauxData;
          this.filteredCommerciaux = [...this.commerciaux];
          this.commerciauxLoadingPromise = null;
          resolve();
        },
        error: (err) => {
          this.commerciaux = [];
          this.filteredCommerciaux = [];
          this.commerciauxLoadingPromise = null;
          reject(err);
        }
      });
    });

    return this.commerciauxLoadingPromise;
  }

  onCommercialSearchChange(term: string | null | undefined) {
    if ((!Array.isArray(this.commerciaux) || this.commerciaux.length === 0) && term && this.normalizeValue(term).length > 0) {
      void this.AllCommerciaux()
        .then(() => this.onCommercialSearchChange(term))
        .catch(() => {
          this.filteredCommerciaux = [];
        });
      return;
    }

    if (!term || this.normalizeValue(term).length === 0) {
      this.filteredCommerciaux = [...this.commerciaux];
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

  private loadDepots(): Promise<void> {
    if (Array.isArray(this.depots) && this.depots.length > 0) {
      return Promise.resolve();
    }
    if (this.depotsLoadingPromise) {
      return this.depotsLoadingPromise;
    }

    this.depotsLoadingPromise = new Promise((resolve, reject) => {
      this.baseService.getDepots().subscribe({
        next: (data: any) => {
          const depotsData = data?.data || (Array.isArray(data) ? data : []);
          this.depots = Array.isArray(depotsData) ? depotsData : [];
          this.depotsLoadingPromise = null;
          resolve();
        },
        error: (err: any) => {
          this.depots = [];
          this.depotsLoadingPromise = null;
          reject(err);
        }
      });
    });

    return this.depotsLoadingPromise;
  }

  selectCommercial(com: any) {
    if (!com) {
      return;
    }

    this.LivraisonForm.patchValue({
      commercialSearch: com.nom,
      contact_id: com.id // ou com.id selon ta structure
    }, { emitEvent: false });
    this.filteredCommerciaux = [];
    this.searchCommercial = com.nom; // facultatif
  }
  get commercialSearchControl() {
    return this.LivraisonForm.get('commercialSearch') as FormControl;
  }

  enregistrerTout(): void {
    const lignesAModifier: any[] = [];
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    const headerDepotId = this.normalizeDepotId(this.LivraisonForm.get('depot_id')?.value);
    this.resequenceProduitLignes();
    if (!headerDepotId) {
      this.LivraisonForm.get('depot_id')?.markAsTouched();
      Swal.fire({
        icon: 'warning',
        title: 'Depot obligatoire',
        text: 'Veuillez selectionner un depot en en-tete.'
      });
      return;
    }

    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      const desiredTax = this.isClientExonerated ? 0 : this.normalizeTaxeValue(p.taxe);

      // V?rifie si la ligne est incompl?te
      if (!p.article_id || this.isPrixMissing(p.pu) || !p.qte) {
        Swal.fire({
          icon: 'error',
          title: 'Ligne invalide',
          html: `Erreur La ligne <strong>${i + 1}</strong> est incomplète (article, prix ou quantité manquants).`,
        });
        return;
      }

      const lineDepotId = this.normalizeDepotId(p.depot_id);
      if (!lineDepotId) {
        Swal.fire({
          icon: 'warning',
          title: 'Depot obligatoire',
          text: `Veuillez selectionner un depot pour la ligne ${i + 1}.`
        });
        return;
      }

      const pOriginal = this.produitsOriginal[i];

      if (!pOriginal) {
        // Nouvelle ligne
        // const taxeValue = Math.min(+p.taxe, 100);
        const ligneAInserer: any = {
          article_id: p.article_id,
          designation: p.designation,
          pu: p.pu,
          qte: p.qte,
          tva: desiredTax,
          ligne: i + 1,
          depot_id: lineDepotId,
          document_id,
          update_mode: 'I'
        };

        if (p.reducMode === 'pourcentage') {
          // p.reduc est en pourcentage (10), on doit le convertir en d?cimal (0.1) pour la base de donn?es
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          ligneAInserer.remise = reducValue / 100; // Ex. 10 => 0.1
          ligneAInserer.remise_montant = null; // Doit ?tre null pour le mode pourcentage
        } else {
          // p.reduc est d?j? en montant (dh)
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          ligneAInserer.remise_montant = reducValue;
          ligneAInserer.remise = null; // Doit ?tre null pour le mode montant
        }

        lignesAModifier.push(ligneAInserer);

        continue;
      }

      // V?rifie si la ligne a ?t? modifi?e

      const modifie = (
        p.id !== pOriginal.id ||
        p.designation !== pOriginal.designation ||
        p.article_id !== pOriginal.article_id ||
        p.pu !== pOriginal.pu ||
        p.qte !== pOriginal.qte ||
        p.reduc !== pOriginal.reduc ||
        p.reducMode !== pOriginal.reducMode ||
        (Number(p.ligne || 0) || (i + 1)) !== (Number(pOriginal.ligne || 0) || (i + 1)) ||
        desiredTax !== this.normalizeTaxeValue(pOriginal?.taxe) ||
        lineDepotId !== this.normalizeDepotId(pOriginal.depot_id)
      );

      if (modifie) {
        //const taxeValue = Math.min(+p.taxe, 100);
        const ligneAEnvoyer: any = {
          id: p.id,
          article_id: p.article_id,
          designation: p.designation,
          pu: p.pu,
          qte: p.qte,
          tva: desiredTax,
          ligne: i + 1,
          depot_id: lineDepotId,
          document_id,
          update_mode: 'U',
        };

        if (p.reducMode === 'pourcentage') {
          // p.reduc est en pourcentage (10), on doit le convertir en d?cimal (0.1) pour la base de donn?es
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          ligneAEnvoyer.remise = reducValue / 100; // Ex. 10 => 0.1
          ligneAEnvoyer.remise_montant = null; // Par s?curit? - doit ?tre null pour le mode pourcentage
        } else {
          // p.reduc est d?j? en montant (dh)
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          ligneAEnvoyer.remise_montant = reducValue;
          ligneAEnvoyer.remise = null; // Par s?curit? - doit ?tre null pour le mode montant
        }

        lignesAModifier.push(ligneAEnvoyer);

      }
    }

    if (lignesAModifier.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Aucune modification',
        text: 'Aucune ligne modifiee ou ajoutee.',
      });
      return;
    }

    // Envoi des lignes modifiees ou nouvelles vers l'API
    this.saveProduitsLoading = true;
    this.venteSerivce.SaveLignesDetailLivraison(lignesAModifier).subscribe({
      next: () => {
        this.venteSerivce.getLivraisonById(document_id).subscribe({
          next: (refreshRes: any) => {
            this.saveProduitsLoading = false;
            this.processLivraisonData(refreshRes);
            Swal.fire({
              icon: 'success',
              title: 'Enregistrement reussi',
              text: "OK " + lignesAModifier.length + " ligne(s) enregistree(s) avec succes.",
            });
          },
          error: () => {
            this.saveProduitsLoading = false;
            this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
            Swal.fire({
              icon: 'success',
              title: 'Enregistrement reussi',
              text: "OK " + lignesAModifier.length + " ligne(s) enregistree(s) avec succes.",
            });
          }
        });
      },
      error: (err) => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: "Erreur Une erreur est survenue lors de l'enregistrement.",
        });
      }
    });
  }

  saveInfo() {

    const docId = +this.route.snapshot.paramMap.get('document_id')!;
    this.selectedInfo.document_id = docId.toString();
    if (!this.selectedInfo.document_id) {
      return;
    }

    this.venteSerivce.SaveLignesInfoLivraison(this.selectedInfo).subscribe({
      next: (res: { message: string }) => {
        this.showNotification(res.message, false);
      },
      error: (err: any) => {
        this.showNotification(err.message, true);
      }
    });
  }

  showNotification(message: string, isError: boolean = false) {
    this.successMessage = message;
    this.isError = isError;

    setTimeout(() => {
      this.successMessage = null;
    }, 5000);
  }

  ouvrirPopupEmail() {
    const modal = new bootstrap.Modal(document.getElementById('emailModal'));
    modal.show();
  }

  envoyerEmail() {
    if (this.emailForm.invalid) return;

    this.isSending = true; // affiche le spinner

    const formData = {
      ...this.emailForm.value,
      document_id: +this.route.snapshot.paramMap.get('document_id')!
    };

    // Affiche le spinner
    Swal.fire({
      title: 'Envoi en cours...',
      html: '<div class="loading-spinner"></div><p>Veuillez patienter</p>',
      showConfirmButton: false,
      allowOutsideClick: false
    });

    this.emailService.envoyerDevis(formData).subscribe({
      next: res => {
        Swal.fire({
          icon: 'success',
          title: 'E-mail envoye !',
          text: 'La livraison a ete envoyee avec succes.',
          timer: 3000,
          showConfirmButton: false
        });

        // Fermer la modale Bootstrap
        bootstrap.Modal.getInstance(document.getElementById('emailModal')).hide();
      },
      error: err => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: "Echec de l'envoi de l'e-mail."
        });
      }
    });
  }

  // Dans votre service Angular, ajoutez :

  // Dans votre composant, remplacez envoyerWhatsApp par :
  envoyerWhatsApp(livraison: any) {
    const numero = prompt('Entrez le numéro WhatsApp du client (ex: 212612345678):');
    if (!numero) return;

    // Nettoyer le num?ro
    let numeroNettoye = numero.replace(/\D/g, '');
    if (numeroNettoye.startsWith('0')) {
      numeroNettoye = '212' + numeroNettoye.substring(1);
    } else if (!numeroNettoye.startsWith('212')) {
      numeroNettoye = '212' + numeroNettoye;
    }

    if (numeroNettoye.length < 12) {
      alert('Numéro de téléphone invalide');
      return;
    }

    const messagePersonnalise = prompt('Message personnalisé (optionnel):') || 'Votre bon de livraison en pièce jointe';

    // Loader
    const loadingElement = document.createElement('div');
    loadingElement.innerHTML = 'Envoi du PDF via WhatsApp...';
    loadingElement.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:1px solid #ccc;border-radius:5px;z-index:9999;';
    document.body.appendChild(loadingElement);

    this.emailService.sendDevisWhatsAppPDF(
      this.route.snapshot.paramMap.get('document_id')!,
      numeroNettoye,
      messagePersonnalise
    ).subscribe({
      next: (res) => {
        document.body.removeChild(loadingElement);

        if (res.success) {
          alert('OK PDF envoyé en pièce jointe via WhatsApp !');
        } else {
          alert('Erreur Erreur: ' + res.message);
        }
      },
      error: (err) => {
        if (document.body.contains(loadingElement)) {
          document.body.removeChild(loadingElement);
        }
        alert('Erreur Erreur: ' + (err.error?.message || err.message));
      }
    });
  }

  voirLivraison(withStamp: boolean = false) {
    const id = this.route.snapshot.paramMap.get('document_id');
    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }

    // V?rifier s'il y a des modifications non enregistr?es
    const hasModifications = this.checkForModifications();

    if (hasModifications) {
      // Enregistrer d'abord, puis g?n?rer le PDF (mode normal par d?faut)
      this.enregistrerEtGenererPDF(id, 'normal');
    } else {
      // Pas de modifications, g?n?rer directement le PDF (mode normal par d?faut)
      this.genererPDF(id, 'normal');
    }
  }

  // V?rifie s'il y a des modifications non enregistr?es
  private checkForModifications(): boolean {
    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      const pOriginal = this.produitsOriginal[i];

      if (!pOriginal) return true; // Nouvelle ligne

      const modifie = (
        p.id !== pOriginal.id ||
        p.designation !== pOriginal.designation ||
        p.article_id !== pOriginal.article_id ||
        p.pu !== pOriginal.pu ||
        p.qte !== pOriginal.qte ||
        p.reduc !== pOriginal.reduc ||
        p.reducMode !== pOriginal.reducMode ||
        (Number(p.ligne || 0) || (i + 1)) !== (Number(pOriginal.ligne || 0) || (i + 1)) ||
        this.normalizeTaxeValue(p.taxe) !== this.normalizeTaxeValue(pOriginal?.taxe) ||
        this.normalizeDepotId(p.depot_id) !== this.normalizeDepotId(pOriginal.depot_id)
      );

      if (modifie) return true;
    }
    return false;
  }

  private persistLivraisonChanges(documentId: string, onSuccess: () => void): void {
    const lignesAModifier: any[] = [];
    const document_id = +documentId;
    const headerDepotId = this.normalizeDepotId(this.LivraisonForm.get('depot_id')?.value);
    this.resequenceProduitLignes();
    if (!headerDepotId) {
      this.LivraisonForm.get('depot_id')?.markAsTouched();
      Swal.fire({
        icon: 'warning',
        title: 'Depot obligatoire',
        text: 'Veuillez selectionner un depot en en-tete.'
      });
      return;
    }

    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      const desiredTax = this.isClientExonerated ? 0 : this.normalizeTaxeValue(p.taxe);

      if (!p.article_id || this.isPrixMissing(p.pu) || !p.qte) {
        Swal.fire({
          icon: 'error',
          title: 'Ligne invalide',
          html: `Erreur La ligne <strong>${i + 1}</strong> est incomplète. Veuillez compléter avant d'imprimer.`,
        });
        return;
      }

      const lineDepotId = this.normalizeDepotId(p.depot_id);
      if (!lineDepotId) {
        Swal.fire({
          icon: 'warning',
          title: 'Depot obligatoire',
          text: `Veuillez selectionner un depot pour la ligne ${i + 1}.`
        });
        return;
      }

      const pOriginal = this.produitsOriginal[i];

      if (!pOriginal) {
        const ligneAInserer: any = {
          article_id: p.article_id,
          designation: p.designation,
          pu: p.pu,
          qte: p.qte,
          tva: desiredTax,
          ligne: i + 1,
          depot_id: lineDepotId,
          document_id,
          update_mode: 'I'
        };

        if (p.reducMode === 'pourcentage') {
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          ligneAInserer.remise = reducValue / 100;
          ligneAInserer.remise_montant = null;
        } else {
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          ligneAInserer.remise_montant = reducValue;
          ligneAInserer.remise = null;
        }

        lignesAModifier.push(ligneAInserer);
        continue;
      }

      const modifie = (
        p.id !== pOriginal.id ||
        p.designation !== pOriginal.designation ||
        p.article_id !== pOriginal.article_id ||
        p.pu !== pOriginal.pu ||
        p.qte !== pOriginal.qte ||
        p.reduc !== pOriginal.reduc ||
        p.reducMode !== pOriginal.reducMode ||
        (Number(p.ligne || 0) || (i + 1)) !== (Number(pOriginal.ligne || 0) || (i + 1)) ||
        desiredTax !== this.normalizeTaxeValue(pOriginal?.taxe) ||
        lineDepotId !== this.normalizeDepotId(pOriginal.depot_id)
      );

      if (modifie) {
        const ligneAEnvoyer: any = {
          id: p.id,
          article_id: p.article_id,
          designation: p.designation,
          pu: p.pu,
          qte: p.qte,
          tva: desiredTax,
          ligne: i + 1,
          depot_id: lineDepotId,
          document_id,
          update_mode: 'U',
        };

        if (p.reducMode === 'pourcentage') {
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          ligneAEnvoyer.remise = reducValue / 100;
          ligneAEnvoyer.remise_montant = null;
        } else {
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          ligneAEnvoyer.remise_montant = reducValue;
          ligneAEnvoyer.remise = null;
        }

        lignesAModifier.push(ligneAEnvoyer);
      }
    }

    if (lignesAModifier.length === 0) {
      onSuccess();
      return;
    }

    this.venteSerivce.SaveLignesDetailLivraison(lignesAModifier).subscribe({
      next: (res) => {
        this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
        this.showNotification('OK Modifications enregistrées', false);
        onSuccess();
      },
      error: (err) => {
        this.saveProduitsLoading = false;
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: "Erreur Impossible d'enregistrer les modifications avant l'impression.",
        });
      }
    });
  }

  private imprimerCompositionApresSauvegarde(documentId: string): void {
    this.persistComposition(+documentId, {
      showSuccess: false,
      refreshAfterSuccess: false,
      onSuccess: () => this.genererPDF(documentId, 'composition')
    });
  }

  // Enregistre les modifications puis g?n?re le PDF
  private enregistrerEtGenererPDF(documentId: string, printMode: 'normal' | 'non_valorise' | 'composition' = 'normal'): void {
    this.persistLivraisonChanges(documentId, () => {
      if (printMode === 'composition') {
        this.imprimerCompositionApresSauvegarde(documentId);
        return;
      }

      this.genererPDF(documentId, printMode);
    });
  }

  // G?n?re le PDF
  private genererPDF(documentId: string, printMode: 'normal' | 'non_valorise' | 'composition' = 'normal'): void {
    Swal.fire({
      title: 'Generation du PDF',
      text: 'Veuillez patienter...',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });

    this.emailService.generateDevisPDF(documentId, { printMode, forceDocumentType: 'LIVRAISON' }).subscribe({
      next: (res) => {
        Swal.close();
        const url = res?.pdfUrl;
        if (url) {
          window.open(url, '_blank');
        } else {
          Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reçu.' });
        }
      },
      error: (err) => {
        Swal.close();
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la génération du PDF." });
      }
    });
  }

  // Imprimer PDF en mode normal (BL normal)
  imprimerPdfNormal(): void {
    const id = this.route.snapshot.paramMap.get('document_id');
    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }

    // V?rifier s'il y a des modifications non enregistr?es
    const hasModifications = this.checkForModifications();

    if (hasModifications) {
      // Enregistrer d'abord, puis g?n?rer le PDF
      this.enregistrerEtGenererPDF(id, 'normal');
    } else {
      // Pas de modifications, g?n?rer directement le PDF
      this.genererPDF(id, 'normal');
    }
  }

  // Imprimer PDF en mode non valoris? (BL non valoris?)
  imprimerPdfNonValorise(): void {
    const id = this.route.snapshot.paramMap.get('document_id');
    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }

    // V?rifier s'il y a des modifications non enregistr?es
    const hasModifications = this.checkForModifications();

    if (hasModifications) {
      // Enregistrer d'abord, puis g?n?rer le PDF
      this.enregistrerEtGenererPDF(id, 'non_valorise');
    } else {
      // Pas de modifications, g?n?rer directement le PDF
      this.genererPDF(id, 'non_valorise');
    }
  }

  imprimerPdfComposition(): void {
    const id = this.route.snapshot.paramMap.get('document_id');
    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }

    const hasModifications = this.checkForModifications();

    if (hasModifications) {
      this.enregistrerEtGenererPDF(id, 'composition');
      return;
    }

    this.imprimerCompositionApresSauvegarde(id);
  }
}
