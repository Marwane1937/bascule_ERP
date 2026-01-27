import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { AchatsService } from 'src/app/service/achats.service';
import Swal from 'sweetalert2';
import { forkJoin } from 'rxjs';
declare var bootstrap: any;

@Component({
  selector: 'app-edit-demande-achat',
  templateUrl: './edit-demande-achat.component.html',
  styleUrls: ['./edit-demande-achat.component.css']
})
export class EditDemandeAchatComponent implements OnInit {
  produits1: any[] = [];
  editInfos = false;
  DemandeAchatForm!: FormGroup;
  fournisseurs: any[] = [];
  filteredFournisseurs: any[] = [];
  searchTerm = '';
  produitsOriginal: any[] = [];
  produitsSupprimes: number[] = [];
  successMessage: string | null = null;
  isError: boolean = false;
  info: any;
  condition: any;
  numeroDemandeAchat: string = 'DA25-0001';

  demandeAchat = {
    fournisseur: 'Nom du fournisseur',
    adresse: 'Adresse du fournisseur',
    date: new Date().toISOString().substring(0, 10),
    description: 'Description de la demande d\'achat',
  };

  produits = [{
    id: 0,
    designation: '',
    article_id: 0,
    qte: 1,
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

  constructor(
    private baseService: BaseService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private achatsService: AchatsService,
    private cdr: ChangeDetectorRef
  ) {
    this.initForm();
  }

  ngOnInit(): void {
    this.initForm();

    const id = +this.route.snapshot.paramMap.get('document_id')!;

    // Charger toutes les données en parallèle
    forkJoin({
      produits: this.baseService.getProduit(),
      fournisseurs: this.baseService.getFournisseur(),
      demandeAchat: this.achatsService.getDemandeAchatById(id)
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

        // Traitement de la demande d'achat
        this.processDemandeAchatData(data.demandeAchat, id);
      },
      error: (err) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors du chargement des données.' });
      }
    });

    // Abonnement sur les changements de texte
    this.DemandeAchatForm.get('fournisseurSearch')?.valueChanges.subscribe(value => {
      this.onSearchChange(value);
    });
  }

  private processDemandeAchatData(response: any, id: number): void {
    const data = response?.data || response;

    if (!data) {
      Swal.fire({ icon: 'error', title: 'Erreur', text: 'Demande d\'achat introuvable.' });
      return;
    }

    this.numeroDemandeAchat = data.numero || 'DA25-0001';

    const fournisseurTrouve = this.fournisseurs?.find((f: any) => +f.part_id === +data.part_id);

    this.demandeAchat = {
      fournisseur: fournisseurTrouve ? fournisseurTrouve.nom : 'Fournisseur inconnu',
      adresse: fournisseurTrouve ? fournisseurTrouve.adresse : '',
      date: data.date,
      description: data.description || ''
    };

    this.DemandeAchatForm.patchValue({
      date: data.date,
      description: data.description,
      part_id: data.part_id,
      fournisseurSearch: fournisseurTrouve ? fournisseurTrouve.nom : ''
    });

    // Traitement des détails (sans prix)
    if (!data.details || !Array.isArray(data.details)) {
      this.produits = [];
    } else {
      this.produits = data.details.map((detail: any) => {
        const produitTrouve = this.produits1.find(p => +p.article_id === +detail.article_id);

        return {
          id: detail.id,
          article_id: detail.article_id,
          designation: detail.designation,
          qte: +detail.quantite,
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
  }

  initForm(): void {
    this.DemandeAchatForm = this.fb.group({
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
      this.achatsService.updateDemandeAchat(document_id, this.DemandeAchatForm.value).subscribe({
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

  addProduit() {
    this.produits.push({
      id: 0,
      article_id: 0,
      designation: '',
      qte: 1,
      articleSearch: ''
    });
  }

  removeProduit(index: number) {
    if (this.produits[index].id && this.produits[index].id !== 0) {
      this.produitsSupprimes.push(this.produits[index].id);
    }
    this.produits.splice(index, 1);
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
    this.produits[index].qte = 1;
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
    this.DemandeAchatForm.patchValue({
      fournisseurSearch: fournisseur.nom,
      part_id: fournisseur.part_id
    });
    this.filteredFournisseurs = [];
    this.searchTerm = fournisseur.nom;
  }

  get fournisseurSearchControl() {
    return this.DemandeAchatForm.get('fournisseurSearch') as FormControl;
  }

  enregistrerTout(): void {
    const lignesAModifier: any[] = [];
    const document_id = +this.route.snapshot.paramMap.get('document_id')!;

    for (let i = 0; i < this.produits.length; i++) {
      const p = this.produits[i];

      if (!p.article_id || !p.qte) {
        Swal.fire({
          icon: 'error',
          title: 'Ligne invalide',
          html: `❌ La ligne <strong>${i + 1}</strong> est incomplète (article ou quantité manquants).`,
        });
        return;
      }

      const pOriginal = this.produitsOriginal[i];

      if (!pOriginal) {
        const ligneAInserer: any = {
          article_id: p.article_id,
          designation: p.designation,
          qte: p.qte,
          document_id,
          update_mode: 'I'
        };

        lignesAModifier.push(ligneAInserer);
        continue;
      }

      const modifie = (
        p.designation !== pOriginal.designation ||
        p.article_id !== pOriginal.article_id ||
        p.qte !== pOriginal.qte
      );

      if (modifie) {
        const ligneAEnvoyer: any = {
          id: p.id,
          article_id: p.article_id,
          designation: p.designation,
          qte: p.qte,
          document_id,
          update_mode: 'U',
        };

        lignesAModifier.push(ligneAEnvoyer);
      }
    }

    if (this.produitsSupprimes.length > 0) {
      this.achatsService.deleteDemandeAchatLignesParIds(this.produitsSupprimes).subscribe({
        next: (res: any) => {
          this.showNotification(res.message || 'Ligne supprimée', false);
          this.produitsSupprimes = [];
        },
        error: (err: any) => {
          this.showNotification(err.message || 'Erreur de suppression', true);
        }
      });
    }

    if (lignesAModifier.length === 0) {
      Swal.fire({
        icon: 'info',
        title: 'Aucune modification',
        text: 'ℹ️ Aucune ligne modifiée ou ajoutée.',
      });
      return;
    }

    this.achatsService.saveDemandeAchatDetails(lignesAModifier).subscribe({
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

    this.achatsService.saveDemandeAchatInfo(this.selectedInfo).subscribe({
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

  voirDemandeAchat() {
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

    this.achatsService.telechargerPDFDemandeAchat(+id).subscribe({
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

