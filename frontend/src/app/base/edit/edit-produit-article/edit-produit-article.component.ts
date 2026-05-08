import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { BaseService } from 'src/app/service/base.service';
declare var bootstrap: any;

@Component({
  selector: 'app-edit-produit-article',
  templateUrl: './edit-produit-article.component.html',
  styleUrls: ['./edit-produit-article.component.css']
})
export class EditProduitArticleComponent implements OnInit {
  article_id!: number;

  article: any = null;
  familles: any[] = [];
  unites: any[] = [];
  allArticles: any[] = [];

  isLoading = true;
  isSavingArticle = false;

  // Quill editor (article.quill_editor)
  quillContent = '';
  quillModules: any = {
    toolbar: [
      [{ font: [] }, { size: [] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ color: [] }, { background: [] }],
      [{ script: 'sub' }, { script: 'super' }],
      [{ header: 1 }, { header: 2 }],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ align: [] }],
      ['link', 'image'],
      ['clean']
    ]
  };

  // Nomenclature
  nomenclature: any[] = [];
  isLoadingNomenclature = false;
  articleUnites: any[] = [];
  articleStocks: any[] = [];
  articleCodes: any[] = [];
  depots: any[] = [];
  fournisseurs: any[] = [];
  isSavingUnites = false;
  isSavingStocks = false;
  isSavingCodes = false;

  composantSearch = '';
  filteredComposants: any[] = [];
  newLine: any = {
    composant_id: null,
    composant_cod: '',
    composant_nom: '',
    famille: null,
    unite: null,
    quantite: 1,
    poids_standard: null,
    poids_reel: null
  };

  constructor(private route: ActivatedRoute, private baseService: BaseService) {}

  ngOnInit(): void {
    this.article_id = +(this.route.snapshot.paramMap.get('article_id') || 0);
    this.loadAll();
  }

  private loadAll(): void {
    this.isLoading = true;
    forkJoin({
      article: this.baseService.getArticleById(this.article_id).pipe(catchError(() => of(null))),
      familles: this.baseService.getFamille().pipe(catchError(() => of([]))),
      unites: this.baseService.getUnite().pipe(catchError(() => of([]))),
      articles: this.baseService.getProduit().pipe(catchError(() => of([]))),
      nomenclature: this.baseService.getArticleNomenclature(this.article_id).pipe(catchError(() => of({ data: [] }))),
      articleUnites: this.baseService.getArticleUnites(this.article_id).pipe(catchError(() => of({ data: [] }))),
      articleStocks: this.baseService.getArticleStocks(this.article_id).pipe(catchError(() => of({ data: [] }))),
      articleCodes: this.baseService.getArticleCodes(this.article_id).pipe(catchError(() => of({ data: [] }))),
      depots: this.baseService.getDepots().pipe(catchError(() => of({ data: [] }))),
      fournisseurs: this.baseService.getFournisseur().pipe(catchError(() => of({ data: [] }))),
    }).subscribe({
      next: (res: any) => {
        this.article = res.article;
        // Compat: si l'API renvoie encore prix_quantite, on le mappe vers quantite
        if (this.article && (this.article.quantite === undefined || this.article.quantite === null) && this.article.prix_quantite != null) {
          this.article.quantite = this.article.prix_quantite;
        }
        this.familles = res.familles?.data || res.familles || [];
        this.unites = res.unites?.data || res.unites || [];
        const list = res.articles?.data || res.articles || [];
        this.allArticles = Array.isArray(list) ? list : [];
        this.nomenclature = res.nomenclature?.data || res.nomenclature || [];
        this.articleUnites = (res.articleUnites?.data || res.articleUnites || []).map((x: any) => ({
          unite_id: Number(x.unite_id) || null,
          fact: Number(x.fact) || 0
        }));
        this.articleStocks = (res.articleStocks?.data || res.articleStocks || []).map((x: any) => ({
          depot_id: Number(x.depot_id) || null,
          stock_min: Number(x.stock_min) || 0,
          stock_max: Number(x.stock_max) || 0,
          perissable: !!Number(x.perissable)
        }));
        this.articleCodes = (res.articleCodes?.data || res.articleCodes || []).map((x: any) => ({
          ligne: Number(x.ligne) || 0,
          code: x.code || '',
          part_id: Number(x.part_id) || null,
          description: x.description || ''
        }));
        this.depots = res.depots?.data || res.depots || [];
        this.fournisseurs = res.fournisseurs?.data || res.fournisseurs || [];
        if (this.articleUnites.length === 0) this.addArticleUniteLine();
        if (this.articleStocks.length === 0) this.addArticleStockLine();
        if (this.articleCodes.length === 0) this.addArticleCodeLine();
        this.isLoading = false;
      },
      error: () => {
        this.isLoading = false;
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Impossible de charger les données de l’article.' });
      }
    });
  }

  saveArticle(): void {
    if (!this.article_id || !this.article) return;
    this.isSavingArticle = true;
    this.baseService.updateProduit(String(this.article_id), this.article).subscribe({
      next: () => {
        this.isSavingArticle = false;
        Swal.fire({ icon: 'success', title: 'Enregistré', text: 'Article modifié avec succès.' });
      },
      error: () => {
        this.isSavingArticle = false;
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors de la modification de l’article.' });
      }
    });
  }

  ouvrirQuillEditor(): void {
    if (!this.article) return;
    // Recharger la nomenclature pour avoir les dernières données avant d'ouvrir l'éditeur
    this.refreshNomenclature();
    // Attendre que la nomenclature soit chargée, puis ouvrir l'éditeur
    setTimeout(() => {
      // Si le contenu existe déjà en base, on l'affiche. Sinon, on génère depuis la nomenclature.
      const existing = (this.article?.quill_editor || '').toString().trim();
      this.quillContent = existing || this.buildNomenclatureHtml();

      const el = document.getElementById('quillModal');
      if (el) {
        const modal = new bootstrap.Modal(el);
        modal.show();
      }
    }, 300);
  }

  private buildNomenclatureHtml(): string {
    const composedCod = (this.article?.article_cod || '').toString().trim();
    const composedNom = (this.article?.article_nom || '').toString().trim();
    const composedLabel = `${composedCod ? composedCod + ' - ' : ''}${composedNom}`.trim();

    const lines = Array.isArray(this.nomenclature) ? this.nomenclature : [];
    const items = lines
      .map((n: any) => {
        const cod = (n?.composant_cod || '').toString().trim();
        const nom = (n?.composant_nom || '').toString().trim();
        const label = `${cod ? cod + ' - ' : ''}${nom}`.trim();
        // IMPORTANT: ne pas afficher la quantité dans le Quill (elle sera sauvegardée dans article.quantite)
        return label ? `<li>${label}</li>` : '';
      })
      .filter(Boolean)
      .join('');

    return `
      <h3>Article composé</h3>
      <p><strong>${composedLabel || '(Sans nom)'}</strong></p>
      <h3>Composants</h3>
      <ul>
        ${items || '<li>(Aucun composant)</li>'}
      </ul>
    `.trim();
  }

  private computeQuantiteFromComponents(): number {
    const lines = Array.isArray(this.nomenclature) ? this.nomenclature : [];
    return lines.reduce((sum: number, n: any) => {
      const q = Number(n?.Quantite ?? n?.quantite ?? 0);
      return sum + (isNaN(q) ? 0 : q);
    }, 0);
  }

  validerQuillEditor(): void {
    if (!this.article) return;

    const quantiteAuto = this.computeQuantiteFromComponents();
    this.article.quill_editor = this.quillContent;
    this.article.quantite = quantiteAuto;

    this.isSavingArticle = true;
    this.baseService.updateProduit(String(this.article_id), this.article).subscribe({
      next: () => {
        this.isSavingArticle = false;
        const el = document.getElementById('quillModal');
        if (el) {
          const inst = bootstrap.Modal.getInstance(el);
          if (inst) inst.hide();
        }
        Swal.fire({
          icon: 'success',
          title: 'Enregistré',
          text: `Éditeur sauvegardé. Quantité calculée = ${quantiteAuto}`
        });
      },
      error: () => {
        this.isSavingArticle = false;
        Swal.fire({ icon: 'error', title: 'Erreur', text: 'Erreur lors de l’enregistrement de l’éditeur.' });
      }
    });
  }

  // ===== Nomenclature UI helpers =====
  onComposantSearchChange(term: string): void {
    this.composantSearch = (term || '').trim();
    const t = this.composantSearch.toLowerCase();
    if (!t) {
      this.filteredComposants = [];
      return;
    }
    this.filteredComposants = this.allArticles
      .filter((a: any) =>
        (a.article_nom && a.article_nom.toLowerCase().includes(t)) ||
        (a.article_cod && a.article_cod.toLowerCase().includes(t)) ||
        (String(a.article_id).includes(t))
      )
      .slice(0, 30);
  }

  selectComposant(article: any): void {
    this.newLine.composant_id = article.article_id;
    this.newLine.composant_cod = article.article_cod;
    this.newLine.composant_nom = article.article_nom;
    this.newLine.famille = article.famille ?? null;
    this.newLine.unite = article.unite_id ?? null;
    this.composantSearch = `${article.article_cod || ''} - ${article.article_nom || ''}`.trim();
    this.filteredComposants = [];
  }

  refreshNomenclature(): void {
    this.isLoadingNomenclature = true;
    this.baseService.getArticleNomenclature(this.article_id).subscribe({
      next: (res: any) => {
        this.nomenclature = res?.data || res || [];
        this.isLoadingNomenclature = false;
        // Mettre à jour automatiquement la quantité calculée dans l'UI
        if (this.article) {
          this.article.quantite = this.computeQuantiteFromComponents();
        }
      },
      error: () => {
        this.nomenclature = [];
        this.isLoadingNomenclature = false;
      }
    });
  }

  addNomenclatureLine(): void {
    if (!this.newLine.composant_id) {
      Swal.fire({ icon: 'warning', title: 'Composant requis', text: 'Veuillez sélectionner un article composant.' });
      return;
    }

    const payload = {
      composant_id: this.newLine.composant_id,
      famille: this.newLine.famille ?? null,
      unite: this.newLine.unite ?? null,
      quantite: this.newLine.quantite ?? null,
      poids_standard: this.newLine.poids_standard ?? null,
      poids_reel: this.newLine.poids_reel ?? null
    };

    this.baseService.addArticleNomenclatureLine(this.article_id, payload).subscribe({
      next: () => {
        this.newLine = {
          composant_id: null,
          composant_cod: '',
          composant_nom: '',
          famille: null,
          unite: null,
          quantite: 1,
          poids_standard: null,
          poids_reel: null
        };
        this.composantSearch = '';
        this.refreshNomenclature();
        // Mettre à jour la quantité automatiquement après ajout
        if (this.article) {
          this.article.quantite = this.computeQuantiteFromComponents();
        }
        Swal.fire({ icon: 'success', title: 'Ajouté', text: 'Composant ajouté à la nomenclature.' });
      },
      error: (err) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: err?.error?.message || 'Erreur lors de l’ajout.' });
      }
    });
  }

  updateNomenclatureLine(line: any): void {
    const composantId = line?.Composant_id || line?.composant_id;
    const payload = {
      famille: line?.Famille ?? null,
      unite: line?.Unite ?? null,
      quantite: line?.Quantite ?? null,
      poids_standard: line?.Poids_Standard ?? null,
      poids_reel: line?.Poids_reel ?? null
    };

    this.baseService.updateArticleNomenclatureLine(this.article_id, composantId, payload).subscribe({
      next: () => {
        Swal.fire({ icon: 'success', title: 'Mis à jour', text: 'Ligne de nomenclature mise à jour.' });
        this.refreshNomenclature();
        // Mettre à jour la quantité automatiquement après modification
        if (this.article) {
          this.article.quantite = this.computeQuantiteFromComponents();
        }
      },
      error: (err) => {
        Swal.fire({ icon: 'error', title: 'Erreur', text: err?.error?.message || 'Erreur lors de la mise à jour.' });
      }
    });
  }

  deleteNomenclatureLine(line: any): void {
    const composantId = line?.Composant_id || line?.composant_id;
    Swal.fire({
      icon: 'warning',
      title: 'Supprimer ?',
      text: 'Voulez-vous supprimer cette ligne de nomenclature ?',
      showCancelButton: true,
      confirmButtonText: 'Oui',
      cancelButtonText: 'Non'
    }).then(result => {
      if (!result.isConfirmed) return;
      this.baseService.deleteArticleNomenclatureLine(this.article_id, composantId).subscribe({
        next: () => {
          Swal.fire({ icon: 'success', title: 'Supprimé', text: 'Ligne supprimée.' });
          this.refreshNomenclature();
          // Mettre à jour la quantité automatiquement après suppression
          if (this.article) {
            this.article.quantite = this.computeQuantiteFromComponents();
          }
        },
        error: (err) => {
          Swal.fire({ icon: 'error', title: 'Erreur', text: err?.error?.message || 'Erreur lors de la suppression.' });
        }
      });
    });
  }

  addArticleUniteLine(): void {
    this.articleUnites.push({
      unite_id: null,
      fact: 0
    });
  }

  removeArticleUniteLine(index: number): void {
    this.articleUnites.splice(index, 1);
    this.persistArticleUnites(false);
  }

  saveArticleUnites(): void {
    this.persistArticleUnites(true);
  }

  private persistArticleUnites(showToast: boolean): void {
    this.isSavingUnites = true;
    this.baseService.saveArticleUnites(this.article_id, this.articleUnites).subscribe({
      next: () => {
        this.isSavingUnites = false;
        if (showToast) {
          Swal.fire({ icon: 'success', title: 'Enregistré', text: 'Article unité sauvegardé avec succès.' });
        }
        this.baseService.getArticleUnites(this.article_id).subscribe((res: any) => {
          this.articleUnites = (res?.data || []).map((x: any) => ({
            unite_id: Number(x.unite_id) || null,
            fact: Number(x.fact) || 0
          }));
        });
      },
      error: (err) => {
        this.isSavingUnites = false;
        Swal.fire({ icon: 'error', title: 'Erreur', text: err?.error?.message || 'Erreur lors de la sauvegarde des unités.' });
      }
    });
  }

  addArticleStockLine(): void {
    this.articleStocks.push({
      depot_id: null,
      stock_min: 0,
      stock_max: 0,
      perissable: false
    });
  }

  removeArticleStockLine(index: number): void {
    this.articleStocks.splice(index, 1);
    this.persistArticleStocks(false);
  }

  saveArticleStocks(): void {
    this.persistArticleStocks(true);
  }

  private persistArticleStocks(showToast: boolean): void {
    this.isSavingStocks = true;
    this.baseService.saveArticleStocks(this.article_id, this.articleStocks).subscribe({
      next: () => {
        this.isSavingStocks = false;
        if (showToast) {
          Swal.fire({ icon: 'success', title: 'Enregistré', text: 'Article stock sauvegardé avec succès.' });
        }
        this.baseService.getArticleStocks(this.article_id).subscribe((res: any) => {
          this.articleStocks = (res?.data || []).map((x: any) => ({
            depot_id: Number(x.depot_id) || null,
            stock_min: Number(x.stock_min) || 0,
            stock_max: Number(x.stock_max) || 0,
            perissable: !!Number(x.perissable)
          }));
        });
      },
      error: (err) => {
        this.isSavingStocks = false;
        Swal.fire({ icon: 'error', title: 'Erreur', text: err?.error?.message || 'Erreur lors de la sauvegarde du stock.' });
      }
    });
  }

  addArticleCodeLine(): void {
    const nextLigne = (this.articleCodes || []).reduce((max: number, x: any) => Math.max(max, Number(x?.ligne) || 0), 0) + 1;
    this.articleCodes.push({
      ligne: nextLigne,
      code: '',
      part_id: null,
      description: ''
    });
  }

  removeArticleCodeLine(index: number): void {
    this.articleCodes.splice(index, 1);
    this.persistArticleCodes(false);
  }

  saveArticleCodes(): void {
    this.persistArticleCodes(true);
  }

  private persistArticleCodes(showToast: boolean): void {
    this.isSavingCodes = true;
    this.baseService.saveArticleCodes(this.article_id, this.articleCodes).subscribe({
      next: () => {
        this.isSavingCodes = false;
        if (showToast) {
          Swal.fire({ icon: 'success', title: 'Enregistré', text: 'Article fournisseur sauvegardé avec succès.' });
        }
        this.baseService.getArticleCodes(this.article_id).subscribe((res: any) => {
          this.articleCodes = (res?.data || []).map((x: any) => ({
            ligne: Number(x.ligne) || 0,
            code: x.code || '',
            part_id: Number(x.part_id) || null,
            description: x.description || ''
          }));
        });
      },
      error: (err) => {
        this.isSavingCodes = false;
        Swal.fire({ icon: 'error', title: 'Erreur', text: err?.error?.message || 'Erreur lors de la sauvegarde des fournisseurs.' });
      }
    });
  }
}
