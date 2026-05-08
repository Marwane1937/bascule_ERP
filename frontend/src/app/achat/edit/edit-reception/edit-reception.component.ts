import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { AchatsService } from 'src/app/service/achats.service';
import Swal from 'sweetalert2';
import { forkJoin, of } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';

@Component({
  selector: 'app-edit-reception',
  templateUrl: './edit-reception.component.html',
  styleUrls: ['./edit-reception.component.css']
})
export class EditReceptionComponent implements OnInit {
  produits1: any[] = [];
  editFacturation = false;
  ligneSelectionnee: number | null = null;
  editInfos = false;
  ReceptionForm!: FormGroup;
  fournisseurs: any;
  filteredFournisseurs: any[] = [];
  searchTerm = '';
  searchContact = '';
  contacts: any[] = [];
  filteredContacts: any[] = [];
  depots: any[] = [];
  selectedContact: any = null;
  produitsOriginal: any[] = [];
  reductionMode: 'percent' | 'amount' = 'percent';
  reducMode: 'pourcentage' | 'montant' = 'pourcentage';
  produitsSupprimes: number[] = [];
  successMessage: string | null = null;
  isError: boolean = false;
  numeroReception: string = 'REC25-0001';

  reception = {
    fournisseur: 'Nom du fournisseur',
    contact: 'Nom du contact',
    adresse: 'Adresse du fournisseur',
    date: new Date().toISOString().substring(0, 10),
    description: 'Description de la rÃ©ception',
    depot_nom: ''
  };

  produits = [{
    id: 0,
    designation: '',
    article_id: 0,
    pu: 0,
    qte: 1,
    numero_lot: '',
    reduc: 0,
    taxe: 0.2,
    total: 0,
    reducMode: 'montant',
    articleSearch: '',
    depot_id: null as number | null
  }]

  filteredArticles: { [key: number]: any[] } = {};
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
    'Inconnu', 'Amana', 'ARAMEX', 'Barid Al-Maghrib', 'Cathedis', 'Chronopost', 'Colis PrivÃ©',
    'DHL', 'FedEx', 'GLS', 'Jumia Logistics', 'La Voie Express', 'Maroc Express',
    'Mondial Relay', 'TNT', 'UPS', 'Yamato Transport'
  ].sort();

  fraisPort = 0;
  sousTotal = 0;
  taxeTotal = 0;
  reducTotal = 0;
  totalGeneral = 0;

  constructor(
    private baseService: BaseService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private achatsService: AchatsService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit(): void {
    this.initForm();
    
    const id = +this.route.snapshot.paramMap.get('document_id')!;
    
    forkJoin({
      produits: this.baseService.getProduit(),
      fournisseurs: this.baseService.getFournisseur(),
      depots: this.baseService.getDepots(),
      reception: this.achatsService.getReceptionById(id)
    }).subscribe({
      next: (data) => {
        let produitsData = data.produits;
        if (data.produits && data.produits.data && Array.isArray(data.produits.data)) {
          produitsData = data.produits.data;
        } else if (data.produits && Array.isArray(data.produits)) {
          produitsData = data.produits;
        } else {
          produitsData = [];
        }
        this.produits1 = produitsData;
        
        let fournisseursData = data.fournisseurs;
        if (data.fournisseurs && data.fournisseurs.data && Array.isArray(data.fournisseurs.data)) {
          fournisseursData = data.fournisseurs.data;
        } else if (data.fournisseurs && Array.isArray(data.fournisseurs)) {
          fournisseursData = data.fournisseurs;
        } else {
          fournisseursData = [];
        }
        this.fournisseurs = fournisseursData;
        this.filteredFournisseurs = [...this.fournisseurs];

        const depotsData = data.depots?.data || (Array.isArray(data.depots) ? data.depots : []);
        this.depots = Array.isArray(depotsData) ? depotsData : [];
        
        this.processReceptionData(data.reception);
      },
      error: (err) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors du chargement des donnÃ©es.' });
      }
    });
    
    this.ReceptionForm.get('fournisseurSearch')?.valueChanges.subscribe(value => {
      this.searchTerm = value || '';
      this.onSearchChange(value);
    });
  }

  private processReceptionData(response: any): void {
    const data = response?.data || response;

    if (!data) {
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'RÃ©ception introuvable.',
      });
      return;
    }

    this.numeroReception = data.numero || 'REC25-0001';

    const fournisseurTrouve = this.fournisseurs?.find((f: any) => +f.part_id === +data.part_id);
    const headerDepotFromDetails = Array.isArray(data?.details)
      ? this.normalizeDepotId(
          data.details.find((x: any) => this.normalizeDepotId(x?.depot_id ?? x?.adresse_id))?.depot_id
          ?? data.details.find((x: any) => this.normalizeDepotId(x?.depot_id ?? x?.adresse_id))?.adresse_id
        )
      : null;

    this.ReceptionForm.patchValue({
      date: data.date ? data.date.substring(0, 10) : '',
      description: data.description || '',
      part_id: data.part_id,
      contact_id: data.contact_id,
      depot_id: this.normalizeDepotId(data?.depot_id ?? data?.adresse_id) ?? headerDepotFromDetails,
      fournisseurSearch: fournisseurTrouve?.nom || ''
    });

    if (!data.details || !Array.isArray(data.details)) {
      this.produits = [];
    } else {
      this.produits = data.details.map((d: any) => {
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

        return {
          id: d.id,
          article_id: d.article_id,
          articleSearch: articleTrouve?.article_nom || d.article_nom || '',
          designation: d.designation || d.description || '',
          pu: d.pu || d.prix || 0,
          qte: d.qte || d.quantite || 0,
          numero_lot: d.numero_lot || d.serie || '',
          reduc: reducValue,
          reducMode: reducMode,
          taxe: d.tva || d.taux_tva || 0.2,
          total: d.total || ((d.pu || d.prix || 0) * (d.qte || d.quantite || 0)),
          depot_id: this.normalizeDepotId(d.depot_id ?? d.adresse_id ?? data?.depot_id ?? data?.adresse_id) ?? headerDepotFromDetails
        };
      });
    }

    this.reception = {
      ...this.reception,
      depot_nom: data?.depot_nom || data?.depot || ''
    };

    if (!data.fournisseurInfo) {
      this.info = {
        nom: fournisseurTrouve?.nom || '',
        adresse: '',
        telephone: '',
        email: '',
        ice: ''
      };
    } else {
      this.info = {
        nom: data.fournisseurInfo.nom || '',
        adresse: data.fournisseurInfo.adresse || '',
        telephone: data.fournisseurInfo.telephone || '',
        email: data.fournisseurInfo.email || '',
        ice: data.fournisseurInfo.ice || ''
      };
    }

    this.selectedInfo = {
      document_id: data?.document_id?.toString() || '',
      date: data?.date || '',
      condition: '',
      expedition: '',
      transporteur: ''
    };

    this.applyHeaderDepotToLines(false);
    this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
    this.produits.forEach((_, i) => this.recalculateTotal(i));
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

  initForm(): void {
    this.ReceptionForm = this.fb.group({
      date: ['', Validators.required],
      description: [''],
      part_id: [0],
      contact_id: [0],
      depot_id: [null, Validators.required],
      date_fin: [''],
      etat: [1],
      fournisseurSearch: ['']
    });
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

    this.taxeTotal = this.produits.reduce((acc, p) => {
      const base = p.pu * p.qte;
      const reduc = p.reducMode === 'pourcentage'
        ? (p.reduc / 100) * base
        : p.reduc;
      const baseApresReduc = Math.max(base - reduc, 0);
      const taux = 0.2;
      const tva = taux * baseApresReduc;
      return acc + tva;
    }, 0);

    this.totalGeneral = baseApresReduc + this.taxeTotal + this.fraisPort;
  }

  toggleEdit(): void {
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    if (!this.editInfos) {
      this.editInfos = true;
      return;
    }

    const depotId = this.normalizeDepotId(this.ReceptionForm.value?.depot_id);
    if (!depotId) {
      this.ReceptionForm.get('depot_id')?.markAsTouched();
      Swal.fire({
        icon: 'warning',
        title: 'Depot obligatoire',
        text: 'Veuillez selectionner un depot avant de valider la reception.'
      });
      return;
    }

    this.editInfos = false;
    this.achatsService.updateReception(document_id, {
      ...this.ReceptionForm.value,
      depot_id: depotId
    }).subscribe({
      next: (res) => {
        this.info = {
          nom: res.fournisseurInfo?.nom || this.info.nom,
          adresse: res.fournisseurInfo?.adresse || this.info.adresse,
          telephone: res.fournisseurInfo?.telephone || this.info.telephone,
          email: res.fournisseurInfo?.email || this.info.email,
          ice: res.fournisseurInfo?.ice || this.info.ice
        };
      },
      error: (err) => {
        // Erreur silencieuse
      }
    });
    this.applyHeaderDepotToLines(true);
  }

  AllProduits(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.baseService.getProduit().subscribe({
        next: data => {
          let produitsData = data;
          if (data && data.data && Array.isArray(data.data)) {
            produitsData = data.data;
          } else if (data && Array.isArray(data)) {
            produitsData = data;
          } else {
            produitsData = [];
          }

          this.produits1 = produitsData;
          resolve();
        },
        error: error => {
          this.produits1 = [];
          reject(error);
        }
      });
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
      numero_lot: '',
      reduc: 0,
      taxe: 0.2,
      total: 0,
      reducMode: 'montant',
      articleSearch: '',
      depot_id: this.normalizeDepotId(this.ReceptionForm.get('depot_id')?.value)
    });
    const newIndex = this.produits.length - 1;
    this.recalculateTotal(newIndex);
  }

  removeProduit(index: number) {
    const produit = this.produits[index];

    if (produit.id) {
      this.produitsSupprimes.push(produit.id);

      this.achatsService.deleteReceptionLignes(this.produitsSupprimes).subscribe({
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
      this.produits[index].depot_id = this.normalizeDepotId(this.produits[index].depot_id ?? this.ReceptionForm.get('depot_id')?.value);
      this.recalculateTotal(index);
    }

    this.ligneSelectionnee = index;
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
    if (!articles.length) {
      return;
    }

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
      if (selectedArticle) {
        this.selectArticle(index, selectedArticle);
      }
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
    this.filteredArticles[index] = [];
    this.highlightedArticleIndex[index] = -1;

    this.produits[index].designation = article.article_nom;
    this.produits[index].pu = article.pu || 0;
    this.produits[index].qte = 1;
    this.produits[index].reduc = 0;
    this.produits[index].taxe = (article.taxe ?? 0.2);
    this.produits[index].depot_id = this.normalizeDepotId(this.produits[index].depot_id ?? this.ReceptionForm.get('depot_id')?.value);
    this.recalculateTotal(index);
  }

  private escLetter(value: any): string {
    return String(value ?? '-')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  showArticleFiche(index: number): void {
    const line = this.produits?.[index];
    const articleId = Number(line?.article_id || 0);
    if (!articleId) {
      Swal.fire({ icon: 'info', title: 'Article non selectionne', text: 'Veuillez choisir un article d abord.' });
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
      prix_vente: a.prix_vente ?? a.pu ?? line?.pu,
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

  AllFournisseurs() {
    this.baseService.getFournisseur().subscribe({
      next: (data) => {
        let fournisseursData = data;
        if (data && data.data && Array.isArray(data.data)) {
          fournisseursData = data.data;
        } else if (data && Array.isArray(data)) {
          fournisseursData = data;
        } else {
          fournisseursData = [];
        }

        this.fournisseurs = fournisseursData;
        this.filteredFournisseurs = [...this.fournisseurs];
      },
      error: (err) => {
        this.fournisseurs = [];
        this.filteredFournisseurs = [];
      }
    });
  }

  onSearchChange(term: string | null | undefined) {
    if (!term || this.normalizeValue(term).length === 0) {
      this.filteredFournisseurs = [...this.fournisseurs];
      return;
    }

    if (!Array.isArray(this.fournisseurs) || this.fournisseurs.length === 0) {
      this.filteredFournisseurs = [];
      return;
    }

    this.filteredFournisseurs = this.fournisseurs.filter((fournisseur: any) => {
      if (!fournisseur) {
        return false;
      }

      const searchSources = [
        fournisseur.nom,
        fournisseur.raison_sociale,
        fournisseur.raisonSociale,
        fournisseur.rs,
        fournisseur.part_ref,
        fournisseur.nom_commercial,
        fournisseur.email,
        fournisseur.telephone
      ];

      return searchSources.some(source => source && this.matchTerm(source, term));
    });
  }

  selectFournisseur(fournisseur: any) {
    if (!fournisseur) {
      return;
    }

    this.ReceptionForm.patchValue({
      fournisseurSearch: fournisseur.nom,
      part_id: fournisseur.part_id
    }, { emitEvent: false });
    this.filteredFournisseurs = [];
    this.searchTerm = fournisseur.nom;
  }

  get fournisseurSearchControl() {
    return this.ReceptionForm.get('fournisseurSearch') as FormControl;
  }

  getDepotLabel(): string {
    const depotId = this.normalizeDepotId(this.ReceptionForm.get('depot_id')?.value);
    if (!depotId) {
      return (this.reception as any)?.depot_nom || '-';
    }
    const depot = (this.depots || []).find((d: any) => Number(d?.id) === depotId);
    return depot?.nom || (this.reception as any)?.depot_nom || '-';
  }

  onDepotHeaderChange(): void {
    this.reception = {
      ...this.reception,
      depot_nom: this.getDepotLabel()
    };
    this.applyHeaderDepotToLines(true);
  }

  private applyHeaderDepotToLines(forceAll: boolean): void {
    const headerDepotId = this.normalizeDepotId(this.ReceptionForm.get('depot_id')?.value);
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

  enregistrerTout(): void {
    const lignesAModifier: any[] = [];
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    const headerDepotId = this.normalizeDepotId(this.ReceptionForm.get('depot_id')?.value);
    if (!headerDepotId) {
      this.ReceptionForm.get('depot_id')?.markAsTouched();
      Swal.fire({
        icon: 'warning',
        title: 'Depot obligatoire',
        text: 'Veuillez selectionner un depot en en-tete.'
      });
      return;
    }
    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];

      if (!p.article_id || !p.pu || !p.qte) {
        Swal.fire({
          icon: 'error',
          title: 'Ligne invalide',
          html: `âŒ La ligne <strong>${i + 1}</strong> est incomplÃ¨te (article, prix ou quantitÃ© manquants).`,
        });
        return;
      }
      const lineDepotId = this.normalizeDepotId(p.depot_id) ?? headerDepotId;
      if (!lineDepotId) {
        Swal.fire({
          icon: 'warning',
          title: 'Depot obligatoire',
          text: `Veuillez selectionner un depot pour la ligne ${i + 1}.`
        });
        return;
      }
      p.depot_id = lineDepotId;

      const pOriginal = this.produitsOriginal[i];

      if (!pOriginal) {
        const ligneAInserer: any = {
          article_id: p.article_id,
          designation: p.designation,
          pu: p.pu,
          qte: p.qte,
          numero_lot: p.numero_lot || '',
          tva: 0.2,
          depot_id: lineDepotId,
          stock_id: document_id,
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
        p.designation !== pOriginal.designation ||
        p.article_id !== pOriginal.article_id ||
        p.pu !== pOriginal.pu ||
        p.qte !== pOriginal.qte ||
        (p.numero_lot || '') !== (pOriginal.numero_lot || '') ||
        this.normalizeDepotId(p.depot_id) !== this.normalizeDepotId(pOriginal.depot_id) ||
        p.reduc !== pOriginal.reduc ||
        p.reducMode !== pOriginal.reducMode ||
        p.taxe !== pOriginal.taxe
      );

      if (modifie) {
        const ligneAEnvoyer: any = {
          id: p.id,
          article_id: p.article_id,
          designation: p.designation,
          pu: p.pu,
          qte: p.qte,
          numero_lot: p.numero_lot || '',
          tva: 0.2,
          depot_id: lineDepotId,
          stock_id: document_id,
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
      Swal.fire({
        icon: 'info',
        title: 'Aucune modification',
        text: 'â„¹ï¸ Aucune ligne modifiÃ©e ou ajoutÃ©e.',
      });
      return;
    }

    this.achatsService.saveReceptionDetails(lignesAModifier).subscribe({
      next: (res) => {
        Swal.fire({
          icon: 'success',
          title: 'Enregistrement rÃ©ussi',
          text: `âœ… ${lignesAModifier.length} ligne(s) enregistrÃ©e(s) avec succÃ¨s.`,
        });

        this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
      },
      error: (err) => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: "âŒ Une erreur est survenue lors de l'enregistrement.",
        });
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

  voirReception(): void {
    const id = this.route.snapshot.paramMap.get('document_id');
    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }

    Swal.fire({
      title: 'GÃ©nÃ©ration en cours...',
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    this.achatsService.generateReceptionPDF(+id).subscribe({
      next: (res) => {
        Swal.close();
        const url = res?.pdfUrl;
        if (url) {
          window.open(url, '_blank');
        } else {
          Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reÃ§u.' });
        }
      },
      error: (err) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: err.error?.message || "Erreur lors de la gÃ©nÃ©ration du PDF." });
      }
    });
  }

  info: any = {
    nom: '',
    adresse: '',
    telephone: '',
    email: '',
    ice: ''
  };
}


