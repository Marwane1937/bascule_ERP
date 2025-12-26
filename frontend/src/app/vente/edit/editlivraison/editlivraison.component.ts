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
Quill.register('modules/mention', QuillMention.default); // 👈 ajoute .default ici

@Component({
  selector: 'app-editlivraison',
  templateUrl: './editlivraison.component.html',
  styleUrls: ['./editlivraison.component.css']
})
export class EditlivraisonComponent implements OnInit {
  produits1: any[] = [];
  editFacturation = false;
  mode: 'editor' | 'table' = 'table'; // ✅ mode TABLE par défaut
  ligneSelectionnee: number | null = null; // ✅ ligne actuellement sélectionnée pour édition
  modules: any = {}; // Quill modules ici
  editInfos = false;
  LivraisonForm!: FormGroup;
  clients: any;
  filteredClients: any[] = [];
  searchTerm = '';
  searchCommercial = '';
  commerciaux: any[] = [];
  filteredCommerciaux: any[] = [];
  selectedCommercial: any = null;
  produitsOriginal: any[] = [];
  reductionMode: 'percent' | 'amount' = 'percent'; // Valeur par défaut
  reducMode: 'pourcentage' | 'montant' = 'pourcentage';
  produitsSupprimes: number[] = [];
  successMessage: string | null = null;
  isError: boolean = false;
  emailForm: FormGroup;
  info: any;
  condition: any;
  isSending: boolean = false;
  numeroLivraison: string = 'LV25-0001'; // Numéro par défaut

  livraison = {
    client: 'Nom du client',
    commercial: 'Nom du commercial',
    adresse: 'Adresse du client',
    date: new Date().toISOString().substring(0, 10), // format yyyy-MM-dd pour input date
    description: 'Description de la livraison',
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

  filteredArticles: { [key: number]: any[] } = {}; // Liste filtrée d'articles par index de ligne

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
  isClientExonerated = false; // même logique que edit-devis / edit-commande
  private exoCheckToken = 0;

  constructor(private baseService: BaseService, private fb: FormBuilder, private route: ActivatedRoute,
    private venteSerivce: VentesService, private emailService: EmailService,
    private cdr: ChangeDetectorRef
  ) {
    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      cc: [''],
      subject: ['Livraison à votre attention'],
      body: ['Bonjour,\n\nVeuillez trouver ci-joint le bon de livraison demandé.\n\nCordialement,']
    });
  }

  ngOnInit(): void {
    this.modules = {};
    this.initForm();
    
      const id = +this.route.snapshot.paramMap.get('document_id')!;
    
    // Charger toutes les données en parallèle pour accélérer le chargement
    forkJoin({
      produits: this.baseService.getProduit(),
      clients: this.baseService.getClient(),
      commerciaux: this.baseService.getCommercial(),
      livraison: this.venteSerivce.getLivraisonById(id)
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
        
        // Traitement de la livraison (après que clients et commerciaux soient prêts)
        this.processLivraisonData(data.livraison);
      },
      error: (err) => {
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

  // Traitement des données de livraison après chargement parallèle
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

    this.LivraisonForm.patchValue({
      date: data.date ? data.date.substring(0, 10) : '',
      description: data.description || '',
      part_id: data.part_id,
      contact_id: data.contact_id,
      clientSearch: clientTrouve?.nom || '',
      commercialSearch: commercialTrouve?.nom || ''
    });

    // Vérifier l'exonération TVA au chargement (même que edit-devis)
    if (data.part_id) {
      this.checkClientExoneration(+data.part_id);
    } else {
      this.isClientExonerated = false;
    }

    // Traitement des détails
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
    this.LivraisonForm = this.fb.group({
      date: ['', Validators.required],
      description: [''],
      part_id: [0],
      contact_id: [0],
      date_fin: [''],
      etat: [1],


      clientSearch: [''],   // le texte visible pour client
      commercialSearch: [''] // le texte visible pour commercial
    });
  }
  loadLivraisonById(id: number) {
    this.venteSerivce.getLivraisonById(id).subscribe({
      next: (response) => {
        // Gérer le format de réponse (peut être { success: true, data: {...} } ou directement l'objet)
        const data = response?.data || response;

        if (!data) {
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
            description: data.description || ''
          };

          this.LivraisonForm.patchValue({
            clientSearch: clientNom,
            commercialSearch: commercialNom,
            part_id: clientTrouve?.part_id ?? data.part_id ?? 0,
            contact_id: commercialTrouve?.id ?? data.contact_id ?? 0
          }, { emitEvent: false });
        };

        waitForClients();

        const detailsArray = Array.isArray(data?.details) ? data.details : [];

        this.produits = detailsArray.map((detail: any, index: number) => {
          const articleId = detail.article_id != null ? Number(detail.article_id) : 0;

          // S'assurer que produits1 est chargé avant de chercher
          const produitTrouve = Array.isArray(this.produits1) && this.produits1.length > 0
            ? this.produits1.find(p => Number(p.article_id) === articleId)
            : null;

          let reduc = 0;
          let reducMode = 'montant';

          // Vérifier d'abord si remise_montant existe (priorité au montant) - comme editCommande
          // Note: remise_montant peut être 0, donc on vérifie !== null et !== undefined
          if (detail.remise_montant != null && detail.remise_montant !== undefined) {
            reduc = +detail.remise_montant;
            reducMode = 'montant';
          } else if (detail.remise != null && detail.remise !== undefined) {
            // remise est un pourcentage décimal (0.1 = 10%), on le convertit en pourcentage (10)
            // Note: remise peut être 0, donc on vérifie !== null et !== undefined
            reduc = +detail.remise * 100; // Ex. 0.1 => 10%
            reducMode = 'pourcentage';
          }

          const taxe = detail.taux_tva ?? detail.tva ?? produitTrouve?.taxe ?? 0.2;
          const pu = detail.pu ?? detail.prix ?? produitTrouve?.pu ?? 0;
          const qte = detail.qte ?? detail.quantite ?? 1;
          const designation = detail.designation || detail.description || produitTrouve?.article_nom || '';

          return {
            id: detail.id ?? detail.detail_id ?? 0,
            article_id: articleId,
            designation,
            pu: +pu,
            qte: +qte,
            reduc: +reduc,
            reducMode: reducMode,
            taxe: +taxe,
            total: 0,
            articleSearch: produitTrouve ? produitTrouve.article_nom : (designation || '')
          };
        });

        if (this.produits.length === 0) {
          this.produits = [{
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
        }

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

        this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
        this.produits.forEach((_, i) => this.recalculateTotal(i));
        this.calculerTotaux();
      },
      error: (err) => {
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
    this.editInfos = !this.editInfos;
    if (!this.editInfos) {
      this.venteSerivce.updateLivraison(document_id, this.LivraisonForm.value).subscribe({
        next: (res) => {
          this.info = {
            nom: res.clientInfo?.nom || this.info.nom,
            adresse: res.clientInfo?.adresse || this.info.adresse,
            telephone: res.clientInfo?.telephone || this.info.telephone,
            email: res.clientInfo?.email || this.info.email,
            ice: res.clientInfo?.ice || this.info.ice
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
          // Gérer différents formats de réponse
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
          resolve(); // ✅ permet le .then()
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

  recalculateTotal(index: number) {
    const prod = this.produits[index];
    const base = prod.pu * prod.qte;

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

    // TVA: 0% si client exonéré valide, sinon 20%
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

  // Vérifier si le client a une exonération TVA valide (même que edit-devis + fiabilisation)
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

    // Si l'élément a un ID, on le garde pour suppression backend
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
    this.produits.splice(index, 1);

    // Recalculer les totaux
    this.calculerTotaux();
  }


  onProduitSelected(index: number) {
    const articleId = this.produits[index].article_id;
    const produitTrouve = this.produits1.find(p => +p.article_id === +articleId);
    if (produitTrouve) {
      this.produits[index].designation = produitTrouve.article_nom; // ✅ met la désignation dans le champ
      this.produits[index].pu = produitTrouve.pu || 0;
      this.produits[index].qte = 1;
      this.produits[index].reduc = 0;
      this.produits[index].taxe = (produitTrouve.taxe ?? 0.2);
      this.recalculateTotal(index);
    }

    // ✅ Active le mode éditeur pour cette ligne
    this.ligneSelectionnee = index;
    this.mode = 'editor';
  }

  // Méthodes pour l'auto-complétion des articles
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

    // Vérifier que produits1 est chargé
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

    // Mettre à jour les autres propriétés
    this.produits[index].designation = article.article_nom;
    this.produits[index].pu = article.pu || 0;
    this.produits[index].qte = 1;
    this.produits[index].reduc = 0;
    this.produits[index].taxe = (article.taxe ?? 0.2);
    this.recalculateTotal(index);
  }

  activerModeEditor() {
    this.mode = 'editor';

    // S'il n'y a pas de ligne sélectionnée, on sélectionne la première par défaut
    if (this.ligneSelectionnee === null && this.produits.length > 0) {
      this.ligneSelectionnee = 0;
    }
  }

  AllClients() {
    this.baseService.getClient().subscribe({
      next: (data) => {
        // Gérer différents formats de réponse
        let clientsData = data;
        if (data && data.data && Array.isArray(data.data)) {
          clientsData = data.data;
        } else if (data && Array.isArray(data)) {
          clientsData = data;
        } else {
          clientsData = [];
        }

        this.clients = clientsData;
        this.filteredClients = [...this.clients];
      },
      error: (err) => {
        this.clients = [];
        this.filteredClients = [];
      }
    });
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

    this.LivraisonForm.patchValue({
      clientSearch: client.nom,
      part_id: client.part_id // ou client.id selon ton modèle
    }, { emitEvent: false });
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
    return this.LivraisonForm.get('clientSearch') as FormControl;
  }


  AllCommerciaux() {
    this.baseService.getCommercial().subscribe({
      next: (data) => {
        // Gérer différents formats de réponse
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
      },
      error: (err) => {
        this.commerciaux = [];
        this.filteredCommerciaux = [];
      }
    });
  }

  onCommercialSearchChange(term: string | null | undefined) {
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
    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      const desiredTax = this.isClientExonerated ? 0 : 0.2;

      // Vérifie si la ligne est incomplète
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
        // Nouvelle ligne
        // const taxeValue = Math.min(+p.taxe, 100);
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
          // p.reduc est en pourcentage (10), on doit le convertir en décimal (0.1) pour la base de données
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          ligneAInserer.remise = reducValue / 100; // Ex. 10 => 0.1
          ligneAInserer.remise_montant = null; // Doit être null pour le mode pourcentage
        } else {
          // p.reduc est déjà en montant (dh)
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          ligneAInserer.remise_montant = reducValue;
          ligneAInserer.remise = null; // Doit être null pour le mode montant
        }

        lignesAModifier.push(ligneAInserer);

        continue;
      }

      // Vérifie si la ligne a été modifiée

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
        //const taxeValue = Math.min(+p.taxe, 100); 
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
          // p.reduc est en pourcentage (10), on doit le convertir en décimal (0.1) pour la base de données
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          ligneAEnvoyer.remise = reducValue / 100; // Ex. 10 => 0.1
          ligneAEnvoyer.remise_montant = null; // Par sécurité - doit être null pour le mode pourcentage
        } else {
          // p.reduc est déjà en montant (dh)
          const reducValue = p.reduc != null ? Number(p.reduc) : 0;
          ligneAEnvoyer.remise_montant = reducValue;
          ligneAEnvoyer.remise = null; // Par sécurité - doit être null pour le mode montant
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

    // 🔄 Envoi des lignes modifiées ou nouvelles vers l'API
    this.venteSerivce.SaveLignesDetailLivraison(lignesAModifier).subscribe({
      next: (res) => {
        Swal.fire({
          icon: 'success',
          title: 'Enregistrement réussi',
          text: `✅ ${lignesAModifier.length} ligne(s) enregistrée(s) avec succès.`,
        });

        // Mise à jour de la version originale
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
          title: 'E-mail envoyé !',
          text: 'La livraison a été envoyée avec succès.',
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
          text: "Échec de l'envoi de l'e-mail."
        });
      }
    });
  }

  // Dans votre service Angular, ajoutez :

  // Dans votre composant, remplacez envoyerWhatsApp par :
  envoyerWhatsApp(livraison: any) {
    const numero = prompt('Entrez le numéro WhatsApp du client (ex: 212612345678):');
    if (!numero) return;

    // Nettoyer le numéro
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
    loadingElement.innerHTML = '🔄 Envoi du PDF via WhatsApp...';
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
          alert('✅ PDF envoyé en pièce jointe via WhatsApp !');
        } else {
          alert('❌ Erreur: ' + res.message);
        }
      },
      error: (err) => {
        if (document.body.contains(loadingElement)) {
          document.body.removeChild(loadingElement);
        }
        alert('❌ Erreur: ' + (err.error?.message || err.message));
      }
    });
  }

  voirLivraison(withStamp: boolean = false) {
    const id = this.route.snapshot.paramMap.get('document_id');
    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }

    // Vérifier s'il y a des modifications non enregistrées
    const hasModifications = this.checkForModifications();
    
    if (hasModifications) {
      // Enregistrer d'abord, puis générer le PDF
      this.enregistrerEtGenererPDF(id);
    } else {
      // Pas de modifications, générer directement le PDF
      this.genererPDF(id);
    }
  }

  // Vérifie s'il y a des modifications non enregistrées
  private checkForModifications(): boolean {
    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      const pOriginal = this.produitsOriginal[i];
      
      if (!pOriginal) return true; // Nouvelle ligne
      
      const modifie = (
        p.designation !== pOriginal.designation ||
        p.article_id !== pOriginal.article_id ||
        p.pu !== pOriginal.pu ||
        p.qte !== pOriginal.qte ||
        p.reduc !== pOriginal.reduc ||
        p.reducMode !== pOriginal.reducMode ||
        p.taxe !== pOriginal.taxe
      );
      
      if (modifie) return true;
    }
    return false;
  }

  // Enregistre les modifications puis génère le PDF
  private enregistrerEtGenererPDF(documentId: string): void {
    const lignesAModifier: any[] = [];
    const document_id = +documentId;
    
    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];
      const desiredTax = this.isClientExonerated ? 0 : 0.2;
      
      if (!p.article_id || !p.pu || !p.qte) {
        Swal.fire({
          icon: 'error',
          title: 'Ligne invalide',
          html: `❌ La ligne <strong>${i + 1}</strong> est incomplète. Veuillez compléter avant d'imprimer.`,
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
      // Pas de modifications à enregistrer, générer directement le PDF
      this.genererPDF(documentId);
      return;
    }

    // Enregistrer puis générer le PDF
    this.venteSerivce.SaveLignesDetailLivraison(lignesAModifier).subscribe({
      next: (res) => {
        this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
        this.showNotification('✅ Modifications enregistrées', false);
        // Générer le PDF après l'enregistrement
        this.genererPDF(documentId);
      },
      error: (err) => {
        Swal.fire({
          icon: 'error',
          title: 'Erreur',
          text: "❌ Impossible d'enregistrer les modifications avant l'impression.",
        });
      }
    });
  }

  // Génère le PDF
  private genererPDF(documentId: string): void {
    this.emailService.generateDevisPDF(documentId).subscribe({
      next: (res) => {
        const url = res?.pdfUrl;
        if (url) {
          window.open(url, '_blank');
        } else {
          Swal.fire({ icon: 'error', title: 'Erreur', text: 'Lien PDF non reçu.' });
        }
      },
      error: (err) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: "Erreur lors de la génération du PDF." });
      }
    });
  }
}
