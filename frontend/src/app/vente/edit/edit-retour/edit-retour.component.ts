import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { VentesService } from 'src/app/service/ventes.service';
import Quill from 'quill';
import Swal from 'sweetalert2';
import { EmailService } from 'src/app/service/email.service';
const QuillMention = require('quill-mention');
declare var bootstrap: any;
Quill.register('modules/mention', QuillMention.default);

@Component({
  selector: 'app-edit-retour',
  templateUrl: './edit-retour.component.html',
  styleUrls: ['./edit-retour.component.css']
})
export class EditRetourComponent implements OnInit {
  produits1: any[] = [];
  editFacturation = false;
  mode: 'editor' | 'table' = 'table';
  ligneSelectionnee: number | null = null;
  modules: any = {};
  editInfos = false;
  RetourForm!: FormGroup;
  clients: any;
  filteredClients: any[] = [];
  searchTerm = '';
  searchCommercial = '';
  commerciaux: any[] = [];
  filteredCommerciaux: any[] = [];
  selectedCommercial: any = null;
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
  numeroRetour: string = 'RT25-0001';

  retour = {
    client: 'Nom du client',
    commercial: 'Nom du commercial',
    adresse: 'Adresse du client',
    date: new Date().toISOString().substring(0, 10),
    description: 'Description du retour',
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
  highlightedArticleIndex: { [key: number]: number } = {};

  fraisPort = 0;
  sousTotal = 0;
  taxeTotal = 0;
  reducTotal = 0;
  totalGeneral = 0;

  constructor(private baseService: BaseService, private fb: FormBuilder, private route: ActivatedRoute,
    private venteSerivce: VentesService, private emailService: EmailService
  ) {
    this.emailForm = this.fb.group({
      to: ['', [Validators.required, Validators.email]],
      cc: [''],
      subject: ['Retour Client à votre attention'],
      body: ['Bonjour,\n\nVeuillez trouver ci-joint le retour client demandé.\n\nCordialement,']
    });
  }

  ngOnInit(): void {
    this.modules = {};
    this.configureQuillModules();
    this.AllProduits().then(() => {
      const id = +this.route.snapshot.paramMap.get('document_id')!;
      this.loadRetourById(id);
    });
    this.initForm();
    this.AllClients();
    this.AllCommerciaux();
    this.RetourForm.get('clientSearch')?.valueChanges.subscribe(value => {
      this.searchTerm = value || '';
      this.onSearchChange(value);
    });

    this.RetourForm.get('commercialSearch')?.valueChanges.subscribe(value => {
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
    this.RetourForm = this.fb.group({
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

  loadRetourById(id: number) {
    this.venteSerivce.getRetourById(id).subscribe({
      next: (data) => {
        this.numeroRetour = data.numero || data.stockNumero || data.documentNumero || 'RT25-0001';

        // Ne pas initialiser clientSearch et commercialSearch ici, attendre waitForClients
        this.RetourForm.patchValue({
          date: data.date || '',
          description: data.description || '',
          part_id: data.part_id || 0,
          contact_id: data.contact_id || 0
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

          const clientNom = clientTrouve?.nom || data.client || data.client_nom || data.clientInfo?.nom || '';
          const commercialNom = commercialTrouve?.nom || data.commercial || data.commercial_nom || '';

          this.retour = {
            client: clientNom || 'Client inconnu',
            commercial: commercialNom || 'Commercial inconnu',
            adresse: clientTrouve?.adresse || data.clientInfo?.adresse || '',
            date: data.date,
            description: data.description || ''
          };

          this.RetourForm.patchValue({
            clientSearch: clientNom,
            commercialSearch: commercialNom,
            part_id: clientTrouve?.part_id ?? data.part_id ?? 0,
            contact_id: commercialTrouve?.id ?? data.contact_id ?? 0
          }, { emitEvent: false });
        };

        waitForClients();

        const detailsArray = Array.isArray(data.details) ? data.details : [];

        this.produits = detailsArray.map((detail: any) => {
          const articleId = detail.article_id != null ? Number(detail.article_id) : 0;
          const produitTrouve = this.produits1.find(p => Number(p.article_id) === articleId);

          // Pas de réduction pour les retours
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
            reduc: 0,
            reducMode: 'montant',
            taxe: +taxe,
            total: 0,
            articleSearch: produitTrouve ? produitTrouve.article_nom : ''
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

        // Recalculer les totaux après chargement
        this.produits.forEach((_, i) => this.recalculateTotal(i));

        // Initialiser info même si clientInfo est null
        const clientInfoData = data.clientInfo || {};
        this.info = {
          nom: clientInfoData.nom || data.client || data.client_nom || '',
          adresse: clientInfoData.adresse || '',
          telephone: clientInfoData.telephone || '',
          email: clientInfoData.email || '',
          ice: clientInfoData.ice || ''
        };

        this.produitsOriginal = JSON.parse(JSON.stringify(this.produits));
        this.produits.forEach((_, i) => this.recalculateTotal(i));
      },
      error: (err) => {
      }
    });
  }

  toggleEdit(): void {
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;
    this.editInfos = !this.editInfos;
    if (!this.editInfos) {
      this.venteSerivce.updateRetour(document_id, this.RetourForm.value).subscribe({
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
        }
      });
    }
  }

  AllProduits(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.baseService.getProduit().subscribe({
        next: (response: any) => {
          this.produits1 = response?.data || (Array.isArray(response) ? response : []);
          this.configureQuillModules();
          resolve();
        },
        error: error => {
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

    // Pas de réduction pour les retours
    prod.total = base;

    this.calculerTotaux();
  }

  calculerTotaux() {
    this.sousTotal = this.produits.reduce((acc, p) => acc + p.pu * p.qte, 0);

    // Pas de réduction pour les retours
    this.reducTotal = 0;

    const baseApresReduc = this.sousTotal;

    this.taxeTotal = this.produits.reduce((acc, p, index) => {
      const base = p.pu * p.qte;
      const tva = (p.taxe ?? 0) * base;
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

      this.venteSerivce.RemoveDetailLigneRetour(this.produitsSupprimes).subscribe({
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
      this.produits[index].reducMode = 'montant';
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
      this.filteredArticles[index] = [];
      this.highlightedArticleIndex[index] = -1;
      return;
    }

    this.filteredArticles[index] = this.produits1.filter((article: any) => {
      if (!article) return false;
      const nom = article.article_nom || '';
      const code = article.article_cod || '';
      return nom.toLowerCase().includes(term) || code.toLowerCase().includes(term);
    });
    this.highlightedArticleIndex[index] = this.filteredArticles[index].length ? 0 : -1;

  }

  selectArticle(index: number, article: any) {
    if (!article) {
      return;
    }

    this.produits[index].article_id = article.article_id;
    this.produits[index].articleSearch = article.article_nom || '';
    this.filteredArticles[index] = [];
    this.highlightedArticleIndex[index] = -1;

    this.produits[index].designation = article.article_nom || '';
    this.produits[index].pu = article.prix_vente || article.pu || article.prix || 0;
    this.produits[index].qte = 1;
    this.produits[index].reduc = 0;
    this.produits[index].reducMode = 'montant';
    this.produits[index].taxe = (article.taxe ?? article.taux_tva ?? 0.2);
    this.recalculateTotal(index);
  }

  onArticleKeyDown(index: number, event: KeyboardEvent) {
    const filtered = this.filteredArticles[index] || [];
    if (!filtered.length) {
      return;
    }

    const currentIndex = this.highlightedArticleIndex[index] ?? -1;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedArticleIndex[index] = currentIndex < filtered.length - 1 ? currentIndex + 1 : 0;
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedArticleIndex[index] = currentIndex > 0 ? currentIndex - 1 : filtered.length - 1;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selectedArticle = filtered[currentIndex >= 0 ? currentIndex : 0];
      if (selectedArticle) this.selectArticle(index, selectedArticle);
    } else if (event.key === 'Escape') {
      this.filteredArticles[index] = [];
      this.highlightedArticleIndex[index] = -1;
    }
  }

  onArticleHover(event: Event, isEnter: boolean) {
    const target = event.target as HTMLElement;
    if (target) {
      target.style.backgroundColor = isEnter ? '#f0f0f0' : 'white';
    }
  }

  onArticleFocus(event: Event, isFocus: boolean) {
    const target = event.target as HTMLElement;
    if (target) {
      target.style.backgroundColor = isFocus ? '#e0e0e0' : 'white';
    }
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
      this.filteredClients = [...this.clients];
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

    this.RetourForm.patchValue({
      clientSearch: client.nom,
      part_id: client.part_id
    }, { emitEvent: false });
    this.filteredClients = [];
    this.searchTerm = client.nom;
  }

  get clientSearchControl() {
    return this.RetourForm.get('clientSearch') as FormControl;
  }

  AllCommerciaux() {
    this.baseService.getCommercial().subscribe((response: any) => {
      this.commerciaux = response?.data || (Array.isArray(response) ? response : []);
      this.filteredCommerciaux = [...this.commerciaux];
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

    this.RetourForm.patchValue({
      commercialSearch: com.nom,
      contact_id: com.id
    }, { emitEvent: false });
    this.filteredCommerciaux = [];
    this.searchCommercial = com.nom;
  }

  get commercialSearchControl() {
    return this.RetourForm.get('commercialSearch') as FormControl;
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
          tva: p.taxe || 0.2,
          document_id,
          remise_mode: 'montant',
          update_mode: 'I',
          sens: 1
        };

        ligneAInserer.remise = null;
        ligneAInserer.remise_montant = 0;

        lignesAModifier.push(ligneAInserer);
        continue;
      }

      const modifie = (
        p.designation !== pOriginal.designation ||
        p.article_id !== pOriginal.article_id ||
        p.pu !== pOriginal.pu ||
        p.qte !== pOriginal.qte ||
        p.taxe !== pOriginal.taxe
      );

      if (modifie) {
        const ligneAEnvoyer: any = {
          id: p.id,
          article_id: p.article_id,
          designation: p.designation,
          pu: p.pu,
          qte: p.qte,
          tva: p.taxe || 0.2,
          document_id,
          remise_mode: 'montant',
          update_mode: 'U',
          sens: 1
        };

        ligneAEnvoyer.remise = null;
        ligneAEnvoyer.remise_montant = 0;

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

    this.venteSerivce.SaveLignesDetailRetour(lignesAModifier).subscribe({
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
          text: 'Le retour client a été envoyé avec succès.',
          timer: 3000,
          showConfirmButton: false
        });

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

  envoyerWhatsApp(retour: any) {
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

    const messagePersonnalise = prompt('Message personnalisé (optionnel):') || 'Votre retour client en pièce jointe';

    const loadingElement = document.createElement('div');
    loadingElement.innerHTML = '🔄 Envoi du PDF via WhatsApp...';
    loadingElement.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:white;padding:20px;border:1px solid #ccc;border-radius:5px;z-index:9999;';
    document.body.appendChild(loadingElement);

    this.emailService.sendRetourWhatsAppPDF(
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

  voirRetour(withStamp: boolean = false) {
    const id = this.route.snapshot.paramMap.get('document_id');
    if (!id) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'document_id introuvable.' });
      return;
    }
    // Utiliser generateRetourPDF pour les retours
    this.emailService.generateRetourPDF(id.toString()).subscribe({
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
