import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import Quill from 'quill';
import Swal from 'sweetalert2';
import { EmailService } from 'src/app/service/email.service';
import { PdfPermissionsService } from 'src/app/service/pdf-permissions.service';
import { forkJoin, of } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
const QuillMention = require('quill-mention');
declare var bootstrap: any;
Quill.register('modules/mention', QuillMention.default);

type DevisProduitLigne = {
  id: number;
  ligne?: number;
  designation: string;
  article_id: number;
  pu: number;
  qte: number;
  reduc: number;
  taxe: number;
  total: number;
  reducMode: 'pourcentage' | 'montant' | string;
  articleSearch: string;
  stock_disponible?: number | null;
  // Champs additionnels (optionnels) pour la nomenclature
  isNomenclature?: boolean;
  nomenclatureLines?: any[];
  // Optionnel: pour tracer l'origine (produit compos?)
  compose_id?: number;
  compose_qte?: number;
  compose_pu?: number;
  compose_designation?: string;
};

@Component({
  selector: 'app-edit-devis',
  templateUrl: './edit-devis.component.html',
  styleUrls: ['./edit-devis.component.css']
})
export class EditDevisComponent implements OnInit {
  produits1: any[] = [];
  editFacturation = false;
  mode: 'editor' | 'table' | 'nomenclature' = 'table';
  ligneSelectionnee: number | null = null;
  modules: any = {};
  editInfos = false;
  DevisForm!: FormGroup;
  clients: any;
  filteredClients: any[] = [];
  searchTerm = '';
  searchCommercial = '';
  commerciaux: any[] = [];
  filteredCommerciaux: any[] = [];
  selectedCommercial: any = null;
  produitsOriginal: DevisProduitLigne[] = [];
  reductionMode: 'percent' | 'amount' = 'percent';
  reducMode: 'pourcentage' | 'montant' = 'pourcentage';
  produitsSupprimes: number[] = [];
  successMessage: string | null = null;
  isError: boolean = false;
  emailForm: FormGroup;
  info: any;
  condition: any;
  isSending: boolean = false;
  numeroDevis: string = 'Dv25-0001';

  devis = {
    client: 'Nom du client',
    commercial: 'Nom du commercial',
    adresse: 'Adresse du client',
    date: new Date().toISOString().substring(0, 10),
    description: 'Description du devis',
  };

  produits: DevisProduitLigne[] = [{
    id: 0,
    designation: '',
    article_id: 0,
    pu: 0,
    qte: 1,
    reduc: 0,
    taxe: 0.2,
    total: 0,
    reducMode: 'montant',
    articleSearch: ''
  }]

  filteredArticles: { [key: number]: any[] } = {};
  highlightedArticleIndex: { [key: number]: number } = {};
  produitsNomenclature: any[] = [];
  filteredNomenclatureArticles: { [key: number]: any[] } = {};

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
  isClientExonerated = false; // Indique si le client est exon?r? de TVA
  private exoCheckToken = 0;

  private getLineUnitPrice(line: DevisProduitLigne): number {
    if (line.isNomenclature && Number(line.compose_pu) > 0) {
      return Number(line.compose_pu) || 0;
    }
    return Number(line.pu) || 0;
  }

  private getLineQty(line: DevisProduitLigne): number {
    return Number(line.qte) || 0;
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

  getTaxePercent(line: DevisProduitLigne): number {
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

  constructor(private baseService: BaseService, private fb: FormBuilder, private route: ActivatedRoute,
    private venteSerivce: VentesService, private emailService: EmailService,
    private cdr: ChangeDetectorRef, public pdfPermissionsService: PdfPermissionsService
  ) {
    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      cc: [''],
      subject: ['Devis ? votre attention'],
      body: ['Bonjour,\n\nVeuillez trouver ci-joint le devis demand?.\n\nCordialement,']
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
      devis: this.venteSerivce.getDevisById(id)
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

        const nomen = data.produitsNomenclature?.data || data.produitsNomenclature || [];
        this.produitsNomenclature = Array.isArray(nomen) ? nomen : [];
        
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
        
        // Traitement du devis
        this.processDevisData(data.devis);
      },
      error: (err) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors du chargement des donn?es.' });
      }
    });
    
    // Abonnements sur les changements de texte
    this.DevisForm.get('clientSearch')?.valueChanges.subscribe(value => {
      this.onSearchChange(value);
    });

    this.DevisForm.get('commercialSearch')?.valueChanges.subscribe(value => {
      this.onCommercialSearchChange(value);
    });
    
    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      cc: [''],
      subject: ['', Validators.required],
      body: ['', Validators.required]
    });
  }

  activerModeNomenclature() {
    this.mode = 'nomenclature';
    if (this.ligneSelectionnee === null && this.produits.length > 0) {
      this.ligneSelectionnee = 0;
    }
  }

  // Traitement des donn?es du devis apr?s chargement parall?le
  private processDevisData(data: any): void {
    if (!data) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'Devis introuvable.' });
            return;
          }

    this.numeroDevis = data.numero || 'Dv25-0001';

    const clientTrouve = this.clients?.find((c: any) => c.part_id === data.part_id);
    const commercialTrouve = this.commerciaux?.find((c: any) => c.id === data.contact_id);

          this.devis = {
            client: clientTrouve ? clientTrouve.nom : 'Client inconnu',
            commercial: commercialTrouve ? commercialTrouve.nom : 'Commercial inconnu',
            adresse: clientTrouve ? clientTrouve.adresse : '',
            date: data.date,
            description: data.description || ''
          };

          this.DevisForm.patchValue({
      date: data.date,
      description: data.description,
      part_id: data.part_id,
      contact_id: data.contact_id,
            clientSearch: clientTrouve ? clientTrouve.nom : '',
            commercialSearch: commercialTrouve ? commercialTrouve.nom : ''
          });

    // V?rifier l'exon?ration TVA au chargement du devis
    if (data.part_id) {
      this.checkClientExoneration(data.part_id);
    }

    if (data.details && Array.isArray(data.details)) {
        const orderedDetails = [...data.details].sort((a: any, b: any) => {
          const ligneA = Number(a?.ligne || 0);
          const ligneB = Number(b?.ligne || 0);
          if (ligneA > 0 && ligneB > 0 && ligneA !== ligneB) {
            return ligneA - ligneB;
          }
          if (ligneA > 0 && ligneB <= 0) {
            return -1;
          }
          if (ligneA <= 0 && ligneB > 0) {
            return 1;
          }
          return Number(a?.id || 0) - Number(b?.id || 0);
        });

        this.produits = orderedDetails.map((detail: any, index: number) => {
          const produitTrouve = this.produits1.find(p => +p.article_id === +detail.article_id);

          let reduc = 0;
          let reducMode = 'montant';

          if (detail.remise_montant != null && detail.remise_montant !== undefined) {
            reduc = +detail.remise_montant;
            reducMode = 'montant';
          } else if (detail.remise != null && detail.remise !== undefined) {
          reduc = +detail.remise * 100;
            reducMode = 'pourcentage';
          }

          return {
            id: detail.id,
            ligne: Number(detail.ligne || 0) || (index + 1),
            article_id: detail.article_id,
            designation: detail.designation,
            pu: +detail.prix,
            qte: +detail.quantite,
            reduc: reduc,
            reducMode: reducMode,
            taxe: this.normalizeTaxeValue(detail.taux_tva),
            total: 0,
            articleSearch: produitTrouve ? produitTrouve.article_nom : ''
          };
        });
    } else {
      this.produits = [];
    }

        this.info = {
      nom: data.Infos?.[0]?.nom || '',
      adresse: data.Infos?.[0]?.adresse || '',
      telephone: data.Infos?.[0]?.telephone || '',
      email: data.Infos?.[0]?.email || '',
      ice: data.Infos?.[0]?.ice || ''
        };

        this.selectedInfo = {
      document_id: data.condition?.[0]?.document_id || '',
      date: data.condition?.[0]?.date || '',
      condition: data.condition?.[0]?.condition || '',
      expedition: data.condition?.[0]?.expedition || '',
      transporteur: data.condition?.[0]?.transporteur || ''
        };

        this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
        this.produits.forEach((_, i) => this.recalculateTotal(i));
  }

  initForm(): void {
    this.DevisForm = this.fb.group({
      date: ['', Validators.required],
      description: [''],
      part_id: [0],
      contact_id: [0],
      date_fin: [''],
      etat: [1],
      clientSearch: [''],
      commercialSearch: ['']
    });
  }

  toggleEdit(): void {
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    this.editInfos = !this.editInfos;
    if (!this.editInfos) {
      this.venteSerivce.updateDevis(document_id, this.DevisForm.value).subscribe({
        next: (res) => {
          this.info = {
            nom: res.client_infos.nom,
            adresse: res.client_infos.adresse,
            telephone: res.client_infos.telephone,
            email: res.client_infos.email,
            ice: res.client_infos.ice
          };
        },
        error: (err) => {}
      });
    }
  }

  AllProduits(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.baseService.getProduit().subscribe({
        next: (response: any) => {
          let produitsData = response;
          if (response && response.data && Array.isArray(response.data)) {
            produitsData = response.data;
          } else if (response && Array.isArray(response)) {
            produitsData = response;
          } else {
            produitsData = [];
          }
          this.produits1 = produitsData;
          this.configureQuillModules();
          resolve();
        },
        error: error => {
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
            v.value && v.value.toLowerCase().includes(searchTerm.toLowerCase())
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
            v.value && v.value.toLowerCase().includes(searchTerm.toLowerCase())
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

  recalculateTotal(index: number) {
    const prod = this.produits[index];
    const base = this.getLineUnitPrice(prod) * this.getLineQty(prod);

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

    this.calculerTotaux();
  }

  calculerTotaux() {
    this.sousTotal = this.produits.reduce((acc, p) => {
      return acc + (this.getLineUnitPrice(p) * this.getLineQty(p));
    }, 0);

    this.reducTotal = this.produits.reduce((acc, p) => {
      const base = this.getLineUnitPrice(p) * this.getLineQty(p);
      const reduc = p.reducMode === 'pourcentage'
        ? (p.reduc / 100) * base
        : p.reduc;
      return acc + reduc;
    }, 0);

    const baseApresReduc = this.sousTotal - this.reducTotal;

    // TVA: si client exon?r? (valide) => 0, sinon taux normal (p.taxe)
    this.taxeTotal = this.produits.reduce((acc, p) => {
      const base = this.getLineUnitPrice(p) * this.getLineQty(p);
      const reduc = p.reducMode === 'pourcentage'
        ? (p.reduc / 100) * base
        : p.reduc;
      const baseApresReducLigne = Math.max(base - reduc, 0);
      const taux = this.isClientExonerated ? 0 : this.normalizeTaxeValue(p.taxe);
      return acc + (taux * baseApresReducLigne);
    }, 0);

    this.totalGeneral = baseApresReduc + this.taxeTotal + this.fraisPort;
  }

  // V?rifier si le client a une exon?ration TVA valide
  checkClientExoneration(part_id: number): void {
    const token = ++this.exoCheckToken;

    this.baseService.getAllExonerations(part_id).pipe(
      // Parfois l'API peut ?chouer temporairement -> retry l?ger
      retry({ count: 2, delay: 300 }),
      catchError((err: any) => {
        return of({ success: false, data: [] });
      })
    ).subscribe((response: any) => {
      // Si une nouvelle requ?te a ?t? lanc?e apr?s, ignorer cette r?ponse (?vite flip 20%->0%->20%)
      if (token !== this.exoCheckToken) {
        return;
      }

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

      // Recalculer les totaux + forcer le refresh UI (?vite cas o? l'UI reste ? 20% visuellement)
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
      taxe: 0.2,
      total: 0,
      reducMode: 'montant',
      articleSearch: ''
    });
    const newIndex = this.produits.length - 1;
    this.recalculateTotal(newIndex);
  }

  removeProduit(index: number) {
    const produit = this.produits[index];

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
    this.produits.splice(index, 1);
    this.resequenceProduitLignes();
    this.calculerTotaux();
  }

  onProduitDrop(event: CdkDragDrop<DevisProduitLigne[]>): void {
    if (event.previousIndex === event.currentIndex) {
      return;
    }

    moveItemInArray(this.produits, event.previousIndex, event.currentIndex);
    this.resequenceProduitLignes();
    this.filteredArticles = {};
    this.filteredNomenclatureArticles = {};
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

  onProduitSelected(index: number) {
    const articleId = this.produits[index].article_id;
    const produitTrouve = this.produits1.find(p => +p.article_id === +articleId);
    if (produitTrouve) {
      this.produits[index].designation = produitTrouve.article_nom;
      this.produits[index].pu = produitTrouve.pu || 0;
      this.produits[index].qte = 1;
      this.produits[index].reduc = 0;
      this.produits[index].taxe = (produitTrouve.taxe ?? 0.2);
      this.recalculateTotal(index);
    }

    this.ligneSelectionnee = index;
    this.mode = 'editor';
  }

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

    if (!Array.isArray(this.produits1) || this.produits1.length === 0) {
      this.AllProduits().then(() => {
        this.filteredArticles[index] = this.produits1.filter((article: any) =>
          article.article_nom && article.article_nom.toLowerCase().includes(term)
        );
        this.highlightedArticleIndex[index] = this.filteredArticles[index].length ? 0 : -1;
      });
      return;
    }

    this.filteredArticles[index] = this.produits1.filter((article: any) =>
      article.article_nom && article.article_nom.toLowerCase().includes(term)
    );
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

  onNomenclatureSearchChange(index: number, term: string) {
    if (!term) {
      this.filteredNomenclatureArticles[index] = [];
      return;
    }
    term = term.trim().toLowerCase();
    if (term.length === 0) {
      this.filteredNomenclatureArticles[index] = [];
      return;
    }
    this.filteredNomenclatureArticles[index] = this.produitsNomenclature.filter((article: any) =>
      (article.article_nom && article.article_nom.toLowerCase().includes(term)) ||
      (article.article_cod && article.article_cod.toLowerCase().includes(term))
    ).slice(0, 50);
  }

  selectNomenclatureArticle(index: number, article: any) {
    const composeId = article?.article_id;
    if (!composeId) return;
    const composeQty = Number(this.produits?.[index]?.qte) || 1;
    const composePu = 1;
    const composeProduit = this.produits1.find((x: any) => +x.article_id === +composeId);
    const composeRealPu = Number(
      article?.pu ??
      article?.prix_vente ??
      article?.prix ??
      composeProduit?.pu ??
      composeProduit?.prix_vente ??
      composeProduit?.prix ??
      0
    ) || 0;
    const composeDesignation = article?.article_nom || '';

    // Charger la nomenclature (composants) puis remplacer la ligne par les composants
    this.baseService.getArticleNomenclature(composeId).pipe(
      catchError(() => of({ data: [] }))
    ).subscribe((res: any) => {
      const lines = res?.data || res || [];
      if (!Array.isArray(lines) || lines.length === 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Nomenclature vide',
          text: 'Ce produit ne contient aucun composant de nomenclature.'
        });
        return;
      }

      // Cr?er d'abord la ligne pour le produit compos?
      const composeRow: DevisProduitLigne = {
        id: 0,
        designation: composeDesignation,
        article_id: composeId,
        pu: composePu,
        qte: composeQty,
        reduc: 0,
        taxe: this.isClientExonerated ? 0 : 0.2,
        total: composeRealPu * composeQty,
        reducMode: 'montant',
        articleSearch: composeDesignation,
        compose_id: composeId,
        isNomenclature: true,
        compose_pu: composeRealPu
      };

      // Ensuite cr?er les lignes pour les composants
      const composantRows: DevisProduitLigne[] = lines.map((comp: any) => {
        const composantId = comp?.Composant_id || comp?.composant_id;
        const produitTrouve = this.produits1.find((x: any) => +x.article_id === +composantId);
        const qte = Number(comp?.Quantite ?? comp?.quantite) || 0;
        const pu = 1;
        const taxe = Number(produitTrouve?.taxe ?? 0.2);
        const designation = produitTrouve?.article_nom || comp?.composant_nom || '';

        return {
          id: 0,
          designation,
          article_id: composantId,
          pu,
          qte,
          reduc: 0,
          taxe: this.isClientExonerated ? 0 : taxe,
          total: 0,
          reducMode: 'montant',
          articleSearch: designation,
          compose_id: composeId,
          compose_qte: composeQty,
          compose_pu: composeRealPu,
          compose_designation: composeDesignation
        };
      }).filter((r: any) => !!r.article_id);

      if (composantRows.length === 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Nomenclature invalide',
          text: 'Aucun composant valide trouv? pour ce produit.'
        });
        return;
      }

      // Remplacer la ligne actuelle par : le produit compos? + tous les composants
      const allRows = [composeRow, ...composantRows];
      this.produits.splice(index, 1, ...allRows);
      this.resequenceProduitLignes();

      // R?initialiser les index de filtres (les indices ont chang?)
      this.filteredArticles = {};
      this.filteredNomenclatureArticles = {};

      // Recalculer les totaux des lignes ins?r?es (compos? + composants)
      for (let j = index; j < index + allRows.length; j++) {
        this.recalculateTotal(j);
        this.updateLineStockDisponible(j, this.produits[j]?.article_id);
      }

      // Afficher la liste pour voir tous les composants
      this.mode = 'table';
      this.ligneSelectionnee = index;
      this.cdr.detectChanges();
    });
  }

  private buildDevisLineChanges(): any[] | null {
    const lignesAModifier: any[] = [];
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    this.resequenceProduitLignes();

    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      const desiredTax = this.isClientExonerated ? 0 : this.normalizeTaxeValue(p.taxe);

      if (!p.article_id || !p.pu || !p.qte) {
        Swal.fire({
          icon: 'error',
          title: 'Ligne invalide',
          html: `La ligne <strong>${i + 1}</strong> est incomplete (article, prix ou quantite manquants).`,
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
        (Number(p.ligne || 0) || (i + 1)) !== (Number(pOriginal.ligne || 0) || (i + 1)) ||
        p.designation !== pOriginal.designation ||
        p.article_id !== pOriginal.article_id ||
        p.pu !== pOriginal.pu ||
        p.qte !== pOriginal.qte ||
        p.reduc !== pOriginal.reduc ||
        p.reducMode !== pOriginal.reducMode ||
        desiredTax !== this.normalizeTaxeValue(pOriginal.taxe)
      );

      if (modifie) {
        lignesAModifier.push(payload);
      }
    }

    return lignesAModifier;
  }

  private persistDevisChangesBeforePdf(onSuccess: () => void): void {
    const lignesAModifier = this.buildDevisLineChanges();
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

  private genererDevisPdf(printMode: 'normal' | 'simple' | 'nomenclature', composeArticle: any = null, withStamp: boolean = false): void {
    const id = this.route.snapshot.paramMap.get('document_id');
    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }
    this.emailService.generateDevisPDF(id, { withStamp, printMode, composeArticle }).subscribe({
      next: (res) => {
        const url = res?.pdfUrl;
        if (url) window.open(url, '_blank');
        else Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non re?u.' });
      },
      error: () => Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la g?n?ration du PDF." })
    });
  }

  imprimerPdfNormal() {
    this.persistDevisChangesBeforePdf(() => this.genererDevisPdf('normal'));
  }

  imprimerPdfSimple() {
    this.persistDevisChangesBeforePdf(() => this.genererDevisPdf('simple'));
  }

  private buildComposeArticlePayload(): any {
    const composeIds = Array.from(new Set((this.produits || []).map(p => p.compose_id).filter((x: any) => !!x))) as number[];
    if (composeIds.length === 0) {
      return null;
    }

    const composeId = composeIds[0];
    const firstRow = (this.produits || []).find(p => +(p.compose_id ?? 0) === +composeId);
    const articleCompose = this.produitsNomenclature?.find((a: any) => +a.article_id === +composeId);

    return {
      article_id: composeId,
      article_cod: articleCompose?.article_cod || '',
      article_nom: articleCompose?.article_nom || firstRow?.compose_designation || '',
      prix: Number(firstRow?.compose_pu ?? articleCompose?.pu ?? 0) || 0,
      quantite: Number(firstRow?.compose_qte ?? 1) || 1
    };
  }

  async imprimerPdfNomenclature() {
    this.persistDevisChangesBeforePdf(() => this.genererDevisPdf('nomenclature', this.buildComposeArticlePayload()));
  }

  selectArticle(index: number, article: any) {
    this.produits[index].article_id = article.article_id;
    this.produits[index].articleSearch = article.article_nom;
    this.produits[index].stock_disponible = null;
    this.filteredArticles[index] = [];
    this.highlightedArticleIndex[index] = -1;

    this.produits[index].designation = article.article_nom;
    this.produits[index].pu = article.pu || 0;
    this.produits[index].qte = 1;
    this.produits[index].reduc = 0;
    this.produits[index].taxe = (article.taxe ?? 0.2);
    this.updateLineStockDisponible(index, article.article_id);
    this.recalculateTotal(index);
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

  activerModeEditor() {
    this.mode = 'editor';

    if (this.ligneSelectionnee === null && this.produits.length > 0) {
      this.ligneSelectionnee = 0;
    }
  }

  AllClients() {
    this.baseService.getClient().subscribe((response: any) => {
      const allPartenaires = response?.data || (Array.isArray(response) ? response : []);
      this.clients = (allPartenaires || []).filter((client: any) => Number(client?.type) === 1);
      this.filteredClients = this.clients;
    })
  }

  onSearchChange(term: string) {
    term = term.trim().toLowerCase();

    if (term.length === 0) {
      this.filteredClients = [];
      return;
    }

    this.filteredClients = this.clients.filter((client: any) =>
      client.nom && client.nom.toLowerCase().includes(term)
    );
  }

  selectClient(client: any) {
    this.DevisForm.patchValue({
      clientSearch: client.nom,
      part_id: client.part_id
    });
    this.filteredClients = [];
    this.searchTerm = client.nom;
    
    // V?rifier l'exon?ration TVA du client
    if (client.part_id) {
      this.checkClientExoneration(client.part_id);
    }
  }

  get clientSearchControl() {
    return this.DevisForm.get('clientSearch') as FormControl;
  }

  AllCommerciaux() {
    this.baseService.getCommercial().subscribe((response: any) => {
      this.commerciaux = response?.data || (Array.isArray(response) ? response : []);
    })
  }

  onCommercialSearchChange(term: string) {
    term = term.trim().toLowerCase();

    if (term.length === 0) {
      this.filteredCommerciaux = [];
      return;
    }

    this.filteredCommerciaux = this.commerciaux.filter(com =>
      com.nom && com.nom.toLowerCase().includes(term)
    );
  }

  selectCommercial(com: any) {
    this.DevisForm.patchValue({
      commercialSearch: com.nom,
      contact_id: com.id
    });
    this.filteredCommerciaux = [];
    this.searchCommercial = com.nom;
  }

  get commercialSearchControl() {
    return this.DevisForm.get('commercialSearch') as FormControl;
  }

  enregistrerTout(): void {
    const lignesAModifier: any[] = [];
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    this.resequenceProduitLignes();
    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      // R?gle TVA (d?tail produit):
      // - client exon?r? valide -> taux_tva = 0
      // - sinon -> taux TVA saisi sur la ligne
      const desiredTax = this.isClientExonerated ? 0 : this.normalizeTaxeValue(p.taxe);

      if (!p.article_id || !p.pu || !p.qte) {
        Swal.fire({
          icon: 'error',
          title: 'Ligne invalide',
          html: `La ligne <strong>${i + 1}</strong> est incompl?te (article, prix ou quantit? manquants).`,
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
          taxe: String(desiredTax),
          ligne: i + 1,
          document_id,
          update_mode: 'I'
        };

        if (p.reducMode === 'pourcentage') {
          ligneAInserer.remise = p.reduc / 100;
          ligneAInserer.remise_montant = null;
        } else {
          ligneAInserer.remise_montant = p.reduc;
          ligneAInserer.remise = null;
        }

        lignesAModifier.push(ligneAInserer);
        continue;
      }

      const modifie = (
        p.id !== pOriginal.id ||
        (Number(p.ligne || 0) || (i + 1)) !== (Number(pOriginal.ligne || 0) || (i + 1)) ||
        p.designation !== pOriginal.designation ||
        p.article_id !== pOriginal.article_id ||
        p.pu !== pOriginal.pu ||
        p.qte !== pOriginal.qte ||
        p.reduc !== pOriginal.reduc ||
        p.reducMode !== pOriginal.reducMode ||
        desiredTax !== this.normalizeTaxeValue(pOriginal.taxe)
      );

      if (modifie) {
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
          ligneAEnvoyer.remise = p.reduc / 100;
          ligneAEnvoyer.remise_montant = null;
        } else {
          ligneAEnvoyer.remise_montant = p.reduc;
          ligneAEnvoyer.remise = null;
        }

        lignesAModifier.push(ligneAEnvoyer);
      }
    }

    if (lignesAModifier.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Aucune modification',
        text: 'Aucune ligne modifi?e ou ajout?e.',
      });
      return;
    }

    this.venteSerivce.SaveLignesDetailDevis(lignesAModifier).subscribe({
      next: (res) => {
        Swal.fire({
          icon: 'success',
          title: 'Enregistrement reussi',
          text: lignesAModifier.length + " ligne(s) enregistree(s) avec succes.",
        });
        // Recharger le devis pour refl?ter les lignes ins?r?es (nomenclature => plusieurs lignes)
        this.venteSerivce.getDevisById(document_id).subscribe({
          next: (updated: any) => {
            this.processDevisData(updated?.data || updated);
          },
          error: () => {
            this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
          }
        });
      },
      error: (err) => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: 'Une erreur est survenue lors de l\'enregistrement.',
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

    this.isSending = true;

    const formData = {
      ...this.emailForm.value,
      document_id: +this.route.snapshot.paramMap.get('document_id')!
    };

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
          text: 'Le devis a ete envoye avec succes.',
          timer: 3000,
          showConfirmButton: false
        });
        bootstrap.Modal.getInstance(document.getElementById('emailModal')).hide();
      },
      error: err => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: 'Echec de l\'envoi de l\'e-mail.'
        });
      }
    });
  }

  envoyerWhatsApp(devis: any) {
    const numero = prompt('Entrez le num?ro WhatsApp du client (ex: 212612345678):');
    if (!numero) return;

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

    const messagePersonnalise = prompt('Message personnalis? (optionnel):') || 'Votre devis en pi?ce jointe';

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
          alert('PDF envoy? en pi?ce jointe via WhatsApp !');
        } else {
          alert('Erreur: ' + res.message);
        }
      },
      error: (err) => {
        if (document.body.contains(loadingElement)) {
          document.body.removeChild(loadingElement);
        }
        alert('Erreur: ' + (err.error?.message || err.message));
      }
    });
  }

  voirCommande(withStamp: boolean = false): void {
    // Compat: ancien bouton "Voir commande" garde le comportement normal
    this.persistDevisChangesBeforePdf(() => this.genererDevisPdf('normal', null, withStamp));
  }
}



