import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import Quill from 'quill';
import Swal from 'sweetalert2';
import { forkJoin, of } from 'rxjs';
import { catchError, retry } from 'rxjs/operators';
const QuillMention = require('quill-mention');
declare var bootstrap: any;
Quill.register('modules/mention', QuillMention.default);

@Component({
  selector: 'app-edit-contrat',
  templateUrl: './edit-contrat.component.html',
  styleUrls: ['./edit-contrat.component.css']
})
export class EditContratComponent implements OnInit {
  produits1: any[] = [];
  mode: 'editor' | 'table' = 'table';
  ligneSelectionnee: number | null = null;
  modules: any = {};
  editInfos = false;
  ContratForm!: FormGroup;
  clients: any;
  filteredClients: any[] = [];
  searchTerm = '';
  conditionsPaiement: any[] = [];
  produitsOriginal: any[] = [];
  produitsSupprimes: number[] = [];
  successMessage: string | null = null;
  isError: boolean = false;
  numeroContrat: string = 'CT25-0001';
  info: any;

  contrat = {
    client: 'Nom du client',
    date: new Date().toISOString().substring(0, 10),
    description: 'Description du contrat',
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

  fraisPort = 0;
  sousTotal = 0;
  taxeTotal = 0;
  reducTotal = 0;
  totalGeneral = 0;
  isClientExonerated = false;
  private exoCheckToken = 0;

  constructor(
    private baseService: BaseService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private ventesService: VentesService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.modules = {};
    this.initForm();
    const id = +this.route.snapshot.paramMap.get('id')!;

    forkJoin({
      produits: this.baseService.getProduit(),
      clients: this.baseService.getClient(),
      conditions: this.ventesService.getConditionsPaiement(),
      contrat: this.ventesService.getContrat(id)
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
        this.configureQuillModules();

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

        let conditionsData = data.conditions?.data || data.conditions || [];
        this.conditionsPaiement = Array.isArray(conditionsData) ? conditionsData : [];

        this.processContratData(data.contrat);
      },
      error: (err) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors du chargement des données.' });
      }
    });

    this.ContratForm.get('clientSearch')?.valueChanges.subscribe(value => {
      this.searchTerm = value || '';
      this.onSearchChange(value);
    });
  }

  private processContratData(response: any): void {
    const data = response?.data || response;

    if (!data) {
      Swal.fire({
        icon: 'error',
        title: 'Erreur',
        text: 'Contrat introuvable.',
      });
      return;
    }

    this.numeroContrat = data.numero || 'CT25-0001';

    const clientTrouve = this.clients?.find((c: any) => +c.part_id === +data.part_id);

    this.ContratForm.patchValue({
      date: data.date ? data.date.substring(0, 10) : '',
      description: data.description || '',
      part_id: data.part_id,
      clientSearch: clientTrouve?.nom || '',
      date_planif: data.date_planif ? data.date_planif.substring(0, 10) : '',
      date_expire: data.date_expire ? data.date_expire.substring(0, 10) : '',
      condition_id: data.condition_id || null
    });

    if (data.part_id) {
      this.checkClientExoneration(+data.part_id);
    } else {
      this.isClientExonerated = false;
    }

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
          designation: d.designation || '',
          pu: d.prix,
          qte: d.quantite,
          reduc: reducValue,
          reducMode: reducMode,
          taxe: d.tva || 0.2,
          total: d.total || (d.prix * d.quantite)
        };
      });
    }

    this.info = {
      nom: clientTrouve?.nom || '',
      adresse: '',
      telephone: '',
      email: '',
      ice: ''
    };

    this.contrat = {
      client: clientTrouve?.nom || 'Client inconnu',
      date: data.date ? data.date.substring(0, 10) : '',
      description: data.description || ''
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
    this.ContratForm = this.fb.group({
      date: ['', Validators.required],
      description: [''],
      part_id: [0],
      date_planif: [''],
      date_expire: [''],
      condition_id: [null],
      clientSearch: ['']
    });
  }

  toggleEdit(): void {
    const id = +this.route.snapshot.paramMap.get('id')!;
    this.editInfos = !this.editInfos;
    if (!this.editInfos) {
      this.ventesService.updateContrat(id, this.ContratForm.value).subscribe({
        next: (res) => {
          this.showNotification('✅ Contrat modifié avec succès', false);
        },
        error: (err) => {
          this.showNotification('❌ Erreur lors de la modification', true);
        }
      });
    }
  }

  onSearchChange(term: string | null | undefined) {
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

    this.ContratForm.patchValue({
      clientSearch: client.nom,
      part_id: client.part_id
    }, { emitEvent: false });
    this.filteredClients = [];
    this.searchTerm = client.nom;

    if (client.part_id) {
      this.checkClientExoneration(+client.part_id);
    } else {
      this.isClientExonerated = false;
      this.calculerTotaux();
    }

    this.info = {
      nom: client.nom || '',
      adresse: '',
      telephone: '',
      email: '',
      ice: ''
    };
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
      const taux = this.isClientExonerated ? 0 : 0.2;
      const tva = taux * baseApresReduc;
      return acc + tva;
    }, 0);

    this.totalGeneral = baseApresReduc + this.taxeTotal + this.fraisPort;
  }

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

      this.ventesService.RemoveDetailLigneContrat(this.produitsSupprimes).subscribe({
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

  activerModeEditor() {
    this.mode = 'editor';
    if (this.ligneSelectionnee === null && this.produits.length > 0) {
      this.ligneSelectionnee = 0;
    }
  }

  enregistrerTout(): void {
    const lignesAModifier: any[] = [];
    const document_id = +this.route.snapshot.paramMap.get('id')!;
    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      const desiredTax = this.isClientExonerated ? 0 : 0.2;

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
          tva: desiredTax,
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
        desiredTax !== pOriginal.taxe
      );

      if (modifie) {
        const ligneAEnvoyer: any = {
          id: p.id,
          article_id: p.article_id,
          designation: p.designation,
          pu: p.pu,
          qte: p.qte,
          tva: desiredTax,
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

    this.ventesService.SaveLignesDetailContrat(lignesAModifier).subscribe({
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

  getConditionNom(conditionId: number | null): string {
    if (!conditionId) return '';
    const condition = this.conditionsPaiement.find(c => c.id === conditionId);
    return condition ? condition.nom : '';
  }

  goBack(): void {
    this.router.navigate(['/Contrat']);
  }
}
