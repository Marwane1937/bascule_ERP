import { ChangeDetectorRef, Component, HostListener, OnInit } from '@angular/core';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import Quill from 'quill';
import Swal from 'sweetalert2';
import { EmailService } from 'src/app/service/email.service';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, retry, switchMap } from 'rxjs/operators';
const QuillMention = require('quill-mention');
declare var bootstrap: any;
Quill.register('modules/mention', QuillMention.default); // ajoute .default ici

interface CommandeNomenclatureNode {
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
  children: CommandeNomenclatureNode[];
}

@Component({
  selector: 'app-editcommande',
  templateUrl: './editcommande.component.html',
  styleUrls: ['./editcommande.component.css']
})
export class EditcommandeComponent implements OnInit {
  produits1: any[] = [];
  produitsNomenclature: any[] = [];
  editFacturation = false;
  mode: 'editor' | 'table' = 'table'; // OK mode TABLE par d?faut
  ligneSelectionnee: number | null = null; // OK ligne actuellement s?lectionn?e pour ?dition
  modules: any = {}; // Quill modules ici
  editInfos = false;
  CommandeForm!: FormGroup;
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
  numeroCommande: string = 'BC25-0001'; // Num?ro par d?faut
  detailsColumnWidth = '520px';
  private resizingDetailsColumn = false;
  private detailsResizeStartX = 0;
  private detailsResizeStartWidth = 460;

  commande = {
    client: 'Nom du client',
    commercial: 'Nom du commercial',
    adresse: 'Adresse du client',
    date: '',
    description: 'Description de la commande',
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
    stock_disponible: null as number | null,
    nomenclatureOnly: false,
    isNomenclature: false,
    nomenclatureComponents: [] as CommandeNomenclatureNode[],
    nomenclatureLoading: false,
    nomenclatureError: '',
    nomenclatureTotal: 0
  }]

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
  isClientExonerated = false; // m?me logique que edit-devis
  private exoCheckToken = 0;

  constructor(private baseService: BaseService, private fb: FormBuilder, private route: ActivatedRoute,
    private venteSerivce: VentesService, private emailService: EmailService,
    private cdr: ChangeDetectorRef
  ) {
    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      cc: [''],
      subject: ['Commande ? votre attention'],
      body: ['Bonjour,\n\nVeuillez trouver ci-joint la commande demand?e.\n\nCordialement,']
    });
  }

  ngOnInit(): void {
    this.modules = {};
    this.initForm();
    
      const id = +this.route.snapshot.paramMap.get('document_id')!;
    
    // Charger toutes les donn?es en parall?le pour acc?l?rer le chargement
    forkJoin({
      produits: this.baseService.getProduit(),
      produitsNomenclature: this.baseService.getProduitsNomenclature().pipe(catchError(() => of({ data: [] }))),
      clients: this.baseService.getClient(),
      commerciaux: this.baseService.getCommercial(),
      depots: this.baseService.getDepots(),
      commande: this.venteSerivce.getCommandeById(id)
    }).subscribe({
      next: (data) => {
        // Traitement des produits
        let produitsData = data.produits;
        if (data.produits && data.produits.data && Array.isArray(data.produits.data)) {
          produitsData = data.produits.data;
        } else if (data.produits && Array.isArray(data.produits)) {
          produitsData = data.produits;
        } else {
          produitsData = [];
        }
        this.produits1 = produitsData;
        this.configureQuillModules();

        const nomenclatureData = data.produitsNomenclature?.data || data.produitsNomenclature || [];
        this.produitsNomenclature = Array.isArray(nomenclatureData) ? nomenclatureData : [];
        
        // Traitement des clients
        let clientsData = data.clients;
        if (data.clients && data.clients.data && Array.isArray(data.clients.data)) {
          clientsData = data.clients.data;
        } else if (data.clients && Array.isArray(data.clients)) {
          clientsData = data.clients;
        } else {
          clientsData = [];
        }
        this.clients = (clientsData || []).filter((client: any) => Number(client?.type) === 1);
        this.filteredClients = [...this.clients];
        
        // Traitement des commerciaux
        let commerciauxData = data.commerciaux;
        if (data.commerciaux && data.commerciaux.data && Array.isArray(data.commerciaux.data)) {
          commerciauxData = data.commerciaux.data;
        } else if (data.commerciaux && Array.isArray(data.commerciaux)) {
          commerciauxData = data.commerciaux;
        } else {
          commerciauxData = [];
        }
        this.commerciaux = commerciauxData;
        this.filteredCommerciaux = [...this.commerciaux];

        // Traitement des depots
        const depotsData = data.depots?.data || (Array.isArray(data.depots) ? data.depots : []);
        this.depots = Array.isArray(depotsData) ? depotsData : [];
        
        // Traitement de la commande
        this.processCommandeData(data.commande, id);
      },
      error: (err) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors du chargement des donn?es.' });
      }
    });
    
    // Abonnements sur les changements de texte
    this.CommandeForm.get('clientSearch')?.valueChanges.subscribe(value => {
      this.onSearchChange(value);
    });

    this.CommandeForm.get('commercialSearch')?.valueChanges.subscribe(value => {
      this.onCommercialSearchChange(value);
    });
    
    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      cc: [''],
      subject: ['', Validators.required],
      body: ['', Validators.required]
    });
  }

  private toDateTimeLocal(value: any): string {
    if (!value) return '';
    const source = typeof value === 'string' ? value.trim() : value;
    const date = source instanceof Date ? source : new Date(source);
    if (!isNaN(date.getTime())) {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    const raw = String(value);
    return raw.replace(' ', 'T').slice(0, 16);
  }

  private getCurrentDateTimeLocal(): string {
    return this.toDateTimeLocal(new Date());
  }

  // Traitement des donn?es de la commande apr?s chargement parall?le
  private processCommandeData(response: any, id: number): void {
        const data = response?.data || response;

        if (!data) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'Commande introuvable.' });
          return;
        }

        this.numeroCommande = data.numero || 'BC25-0001';

    const clientTrouve = this.clients?.find((c: any) => +c.part_id === +data.part_id);
    const commercialTrouve = this.commerciaux?.find((c: any) => +c.id === +data.contact_id);

          this.commande = {
            client: clientTrouve ? clientTrouve.nom : 'Client inconnu',
            commercial: commercialTrouve ? commercialTrouve.nom : 'Commercial inconnu',
            adresse: clientTrouve ? clientTrouve.adresse : '',
            date: this.toDateTimeLocal(data.date),
            description: data.description || '',
            depot_nom: data.depot_nom || ''
          };

          this.CommandeForm.patchValue({
      date: this.toDateTimeLocal(data.date),
      description: data.description,
      part_id: data.part_id,
      contact_id: data.contact_id,
      depot_id: data.depot_id ? Number(data.depot_id) : null,
            clientSearch: clientTrouve ? clientTrouve.nom : '',
            commercialSearch: commercialTrouve ? commercialTrouve.nom : ''
          });

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
          const mappedProduits = data.details.map((detail: any, index: number) => {
            const produitTrouve = this.produits1.find(p => +p.article_id === +detail.article_id);
            const produitNomenclatureTrouve = this.produitsNomenclature.find(p => +p.article_id === +detail.article_id);

            let reduc = 0;
            let reducMode = 'montant';

            if (detail.remise_montant != null && detail.remise_montant !== undefined) {
              reduc = +detail.remise_montant;
              reducMode = 'montant';
            } else if (detail.remise != null && detail.remise !== undefined) {
              reduc = +detail.remise * 100;
              reducMode = 'pourcentage';
            }

            const base = +detail.prix * +detail.quantite;
        let reductionMontant = reducMode === 'pourcentage' ? (reduc / 100) * base : reduc;
        const totalLigne = Math.max(0, base - reductionMontant);

            return {
              id: detail.id,
              ligne: Number(detail.ligne || 0) || (index + 1),
              article_id: detail.article_id,
              designation: detail.designation,
              pu: +detail.prix,
              qte: +detail.quantite,
              reduc: reduc,
              reducMode: reducMode,
              taxe: this.normalizeTaxeValue(detail.taux_tva != null && detail.taux_tva !== undefined ? +detail.taux_tva : 0.2),
              total: totalLigne,
              type: Number(detail.type ?? detail.ligne_type ?? detail.detail_type ?? 0) || 0,
              articleSearch: produitTrouve?.article_nom || produitNomenclatureTrouve?.article_nom || detail.designation || '',
              nomenclatureOnly: !!produitNomenclatureTrouve,
              isNomenclature: !!produitNomenclatureTrouve,
              nomenclatureComponents: [],
              nomenclatureLoading: false,
              nomenclatureError: '',
              nomenclatureTotal: 0,
              nomenclatureFromPersistedRows: false
            };
          });
          this.produits = this.attachPersistedNomenclatureRows(mappedProduits);
        }

    // Traitement des infos client
        if (!data.Infos || !Array.isArray(data.Infos) || data.Infos.length === 0) {
      this.info = { nom: '', adresse: '', telephone: '', email: '', ice: '' };
        } else {
          this.info = {
            nom: data.Infos[0]?.nom || '',
            adresse: data.Infos[0]?.adresse || '',
            telephone: data.Infos[0]?.telephone || '',
            email: data.Infos[0]?.email || '',
            ice: data.Infos[0]?.ice || ''
          };
        }

    // Traitement des conditions
        if (!data.condition || !Array.isArray(data.condition) || data.condition.length === 0) {
          this.selectedInfo = {
            document_id: id.toString(),
            date: this.toDateTimeLocal(data.date) || this.getCurrentDateTimeLocal(),
            condition: '',
            expedition: '',
            transporteur: ''
          };
        } else {
          this.selectedInfo = {
            document_id: data.condition[0]?.document_id || id.toString(),
            date: data.condition[0]?.date || data.date || '',
            condition: data.condition[0]?.condition || '',
            expedition: data.condition[0]?.expedition || '',
            transporteur: data.condition[0]?.transporteur || ''
          };
        }

        this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
        this.produits.forEach((_, i) => {
          this.recalculateTotal(i);
          this.loadNomenclatureForLineIfNeeded(i);
        });
  }

  initForm(): void {
    this.CommandeForm = this.fb.group({
      date: [this.getCurrentDateTimeLocal(), Validators.required],
      description: [''],
      part_id: [0],
      contact_id: [0],
      depot_id: [null, Validators.required],
      date_fin: [''],
      etat: [1],
      clientSearch: [''],
      commercialSearch: ['']
    });
  }

  toggleEdit(): void {
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    if (!this.editInfos) {
      this.editInfos = true;
      return;
    }

    const depotId = Number(this.CommandeForm.value?.depot_id || 0);
    if (!depotId) {
      this.CommandeForm.get('depot_id')?.markAsTouched();
      Swal.fire({
        icon: 'warning',
        title: 'Depot obligatoire',
        text: 'Veuillez selectionner un depot avant de valider la commande.'
      });
      return;
    }

    this.editInfos = false;
    const payload = {
      ...this.CommandeForm.value,
      depot_id: depotId
    };
    this.venteSerivce.updateCommande(document_id, payload).subscribe({
      next: (res) => {
        this.info = {
          nom: res.client_infos.nom,
          adresse: res.client_infos.adresse,
          telephone: res.client_infos.telephone,
          email: res.client_infos.email,
          ice: res.client_infos.ice
        };
      },
      error: (err) => {
      }
    });
  }

  getDepotLabel(): string {
    const depotId = Number(this.CommandeForm.get('depot_id')?.value || 0);
    if (!depotId) {
      return (this.commande as any)?.depot_nom || '-';
    }
    const depot = (this.depots || []).find((d: any) => Number(d?.id) === depotId);
    return depot?.nom || (this.commande as any)?.depot_nom || '-';
  }

  AllProduits(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.baseService.getProduit().subscribe({
        next: (data: any) => {
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
          this.configureQuillModules();
          resolve();
        },
        error: (error) => {
          this.produits1 = [];
          reject(error);
        }
      });
    });
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

  normalizeProduitPrice(index: number): void {
    const produit = this.produits[index];
    if (!produit) {
      return;
    }

    produit.pu = this.normalizePriceValue(produit.pu);
    this.recalculateTotal(index);
  }

  recalculateTotal(index: number) {
    const prod = this.produits[index];
    const normalizedPu = this.normalizePriceValue(prod.pu);
    const base = normalizedPu * prod.qte;

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
      nomenclatureOnly: false,
      isNomenclature: false,
      nomenclatureComponents: [],
      nomenclatureLoading: false,
      nomenclatureError: '',
      nomenclatureTotal: 0
    });
    const newIndex = this.produits.length - 1;
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
      nomenclatureOnly: true,
      isNomenclature: true,
      nomenclatureComponents: [],
      nomenclatureLoading: false,
      nomenclatureError: '',
      nomenclatureTotal: 0
    });
    const newIndex = this.produits.length - 1;
    this.recalculateTotal(newIndex);
  }

  removeProduit(index: number) {
    const produit = this.produits[index];

    // Si l'?l?ment a un ID, on le garde pour suppression backend
    if (produit.id) {
      this.produitsSupprimes.push(produit.id);

      this.venteSerivce.RemoveDetailLigne(this.produitsSupprimes).subscribe({
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
    this.produits.splice(index, 1);
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
          taxe: String(desiredTax),
          ligne: index + 1,
          document_id,
          update_mode: 'U'
        };

        if (p.reducMode === 'pourcentage') {
          payload.remise = p.reduc / 100;
          payload.remise_montant = null;
        } else {
          payload.remise_montant = p.reduc;
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

    this.venteSerivce.SaveLignesDetailDevis(lignesOrdre).subscribe({
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
    this.detailsResizeStartWidth = headerEl?.offsetWidth || parseInt(this.detailsColumnWidth, 10) || 520;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  @HostListener('document:mousemove', ['$event'])
  onDocumentMouseMove(event: MouseEvent): void {
    if (!this.resizingDetailsColumn) {
      return;
    }

    const delta = event.clientX - this.detailsResizeStartX;
    const nextWidth = Math.max(420, Math.min(860, this.detailsResizeStartWidth + delta));
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

    // V?rifier que produits1 est charg?
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
    this.produits[index].pu = article.pu || article.prix_vente || 0;
    this.produits[index].qte = 1;
    this.produits[index].reduc = 0;
    this.produits[index].taxe = this.normalizeTaxeValue(article.taxe ?? 0.2);
    this.updateLineStockDisponible(index, article.article_id);
    this.recalculateTotal(index);
    this.loadNomenclatureForLineIfNeeded(index);
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
        const articleCode = String(article?.article_cod || '').toLowerCase();
        return articleNom.includes(term) || articleCode.includes(term);
      })
      .slice(0, 50);
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

  private buildNomenclatureNode(line: any, parentQuantity: number): CommandeNomenclatureNode {
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
      code: productInfo?.article_cod || line?.composant_cod || '',
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
  ): Observable<CommandeNomenclatureNode[]> {
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

        const nodeRequests: Observable<CommandeNomenclatureNode>[] = rows.map((line: any) => {
          const node = this.buildNomenclatureNode(line, parentQuantity);
          if (!node.article_id || depth >= 4 || nextVisited.has(node.article_id) || !this.isNomenclatureArticleId(node.article_id)) {
            return of(node);
          }

          return this.buildNomenclatureNodes(node.article_id, node.quantiteTotale, depth + 1, nextVisited).pipe(
            map((children: CommandeNomenclatureNode[]) => ({
              ...node,
              children
            }))
          );
        });

        return forkJoin(nodeRequests);
      })
    );
  }

  private loadNomenclatureForLineIfNeeded(index: number): void {
    const line = this.produits?.[index];
    const articleId = Number(line?.article_id || 0);

    if (!line || !articleId || !this.isNomenclatureArticleId(articleId)) {
      if (line?.nomenclatureFromPersistedRows && this.hasNomenclatureComponents(line)) {
        line.isNomenclature = true;
        line.nomenclatureOnly = true;
        this.updateNomenclatureDisplayTotals(line);
        return;
      }
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

    line.isNomenclature = true;
    line.nomenclatureOnly = true;
    line.nomenclatureLoading = true;
    line.nomenclatureError = '';
    line.nomenclatureComponents = [];
    line.nomenclatureTotal = 0;

    const lineRef = line;
    const quantity = this.normalizeQuantityValue(line.qte) || 1;
    this.buildNomenclatureNodes(articleId, quantity).subscribe({
      next: (nodes: CommandeNomenclatureNode[]) => {
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

  private updateNomenclatureNodeTotals(nodes: CommandeNomenclatureNode[], parentQuantity: number): void {
    nodes.forEach((node: CommandeNomenclatureNode) => {
      node.quantiteTotale = this.normalizeQuantityValue(node.quantite) * parentQuantity;
      node.total = this.normalizePriceValue(node.prix) * node.quantiteTotale;
      if (Array.isArray(node.children) && node.children.length > 0) {
        this.updateNomenclatureNodeTotals(node.children, node.quantiteTotale);
      }
    });
  }

  private sumNomenclatureNodes(nodes: CommandeNomenclatureNode[]): number {
    return nodes.reduce((total: number, node: CommandeNomenclatureNode) => {
      const childrenTotal = Array.isArray(node.children) && node.children.length > 0
        ? this.sumNomenclatureNodes(node.children)
        : 0;
      return total + this.normalizePriceValue(node.total) + childrenTotal;
    }, 0);
  }

  private isPersistedNomenclatureLine(line: any): boolean {
    return Number(line?.type ?? line?.ligne_type ?? line?.detail_type ?? 0) === 1;
  }

  private buildPersistedNomenclatureNode(line: any, parentLine: any): CommandeNomenclatureNode {
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

  private flattenNomenclatureNodes(nodes: CommandeNomenclatureNode[]): CommandeNomenclatureNode[] {
    const result: CommandeNomenclatureNode[] = [];
    (Array.isArray(nodes) ? nodes : []).forEach((node: CommandeNomenclatureNode) => {
      result.push(node);
      if (Array.isArray(node.children) && node.children.length > 0) {
        result.push(...this.flattenNomenclatureNodes(node.children));
      }
    });
    return result;
  }

  private syncNomenclatureNodeFromRows(node: CommandeNomenclatureNode, rows: any[]): void {
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

  private syncNomenclatureBaseQuantities(nodes: CommandeNomenclatureNode[], parentQuantity: number): void {
    const safeParentQuantity = this.normalizeQuantityValue(parentQuantity) || 1;
    (Array.isArray(nodes) ? nodes : []).forEach((node: CommandeNomenclatureNode) => {
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

    const matchedGroups: Array<{ node: CommandeNomenclatureNode; indexes: number[] }> = [];
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

  trackByNomenclatureNode(index: number, node: CommandeNomenclatureNode): string {
    return `${node.article_id}-${index}`;
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
      Swal.fire({ icon: 'info', title: 'Article non s?lectionn?', text: 'Veuillez choisir un article d?abord.' });
      return;
    }

    const a = (this.produits1 || []).find((x: any) => Number(x?.article_id) === articleId);
    if (!a) {
      Swal.fire({ icon: 'warning', title: 'D?tail indisponible', text: 'D?tails article non trouv?s.' });
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

  AllProduitsNomenclature(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.baseService.getProduitsNomenclature().subscribe({
        next: (data: any) => {
          const produitsData = data?.data || data || [];
          this.produitsNomenclature = Array.isArray(produitsData) ? produitsData : [];
          resolve();
        },
        error: (error) => {
          this.produitsNomenclature = [];
          reject(error);
        }
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

  AllClients() {
    this.baseService.getClient().subscribe({
      next: (data: any) => {
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
        this.filteredClients = [];
      },
      error: (err) => {
        this.clients = [];
        this.filteredClients = [];
      }
    });
  }

  onSearchChange(term: string) {
    term = term.trim().toLowerCase();

    if (term.length === 0) {
      this.filteredClients = [];
      return;
    }

    this.filteredClients = this.clients.filter((client: any) =>
      client.nom.toLowerCase().includes(term)
    );
  }

  selectClient(client: any) {
    this.CommandeForm.patchValue({
      clientSearch: client.nom,
      part_id: client.part_id // ou client.id selon ton mod?le
    });
    this.filteredClients = [];
    this.searchTerm = client.nom; // facultatif si tu veux garder cette variable
    if (client.part_id) {
      this.checkClientExoneration(+client.part_id);
    } else {
      this.isClientExonerated = false;
      this.calculerTotaux();
    }
  }
  get clientSearchControl() {
    return this.CommandeForm.get('clientSearch') as FormControl;
  }

  AllCommerciaux() {
    this.baseService.getCommercial().subscribe({
      next: (data: any) => {
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
        this.filteredCommerciaux = [];
      },
      error: (err) => {
        this.commerciaux = [];
        this.filteredCommerciaux = [];
      }
    });
  }

  onCommercialSearchChange(term: string) {
    term = term.trim().toLowerCase();

    if (term.length === 0) {
      this.filteredCommerciaux = [];
      return;
    }

    this.filteredCommerciaux = this.commerciaux.filter(com =>
      com.nom.toLowerCase().includes(term)
    );
  }

  selectCommercial(com: any) {
    this.CommandeForm.patchValue({
      commercialSearch: com.nom,
      contact_id: com.id // ou com.id selon ta structure
    });
    this.filteredCommerciaux = [];
    this.searchCommercial = com.nom; // facultatif
  }
  get commercialSearchControl() {
    return this.CommandeForm.get('commercialSearch') as FormControl;
  }

  enregistrerTout(): void {
    const lignesAModifier: any[] = [];
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    this.resequenceProduitLignes();
    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      const desiredTax = this.isClientExonerated ? 0 : this.normalizeTaxeValue(p.taxe);
      p.pu = this.normalizePriceValue(p.pu);

      // V?rifie si la ligne est incompl?te
      if (!p.article_id || !p.qte) {
        Swal.fire({
          icon: 'error',
          title: 'Ligne invalide',
          html: `Erreur La ligne <strong>${i + 1}</strong> est incompl?te (article ou quantit? manquants).`,
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
          taxe: String(desiredTax),
          ligne: i + 1,
          document_id,
          update_mode: 'I'
        };

        if (p.reducMode === 'pourcentage') {
          // p.reduc est en pourcentage (10), on doit le convertir en d?cimal (0.1) pour la base de donn?es
          ligneAInserer.remise = p.reduc / 100; // Ex. 10 => 0.1
          ligneAInserer.remise_montant = null;
        } else {
          // p.reduc est d?j? en montant (dh)
          ligneAInserer.remise_montant = p.reduc;
          ligneAInserer.remise = null;
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
        desiredTax !== this.normalizeTaxeValue(pOriginal?.taxe)
      );

      if (modifie) {
        //const taxeValue = Math.min(+p.taxe, 100); 
        const ligneAEnvoyer: any = {
          id: p.id,
          article_id: p.article_id,
          designation: p.designation,
          pu: p.pu,
          qte: p.qte,
          taxe: String(desiredTax),
          ligne: i + 1,
          document_id,
          update_mode: 'U',
        };

        if (p.reducMode === 'pourcentage') {
          // p.reduc est en pourcentage (10), on doit le convertir en d?cimal (0.1) pour la base de donn?es
          ligneAEnvoyer.remise = p.reduc / 100; // Ex. 10 => 0.1
          ligneAEnvoyer.remise_montant = null; // Par s?curit?
        } else {
          // p.reduc est d?j? en montant (dh)
          ligneAEnvoyer.remise_montant = p.reduc;
          ligneAEnvoyer.remise = null; // Par s?curit?
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
    this.venteSerivce.SaveLignesDetailDevis(lignesAModifier).subscribe({
      next: (res) => {
        Swal.fire({
          icon: 'success',
          title: 'Enregistrement reussi',
          text: "OK " + lignesAModifier.length + " ligne(s) enregistree(s) avec succes.",
        });

        // Mise ? jour de la version originale
        this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
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

    this.venteSerivce.SaveLignesInfoDevis(this.selectedInfo).subscribe({
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
          text: 'La commande a ete envoyee avec succes.',
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
  envoyerWhatsApp(commande: any) {
    const numero = prompt('Entrez le num?ro WhatsApp du client (ex: 212612345678):');
    if (!numero) return;

    // Nettoyer le num?ro
    let numeroNettoye = numero.replace(/\D/g, '');
    if (numeroNettoye.startsWith('0')) {
      numeroNettoye = '212' + numeroNettoye.substring(1);
    } else if (!numeroNettoye.startsWith('212')) {
      numeroNettoye = '212' + numeroNettoye;
    }

    if (numeroNettoye.length < 12) {
      alert('Num?ro de t?l?phone invalide');
      return;
    }

    const messagePersonnalise = prompt('Message personnalis? (optionnel):') || 'Votre commande en pi?ce jointe';

    // Loader
    const loadingElement = document.createElement('div');
    loadingElement.innerHTML = 'Envoi du PDF via WhatsApp...';
    loadingElement.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:1px solid #ccc;border-radius:5px;z-index:9999;';
    document.body.appendChild(loadingElement);

    this.emailService.sendCommandeWhatsAppPDF(
      this.route.snapshot.paramMap.get('document_id')!,
      numeroNettoye,
      messagePersonnalise
    ).subscribe({
      next: (res) => {
        document.body.removeChild(loadingElement);

        if (res.success) {
          alert('OK PDF envoy? en pi?ce jointe via WhatsApp !');
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

  private buildCommandeLineChanges(): any[] | null {
    const lignesAModifier: any[] = [];
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    this.resequenceProduitLignes();

    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      const desiredTax = this.isClientExonerated ? 0 : this.normalizeTaxeValue(p.taxe);
      p.pu = this.normalizePriceValue(p.pu);

      if (!p.article_id || !p.qte) {
        Swal.fire({
          icon: 'error',
          title: 'Ligne invalide',
          html: `Erreur La ligne <strong>${i + 1}</strong> est incomplete (article ou quantite manquants).`,
        });
        return null;
      }

      const pOriginal = this.produitsOriginal[i];
      const payload: any = {
        id: p.id,
        article_id: p.article_id,
        designation: p.designation,
        pu: p.pu,
        qte: p.qte,
        taxe: String(desiredTax),
        ligne: i + 1,
        document_id,
        update_mode: pOriginal ? 'U' : 'I'
      };

      if (p.reducMode === 'pourcentage') {
        payload.remise = p.reduc / 100;
        payload.remise_montant = null;
      } else {
        payload.remise_montant = p.reduc;
        payload.remise = null;
      }

      if (!pOriginal) {
        delete payload.id;
        lignesAModifier.push(payload);
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
        desiredTax !== this.normalizeTaxeValue(pOriginal?.taxe)
      );

      if (modifie) {
        lignesAModifier.push(payload);
      }
    }

    return lignesAModifier;
  }

  private persistCommandeChangesBeforePdf(onSuccess: () => void): void {
    const lignesAModifier = this.buildCommandeLineChanges();
    if (lignesAModifier === null) {
      return;
    }

    if (lignesAModifier.length === 0) {
      onSuccess();
      return;
    }

    this.venteSerivce.SaveLignesDetailDevis(lignesAModifier).subscribe({
      next: () => {
        this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
        onSuccess();
      },
      error: () => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: "Impossible d'enregistrer les lignes avant l'impression.",
        });
      }
    });
  }

  private genererCommandePdf(): void {
    const id = this.route.snapshot.paramMap.get('document_id');
    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }
    Swal.fire({
      title: 'Generation du PDF',
      text: 'Veuillez patienter...',
      allowOutsideClick: false,
      allowEscapeKey: false,
      didOpen: () => {
        Swal.showLoading();
      }
    });
    this.emailService.generateCommandePDF(id).subscribe({
      next: (res) => {
        Swal.close();
        const url = res?.pdfUrl;
        if (url) {
          window.open(url, '_blank');
        } else {
          Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non re?u.' });
        }
      },
      error: (err) => {
        Swal.close();
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la g?n?ration du PDF." });
      }
    });
  }

  voirCommande(withStamp: boolean = false) {
    this.persistCommandeChangesBeforePdf(() => this.genererCommandePdf());
  }
}
