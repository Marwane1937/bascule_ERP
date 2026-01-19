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
    description: 'Description de la réception',
  };

  produits = [{
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
        
        this.processReceptionData(data.reception);
      },
      error: (err) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors du chargement des données.' });
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
        text: 'Réception introuvable.',
      });
      return;
    }

    this.numeroReception = data.numero || 'REC25-0001';

    const fournisseurTrouve = this.fournisseurs?.find((f: any) => +f.part_id === +data.part_id);

    this.ReceptionForm.patchValue({
      date: data.date ? data.date.substring(0, 10) : '',
      description: data.description || '',
      part_id: data.part_id,
      contact_id: data.contact_id,
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
          reduc: reducValue,
          reducMode: reducMode,
          taxe: d.tva || d.taux_tva || 0.2,
          total: d.total || ((d.pu || d.prix || 0) * (d.qte || d.quantite || 0))
        };
      });
    }

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
    this.editInfos = !this.editInfos;
    if (!this.editInfos) {
      this.achatsService.updateReception(document_id, this.ReceptionForm.value).subscribe({
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
    }
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
      this.recalculateTotal(index);
    }

    this.ligneSelectionnee = index;
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

  enregistrerTout(): void {
    const lignesAModifier: any[] = [];
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];

      if (!p.article_id || !p.pu || !p.qte) {
        Swal.fire({
          icon: 'error',
          title: 'Ligne invalide',
          html: `❌ La ligne <strong>${i + 1}</strong> est incomplète (article, prix ou quantité manquants).`,
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
          tva: 0.2,
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
          tva: 0.2,
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
        text: 'ℹ️ Aucune ligne modifiée ou ajoutée.',
      });
      return;
    }

    this.achatsService.saveReceptionDetails(lignesAModifier).subscribe({
      next: (res) => {
        Swal.fire({
          icon: 'success',
          title: 'Enregistrement réussi',
          text: `✅ ${lignesAModifier.length} ligne(s) enregistrée(s) avec succès.`,
        });

        this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
      },
      error: (err) => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: "❌ Une erreur est survenue lors de l'enregistrement.",
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
      title: 'Génération en cours...',
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
          Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reçu.' });
        }
      },
      error: (err) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: err.error?.message || "Erreur lors de la génération du PDF." });
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

