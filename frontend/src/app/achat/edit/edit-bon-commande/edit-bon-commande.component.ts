import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { AchatsService } from 'src/app/service/achats.service';
import Swal from 'sweetalert2';
import { EmailService } from 'src/app/service/email.service';
import { forkJoin } from 'rxjs';
declare var bootstrap: any;

@Component({
  selector: 'app-edit-bon-commande',
  templateUrl: './edit-bon-commande.component.html',
  styleUrls: ['./edit-bon-commande.component.css']
})
export class EditBonCommandeComponent implements OnInit {
  produits1: any[] = [];
  editInfos = false;
  BonCommandeForm!: FormGroup;
  fournisseurs: any[] = [];
  filteredFournisseurs: any[] = [];
  searchTerm = '';
  produitsOriginal: any[] = [];
  reductionMode: 'percent' | 'amount' = 'percent';
  reducMode: 'pourcentage' | 'montant' = 'pourcentage';
  produitsSupprimes: number[] = [];
  successMessage: string | null = null;
  isError: boolean = false;
  emailForm: FormGroup;
  info: any;
  condition: any;
  isSending: boolean = false;
  numeroBonCommande: string = 'BCF25-0001';

  bonCommande = {
    fournisseur: 'Nom du fournisseur',
    adresse: 'Adresse du fournisseur',
    date: new Date().toISOString().substring(0, 10),
    description: 'Description du bon de commande',
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
  }];

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
  isFournisseurExonerated = false;
  private exoCheckToken = 0;

  constructor(
    private baseService: BaseService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private achatsService: AchatsService,
    private emailService: EmailService,
    private cdr: ChangeDetectorRef
  ) {
    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      cc: [''],
      subject: ['Bon de Commande à votre attention'],
      body: ['Bonjour,\n\nVeuillez trouver ci-joint le bon de commande.\n\nCordialement,']
    });
  }

  ngOnInit(): void {
    this.initForm();

    const id = +this.route.snapshot.paramMap.get('document_id')!;

    // Charger toutes les données en parallèle
    forkJoin({
      produits: this.baseService.getProduit(),
      fournisseurs: this.baseService.getFournisseur(),
      bonCommande: this.achatsService.getBonCommandeById(id)
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

        // Traitement des fournisseurs
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

        // Traitement du bon de commande
        this.processBonCommandeData(data.bonCommande, id);
      },
      error: (err) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors du chargement des données.' });
      }
    });

    // Abonnement sur les changements de texte
    this.BonCommandeForm.get('fournisseurSearch')?.valueChanges.subscribe(value => {
      this.onSearchChange(value);
    });

    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      cc: [''],
      subject: ['', Validators.required],
      body: ['', Validators.required]
    });
  }

  private processBonCommandeData(response: any, id: number): void {
    const data = response?.data || response;

    if (!data) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'Bon de commande introuvable.' });
      return;
    }

    this.numeroBonCommande = data.numero || 'BCF25-0001';

    const fournisseurTrouve = this.fournisseurs?.find((f: any) => +f.part_id === +data.part_id);

    this.bonCommande = {
      fournisseur: fournisseurTrouve ? fournisseurTrouve.nom : 'Fournisseur inconnu',
      adresse: fournisseurTrouve ? fournisseurTrouve.adresse : '',
      date: data.date,
      description: data.description || ''
    };

    this.BonCommandeForm.patchValue({
      date: data.date,
      description: data.description,
      part_id: data.part_id,
      fournisseurSearch: fournisseurTrouve ? fournisseurTrouve.nom : ''
    });

    // Traitement des détails
    if (!data.details || !Array.isArray(data.details)) {
      this.produits = [];
    } else {
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

        const base = +detail.prix * +detail.quantite;
        let reductionMontant = reducMode === 'pourcentage' ? (reduc / 100) * base : reduc;
        const totalLigne = Math.max(0, base - reductionMontant);

        return {
          id: detail.id,
          article_id: detail.article_id,
          designation: detail.designation,
          pu: +detail.prix,
          qte: +detail.quantite,
          reduc: reduc,
          reducMode: reducMode,
          taxe: detail.taux_tva != null && detail.taux_tva !== undefined ? +detail.taux_tva : 0.2,
          total: totalLigne,
          articleSearch: produitTrouve ? produitTrouve.article_nom : ''
        };
      });
    }

    // Traitement des infos fournisseur
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
        date: data.date || new Date().toISOString().split('T')[0],
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
    this.produits.forEach((_, i) => this.recalculateTotal(i));
  }

  initForm(): void {
    this.BonCommandeForm = this.fb.group({
      date: ['', Validators.required],
      description: [''],
      part_id: [0],
      date_fin: [''],
      etat: [1],
      fournisseurSearch: ['']
    });
  }

  toggleEdit(): void {
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    this.editInfos = !this.editInfos;
    if (!this.editInfos) {
      this.achatsService.updateBonCommande(document_id, this.BonCommandeForm.value).subscribe({
        next: (res: any) => {
          if (res.client_infos) {
            this.info = {
              nom: res.client_infos.nom,
              adresse: res.client_infos.adresse,
              telephone: res.client_infos.telephone,
              email: res.client_infos.email,
              ice: res.client_infos.ice
            };
          }
          this.showNotification('Informations mises à jour', false);
        },
        error: (err) => {
          this.showNotification('Erreur lors de la mise à jour', true);
        }
      });
    }
  }

  AllProduits(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.baseService.getProduit().subscribe({
        next: (data: any) => {
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
        error: (error) => {
          this.produits1 = [];
          reject(error);
        }
      });
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
      const taux = this.isFournisseurExonerated ? 0 : 0.2;
      const tva = taux * baseApresReduc;
      return acc + tva;
    }, 0);

    this.totalGeneral = baseApresReduc + this.taxeTotal + this.fraisPort;
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

      this.achatsService.deleteLignesParIds(this.produitsSupprimes).subscribe({
        next: (res: any) => {
          this.showNotification(res.message || 'Ligne supprimée', false);
          this.produitsSupprimes = [];
        },
        error: (err: any) => {
          this.showNotification(err.message || 'Erreur de suppression', true);
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
      next: (data: any) => {
        let fournisseursData = data;
        if (data && data.data && Array.isArray(data.data)) {
          fournisseursData = data.data;
        } else if (data && Array.isArray(data)) {
          fournisseursData = data;
        } else {
          fournisseursData = [];
        }

        this.fournisseurs = fournisseursData;
        this.filteredFournisseurs = [];
      },
      error: (err) => {
        this.fournisseurs = [];
        this.filteredFournisseurs = [];
      }
    });
  }

  onSearchChange(term: string) {
    term = term.trim().toLowerCase();

    if (term.length === 0) {
      this.filteredFournisseurs = [];
      return;
    }

    this.filteredFournisseurs = this.fournisseurs.filter((fournisseur: any) =>
      fournisseur.nom.toLowerCase().includes(term)
    );
  }

  selectFournisseur(fournisseur: any) {
    this.BonCommandeForm.patchValue({
      fournisseurSearch: fournisseur.nom,
      part_id: fournisseur.part_id
    });
    this.filteredFournisseurs = [];
    this.searchTerm = fournisseur.nom;
  }

  get fournisseurSearchControl() {
    return this.BonCommandeForm.get('fournisseurSearch') as FormControl;
  }

  enregistrerTout(): void {
    const lignesAModifier: any[] = [];
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;

    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      const desiredTax = this.isFournisseurExonerated ? 0 : 0.2;

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
        text: 'ℹ️ Aucune ligne modifiée ou ajoutée.',
      });
      return;
    }

    this.achatsService.saveDetails(lignesAModifier).subscribe({
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

  saveInfo() {
    const docId = +this.route.snapshot.paramMap.get('document_id')!;
    this.selectedInfo.document_id = docId.toString();

    if (!this.selectedInfo.document_id) {
      return;
    }

    this.achatsService.saveInfo(this.selectedInfo).subscribe({
      next: (res: any) => {
        this.showNotification(res.message || 'Informations sauvegardées', false);
      },
      error: (err: any) => {
        this.showNotification(err.message || 'Erreur de sauvegarde', true);
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
      document_id: +this.route.snapshot.paramMap.get('document_id')!,
      type: 'bon-commande-achat'
    };

    Swal.fire({
      title: 'Envoi en cours...',
      html: '<div class="loading-spinner"></div><p>Veuillez patienter</p>',
      showConfirmButton: false,
      allowOutsideClick: false
    });

    // TODO: Implémenter l'envoi email pour bon de commande achat
    Swal.fire({
      icon: 'info',
      title: 'Fonctionnalité à venir',
      text: 'L\'envoi par email sera disponible prochainement.'
    });
    this.isSending = false;
  }

  voirBonCommande() {
    const id = this.route.snapshot.paramMap.get('document_id');

    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }

    Swal.fire({
      title: 'Génération du PDF...',
      html: '<div class="loading-spinner"></div><p>Veuillez patienter</p>',
      showConfirmButton: false,
      allowOutsideClick: false
    });

    this.achatsService.telechargerPDF(+id).subscribe({
      next: (blob: Blob) => {

        Swal.close();

        // Créer un URL pour le blob et l'ouvrir dans un nouvel onglet
        const url = window.URL.createObjectURL(blob);

        window.open(url, '_blank');

        // Libérer l'URL après un délai
        setTimeout(() => {
          window.URL.revokeObjectURL(url);
        }, 10000);
      },
      error: (err) => {

        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: 'Impossible de générer le PDF.'
        });
      }
    });
  }
}
