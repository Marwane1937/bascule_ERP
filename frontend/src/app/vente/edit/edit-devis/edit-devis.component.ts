import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import Quill from 'quill';
import Swal from 'sweetalert2';
import { EmailService } from 'src/app/service/email.service';
import { forkJoin, of } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
const QuillMention = require('quill-mention');
declare var bootstrap: any;
Quill.register('modules/mention', QuillMention.default);

type DevisProduitLigne = {
  id: number;
  designation: string;
  article_id: number;
  pu: number;
  qte: number;
  reduc: number;
  taxe: number;
  total: number;
  reducMode: 'pourcentage' | 'montant' | string;
  articleSearch: string;
  // Champs additionnels (optionnels) pour la nomenclature
  isNomenclature?: boolean;
  nomenclatureLines?: any[];
  // Optionnel: pour tracer l'origine (produit composé)
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
    'Inconnu', 'Amana', 'ARAMEX', 'Barid Al-Maghrib', 'Cathedis', 'Chronopost', 'Colis Privé',
    'DHL', 'FedEx', 'GLS', 'Jumia Logistics', 'La Voie Express', 'Maroc Express',
    'Mondial Relay', 'TNT', 'UPS', 'Yamato Transport'
  ].sort();

  fraisPort = 0;
  sousTotal = 0;
  taxeTotal = 0;
  reducTotal = 0;
  totalGeneral = 0;
  isClientExonerated = false; // Indique si le client est exonéré de TVA
  private exoCheckToken = 0;

  constructor(private baseService: BaseService, private fb: FormBuilder, private route: ActivatedRoute,
    private venteSerivce: VentesService, private emailService: EmailService,
    private cdr: ChangeDetectorRef
  ) {
    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      cc: [''],
      subject: ['Devis à votre attention'],
      body: ['Bonjour,\n\nVeuillez trouver ci-joint le devis demandé.\n\nCordialement,']
    });
  }

  ngOnInit(): void {
    this.modules = {};
    this.initForm();
    
      const id = +this.route.snapshot.paramMap.get('document_id')!;
    
    // Charger toutes les données en parallèle pour accélérer le chargement
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
        this.clients = clientsData;
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
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors du chargement des données.' });
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

  // Traitement des données du devis après chargement parallèle
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

    // Vérifier l'exonération TVA au chargement du devis
    if (data.part_id) {
      this.checkClientExoneration(data.part_id);
    }

    if (data.details && Array.isArray(data.details)) {
        this.produits = data.details.map((detail: any) => {
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
            article_id: detail.article_id,
            designation: detail.designation,
            pu: +detail.prix,
            qte: +detail.quantite,
            reduc: reduc,
            reducMode: reducMode,
            taxe: +detail.taux_tva,
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
    const base = prod.pu * prod.qte;

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
    this.sousTotal = this.produits.reduce((acc, p) => acc + p.pu * p.qte, 0);

    this.reducTotal = this.produits.reduce((acc, p) => {
      const base = p.pu * p.qte;
      const reduc = p.reducMode === 'pourcentage'
        ? (p.reduc / 100) * base
        : p.reduc;
      return acc + reduc;
    }, 0);

    const baseApresReduc = this.sousTotal - this.reducTotal;

    // TVA: si client exonéré (valide) => 0, sinon taux normal (p.taxe)
    this.taxeTotal = this.produits.reduce((acc, p) => {
      const base = p.pu * p.qte;
      const reduc = p.reducMode === 'pourcentage'
        ? (p.reduc / 100) * base
        : p.reduc;
      const baseApresReducLigne = Math.max(base - reduc, 0);
      const taux = this.isClientExonerated ? 0 : (p.taxe ?? 0);
      return acc + (taux * baseApresReducLigne);
    }, 0);

    this.totalGeneral = baseApresReduc + this.taxeTotal + this.fraisPort;
  }

  // Vérifier si le client a une exonération TVA valide
  checkClientExoneration(part_id: number): void {
    const token = ++this.exoCheckToken;

    this.baseService.getAllExonerations(part_id).pipe(
      // Parfois l'API peut échouer temporairement -> retry léger
      retry({ count: 2, delay: 300 }),
      catchError((err: any) => {
        return of({ success: false, data: [] });
      })
    ).subscribe((response: any) => {
      // Si une nouvelle requête a été lancée après, ignorer cette réponse (évite flip 20%->0%->20%)
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

      // Recalculer les totaux + forcer le refresh UI (évite cas où l'UI reste à 20% visuellement)
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
    this.calculerTotaux();
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
      return;
    }

    term = term.trim().toLowerCase();

    if (term.length === 0) {
      this.filteredArticles[index] = [];
      return;
    }

    if (!Array.isArray(this.produits1) || this.produits1.length === 0) {
      this.AllProduits().then(() => {
        this.filteredArticles[index] = this.produits1.filter((article: any) =>
          article.article_nom && article.article_nom.toLowerCase().includes(term)
        );
      });
      return;
    }

    this.filteredArticles[index] = this.produits1.filter((article: any) =>
      article.article_nom && article.article_nom.toLowerCase().includes(term)
    );
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
    const composePu = Number(article?.pu ?? 0) || 0;
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

      // Créer d'abord la ligne pour le produit composé
      const composeRow: DevisProduitLigne = {
        id: 0,
        designation: composeDesignation,
        article_id: composeId,
        pu: composePu,
        qte: composeQty,
        reduc: 0,
        taxe: this.isClientExonerated ? 0 : 0.2,
        total: composePu * composeQty,
        reducMode: 'montant',
        articleSearch: composeDesignation,
        compose_id: composeId,
        isNomenclature: true
      };

      // Ensuite créer les lignes pour les composants
      const composantRows: DevisProduitLigne[] = lines.map((comp: any) => {
        const composantId = comp?.Composant_id || comp?.composant_id;
        const produitTrouve = this.produits1.find((x: any) => +x.article_id === +composantId);
        const qte = Number(comp?.Quantite ?? comp?.quantite) || 0;
        const pu = Number(produitTrouve?.pu ?? produitTrouve?.prix_vente ?? 0) || 0;
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
          compose_pu: composePu,
          compose_designation: composeDesignation
        };
      }).filter((r: any) => !!r.article_id);

      if (composantRows.length === 0) {
        Swal.fire({
          icon: 'warning',
          title: 'Nomenclature invalide',
          text: 'Aucun composant valide trouvé pour ce produit.'
        });
        return;
      }

      // Remplacer la ligne actuelle par : le produit composé + tous les composants
      const allRows = [composeRow, ...composantRows];
      this.produits.splice(index, 1, ...allRows);

      // Réinitialiser les index de filtres (les indices ont changé)
      this.filteredArticles = {};
      this.filteredNomenclatureArticles = {};

      // Recalculer les totaux des lignes insérées (composé + composants)
      for (let j = index; j < index + allRows.length; j++) {
        this.recalculateTotal(j);
      }

      // Afficher la liste pour voir tous les composants
      this.mode = 'table';
      this.ligneSelectionnee = index;
      this.cdr.detectChanges();
    });
  }

  imprimerPdfNormal() {
    const id = this.route.snapshot.paramMap.get('document_id');
    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }
    this.emailService.generateDevisPDF(id, { printMode: 'normal' }).subscribe({
      next: (res) => {
        const url = res?.pdfUrl;
        if (url) window.open(url, '_blank');
        else Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reçu.' });
      },
      error: () => Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la génération du PDF." })
    });
  }

  async imprimerPdfNomenclature() {
    const id = this.route.snapshot.paramMap.get('document_id');
    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }

    const composeIds = Array.from(new Set((this.produits || []).map(p => p.compose_id).filter((x: any) => !!x))) as number[];
    // Pas de popup: on laisse le backend détecter automatiquement l'article composé à partir des lignes du devis.
    // Si on a un hint en session (compose_id), on envoie quand même ses infos (quantité/prix) pour être exact.
    let composeArticlePayload: any = null;
    if (composeIds.length > 0) {
      const composeId = composeIds[0]; // sans popup: prendre le premier
      const firstRow = (this.produits || []).find(p => +(p.compose_id ?? 0) === +composeId);
      const articleCompose = this.produitsNomenclature?.find((a: any) => +a.article_id === +composeId);
      composeArticlePayload = {
        article_id: composeId,
        article_cod: articleCompose?.article_cod || '',
        article_nom: articleCompose?.article_nom || firstRow?.compose_designation || '',
        prix: Number(firstRow?.compose_pu ?? articleCompose?.pu ?? 0) || 0,
        quantite: Number(firstRow?.compose_qte ?? 1) || 1
      };
    }

    this.emailService.generateDevisPDF(id, { printMode: 'nomenclature', composeArticle: composeArticlePayload }).subscribe({
      next: (res) => {
        const url = res?.pdfUrl;
        if (url) window.open(url, '_blank');
        else Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reçu.' });
      },
      error: () => Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la génération du PDF." })
    });
  }

  selectArticle(index: number, article: any) {
    this.produits[index].article_id = article.article_id;
    this.produits[index].articleSearch = article.article_nom;
    this.filteredArticles[index] = [];

    this.produits[index].designation = article.article_nom;
    this.produits[index].pu = article.pu || 0;
    this.produits[index].qte = 1;
    this.produits[index].reduc = 0;
    this.produits[index].taxe = (article.taxe ?? 0.2);
    this.recalculateTotal(index);
  }

  activerModeEditor() {
    this.mode = 'editor';

    if (this.ligneSelectionnee === null && this.produits.length > 0) {
      this.ligneSelectionnee = 0;
    }
  }

  AllClients() {
    this.baseService.getClient().subscribe((response: any) => {
      this.clients = response?.data || (Array.isArray(response) ? response : []);
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
    
    // Vérifier l'exonération TVA du client
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
    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      // Règle TVA (détail produit):
      // - client exonéré valide -> taux_tva = 0
      // - sinon -> taux TVA standard = 0.2 (20%)
      const desiredTax = this.isClientExonerated ? 0 : 0.2;

      if (!p.article_id || !p.pu || !p.qte) {
        Swal.fire({
          icon: 'error',
          title: 'Ligne invalide',
          html: `La ligne <strong>${i + 1}</strong> est incomplète (article, prix ou quantité manquants).`,
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
        p.designation !== pOriginal.designation ||
        p.article_id !== pOriginal.article_id ||
        p.pu !== pOriginal.pu ||
        p.qte !== pOriginal.qte ||
        p.reduc !== pOriginal.reduc ||
        p.reducMode !== pOriginal.reducMode ||
        desiredTax !== pOriginal.taxe
      );

      if (modifie) {
        const ligneAEnvoyer: any = {
          id: p.id,
          article_id: p.article_id,
          designation: p.designation,
          pu: p.pu,
          qte: p.qte,
          taxe: String(desiredTax),
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
        text: 'Aucune ligne modifiée ou ajoutée.',
      });
      return;
    }

    this.venteSerivce.SaveLignesDetailDevis(lignesAModifier).subscribe({
      next: (res) => {
        Swal.fire({
          icon: 'success',
          title: 'Enregistrement réussi',
          text: `${lignesAModifier.length} ligne(s) enregistrée(s) avec succès.`,
        });
        // Recharger le devis pour refléter les lignes insérées (nomenclature => plusieurs lignes)
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
          title: 'E-mail envoyé !',
          text: 'Le devis a été envoyé avec succès.',
          timer: 3000,
          showConfirmButton: false
        });
        bootstrap.Modal.getInstance(document.getElementById('emailModal')).hide();
      },
      error: err => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: 'Échec de l\'envoi de l\'e-mail.'
        });
      }
    });
  }

  envoyerWhatsApp(devis: any) {
    const numero = prompt('Entrez le numéro WhatsApp du client (ex: 212612345678):');
    if (!numero) return;

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

    const messagePersonnalise = prompt('Message personnalisé (optionnel):') || 'Votre devis en pièce jointe';

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
          alert('PDF envoyé en pièce jointe via WhatsApp !');
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
    const id = this.route.snapshot.paramMap.get('document_id');
    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }
    // Compat: ancien bouton "Voir commande" garde le comportement normal
    this.emailService.generateDevisPDF(id, { withStamp, printMode: 'normal' }).subscribe({
      next: (res: any) => {
        const url = res?.pdfUrl;
        if (url) {
          window.open(url, '_blank');
        } else {
          Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reçu.' });
        }
      },
      error: (err: any) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la génération du PDF." });
      }
    });
  }
}
