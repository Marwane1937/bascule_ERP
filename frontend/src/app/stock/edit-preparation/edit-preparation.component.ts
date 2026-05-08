import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin, Observable, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import Swal from 'sweetalert2';
import { BaseService } from 'src/app/service/base.service';
import { StockService } from 'src/app/service/stock.service';

interface PreparationNomenclatureNode {
  article_id: number;
  code: string;
  designation: string;
  quantite: number;
  quantiteTotale: number;
  prix: number;
  total: number;
  famille: string;
  unite: string;
  poidsStandard: number | null;
  poidsReel: number | null;
  children: PreparationNomenclatureNode[];
}

@Component({
  selector: 'app-edit-preparation',
  templateUrl: './edit-preparation.component.html',
  styleUrls: ['./edit-preparation.component.css']
})
export class EditPreparationComponent implements OnInit {
  preparationId = 0;
  loading = false;
  savingInfo = false;
  savingLines = false;
  transfering = false;
  printing = false;
  editInfos = false;

  infoForm!: FormGroup;
  preparation: any = null;
  produits: any[] = [];

  clients: any[] = [];
  filteredClients: any[] = [];
  commerciaux: any[] = [];
  filteredCommerciaux: any[] = [];
  employes: any[] = [];
  filteredEmployes: any[] = [];
  depots: any[] = [];
  articles: any[] = [];
  produitsNomenclature: any[] = [];
  filteredArticles: { [key: number]: any[] } = {};
  private articleUnitCache: { [key: number]: any } = {};
  private articleSearchSeq: { [key: number]: number } = {};
  focusedQuantityIndex: number | null = null;

  searchClient = '';
  searchCommercial = '';
  searchEmploye = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private baseService: BaseService,
    private stockService: StockService
  ) {}

  ngOnInit(): void {
    this.infoForm = this.fb.group({
      date: ['', Validators.required],
      date_fin: [''],
      description: [''],
      part_id: [0],
      contact_id: [0],
      employe_id: [0],
      depot_id: [null]
    });

    this.preparationId = Number(this.route.snapshot.paramMap.get('id') || 0);
    if (!this.preparationId) {
      Swal.fire('Erreur', 'ID préparation invalide.', 'error');
      return;
    }
    this.loadInitialData();
  }

  private normalize(value: any): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }

  private toDateInput(value: any): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  private toDatetimeLocal(value: any): string {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private findClientName(partId: any): string {
    const id = Number(partId || 0);
    return this.clients.find((c: any) => Number(c?.part_id || 0) === id)?.nom || '';
  }

  private findCommercialName(contactId: any): string {
    const id = Number(contactId || 0);
    return this.commerciaux.find((c: any) => Number(c?.id || 0) === id)?.nom || '';
  }

  private findEmployeName(employeId: any): string {
    const id = Number(employeId || 0);
    const employe = this.employes.find((e: any) => Number(e?.id || 0) === id);
    if (!employe) return '';
    return employe.nom_complet || [employe.nom, employe.prenom].filter(Boolean).join(' ').trim() || employe.nom || '';
  }

  private mapPreparationToForm(data: any): void {
    this.preparation = data;
    this.searchClient = data?.client || this.findClientName(data?.part_id) || '';
    this.searchCommercial = data?.commercial || this.findCommercialName(data?.contact_id) || '';
    this.searchEmploye = data?.employe || this.findEmployeName(data?.employe_id) || '';
    this.infoForm.patchValue({
      date: this.toDatetimeLocal(data?.date),
      date_fin: this.toDateInput(data?.date_fin),
      description: data?.description || '',
      part_id: Number(data?.part_id || 0) || 0,
      contact_id: Number(data?.contact_id || 0) || 0,
      employe_id: Number(data?.employe_id || 0) || 0,
      depot_id: data?.depot_id != null ? Number(data.depot_id) : null
    }, { emitEvent: false });

    const details = Array.isArray(data?.details) ? data.details : [];
    const sourceDetails = (Array.isArray(data?.source_details) ? data.source_details : [])
      .filter((source: any) => !this.isPersistedNomenclatureLine(source));
    const detailMap = new Map<number, any>();

    const mappedDetails = details.map((d: any) => {
      const articleId = Number(d.article_id || 0);
      const nomenclatureComponents = this.normalizeNomenclatureNodes(d.nomenclatureComponents || d.nomenclature_components || []);
      const isNomenclature = nomenclatureComponents.length > 0 || this.isNomenclatureArticleId(articleId);
      const quantity = Number(d.quantite || 0);
      const line = {
        id: d.id || 0,
        article_id: articleId,
        articleSearch: d.article_nom || '',
        designation: d.designation || '',
        lot: d.lot || '',
        pu: Number(d.prix || 0),
        qte: quantity,
        fixed_qte: isNomenclature ? quantity : null,
        taxe: Number(d.taux_tva || 0),
        total: 0,
        qte_demandee: Number(d.quantite_demandee || 0),
        quantite_transferee: Number(d.quantite_transferee || 0),
        quantite_restante_transfert: Number(d.quantite_restante_transfert || 0),
        etat: Number(d.etat || 0),
        type: Number(d.type ?? d.ligne_type ?? d.detail_type ?? 0) || 0,
        exceeded_warning: false,
        quantity_limit_message: '',
        quantity_warning_visible: false,
        depot_id: d.depot_id != null ? Number(d.depot_id) : (this.infoForm.get('depot_id')?.value ?? null),
        unite_id: d.unite_id != null ? Number(d.unite_id) : null,
        unite_nom: d.unite_nom || '',
        fact: Number(d.fact || 0),
        isNomenclature,
        nomenclatureComponents,
        nomenclatureFromPersistedRows: nomenclatureComponents.length > 0 || Boolean(d.nomenclatureFromPersistedRows),
        nomenclatureTotal: this.sumNomenclatureNodes(nomenclatureComponents)
      };
      if (line.article_id > 0 && Number(line.type || 0) !== 1) {
        detailMap.set(line.article_id, line);
      }
      return line;
    });

    sourceDetails.forEach((source: any) => {
      const articleId = Number(source?.article_id || 0);
      if (!articleId || detailMap.has(articleId)) {
        return;
      }
      const article = (this.articles || []).find((a: any) => Number(a?.article_id || 0) === articleId);
      const isSourceNomenclature = this.isNomenclatureArticleId(articleId);
      const sourceQuantity = Number(source?.quantite_demandee || 0);
      const line = {
        id: 0,
        article_id: articleId,
        articleSearch: source?.article_nom || article?.article_nom || '',
        designation: source?.designation || source?.article_nom || article?.article_nom || '',
        lot: '',
        pu: 0,
        qte: 0,
        fixed_qte: null,
        taxe: 0,
        total: 0,
        qte_demandee: sourceQuantity,
        quantite_transferee: 0,
        quantite_restante_transfert: 0,
        etat: 0,
        type: 0,
        exceeded_warning: false,
        quantity_limit_message: '',
        quantity_warning_visible: false,
        depot_id: this.infoForm.get('depot_id')?.value ?? null,
        unite_id: null,
        unite_nom: '',
        fact: 0,
        isNomenclature: isSourceNomenclature,
        nomenclatureComponents: [] as PreparationNomenclatureNode[],
        nomenclatureFromPersistedRows: false,
        nomenclatureTotal: 0
      };
      mappedDetails.push(line);
      detailMap.set(articleId, line);
    });

    this.produits = mappedDetails.map((d: any) => {
      const articleId = Number(d.article_id || 0);
      const quantity = Number(d.qte ?? d.quantite ?? 0);
      const nomenclatureComponents = this.normalizeNomenclatureNodes(d.nomenclatureComponents || d.nomenclature_components || []);
      const isNomenclature = Boolean(d.isNomenclature) || nomenclatureComponents.length > 0 || this.isNomenclatureArticleId(articleId);

      return {
        id: d.id || 0,
        article_id: articleId,
        articleSearch: d.articleSearch || d.article_nom || '',
        designation: d.designation || d.article_nom || '',
        lot: d.lot || '',
        pu: Number(d.pu ?? d.prix ?? 0),
        qte: quantity,
        fixed_qte: isNomenclature ? Number(d.fixed_qte ?? quantity) : null,
        taxe: Number(d.taxe ?? d.taux_tva ?? 0),
        total: 0,
        qte_demandee: Number(d.quantite_demandee || d.qte_demandee || 0),
        quantite_transferee: Number(d.quantite_transferee || 0),
        quantite_restante_transfert: Number(d.quantite_restante_transfert || 0),
        etat: Number(d.etat || 0),
        type: Number(d.type ?? d.ligne_type ?? d.detail_type ?? 0) || 0,
        exceeded_warning: false,
        quantity_limit_message: '',
        quantity_warning_visible: false,
        depot_id: d.depot_id != null ? Number(d.depot_id) : (this.infoForm.get('depot_id')?.value ?? null),
        unite_id: d.unite_id != null ? Number(d.unite_id) : null,
        unite_nom: d.unite_nom || '',
        fact: Number(d.fact || 0),
        isNomenclature,
        nomenclatureComponents,
        nomenclatureLoading: false,
        nomenclatureError: '',
        nomenclatureTotal: this.sumNomenclatureNodes(nomenclatureComponents),
        nomenclatureFromPersistedRows: nomenclatureComponents.length > 0 || Boolean(d.nomenclatureFromPersistedRows)
      };
    });
    this.produits = this.attachPersistedNomenclatureRows(this.produits);
    this.produits.forEach((line, i) => {
      this.recalculateTotal(i);
      this.loadArticleUnitMeta(i, line.article_id);
      this.loadNomenclatureForLineIfNeeded(i);
    });
    this.refreshDemandWarnings();
  }

  loadInitialData(): void {
    this.loading = true;
    forkJoin({
      clients: this.baseService.getClient(),
      commerciaux: this.baseService.getCommercialAutocomplete(),
      employes: this.baseService.getEmployeAutocomplete(),
      depots: this.baseService.getDepots(),
      articles: this.baseService.getProduit(),
      produitsNomenclature: this.baseService.getProduitsNomenclature().pipe(catchError(() => of({ data: [] }))),
      preparation: this.stockService.getPreparationById(this.preparationId)
    }).subscribe({
      next: (res: any) => {
        const clientsData = res?.clients?.data || res?.clients || [];
        const commerciauxData = res?.commerciaux?.data || res?.commerciaux || [];
        const employesData = res?.employes?.data || res?.employes || [];
        const depotsData = res?.depots?.data || res?.depots || [];
        const articlesData = res?.articles?.data || res?.articles || [];
        const nomenclatureData = res?.produitsNomenclature?.data || res?.produitsNomenclature || [];
        this.clients = (Array.isArray(clientsData) ? clientsData : []).filter((c: any) => Number(c?.type) === 1);
        this.commerciaux = Array.isArray(commerciauxData) ? commerciauxData : [];
        this.employes = Array.isArray(employesData) ? employesData : [];
        this.depots = Array.isArray(depotsData) ? depotsData : [];
        this.articles = Array.isArray(articlesData) ? articlesData : [];
        this.produitsNomenclature = Array.isArray(nomenclatureData) ? nomenclatureData : [];
        const data = res?.preparation?.data || res?.preparation;
        this.mapPreparationToForm(data || {});
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        Swal.fire('Erreur', err?.error?.message || 'Impossible de charger le bon de préparation.', 'error');
      }
    });
  }

  toggleEdit(): void {
    this.editInfos = !this.editInfos;
    if (!this.editInfos && this.preparation) {
      this.mapPreparationToForm(this.preparation);
    }
  }

  onSearchClientChange(value: string): void {
    this.searchClient = value || '';
    const term = this.normalize(this.searchClient);
    if (!term) {
      this.infoForm.patchValue({ part_id: 0 });
      this.filteredClients = [];
      return;
    }
    this.filteredClients = (this.clients || []).filter((c: any) => this.normalize(c?.nom).includes(term)).slice(0, 20);
  }

  onCommercialSearchChange(value: string): void {
    this.searchCommercial = value || '';
    const term = this.normalize(this.searchCommercial);
    if (!term) {
      this.infoForm.patchValue({ contact_id: 0 });
      this.filteredCommerciaux = [];
      return;
    }
    this.filteredCommerciaux = (this.commerciaux || []).filter((c: any) => this.normalize(c?.nom).includes(term)).slice(0, 20);
  }

  onEmployeSearchChange(value: string): void {
    this.searchEmploye = value || '';
    const term = this.normalize(this.searchEmploye);
    if (!term) {
      this.infoForm.patchValue({ employe_id: 0 });
      this.filteredEmployes = [];
      return;
    }
    this.filteredEmployes = (this.employes || [])
      .filter((e: any) => this.normalize(e?.nom_complet || `${e?.nom || ''} ${e?.prenom || ''}`).includes(term))
      .slice(0, 20);
  }

  selectClient(client: any): void {
    this.searchClient = client?.nom || '';
    this.filteredClients = [];
    this.infoForm.patchValue({ part_id: Number(client?.part_id || 0) });
  }

  selectCommercial(com: any): void {
    this.searchCommercial = com?.nom || '';
    this.filteredCommerciaux = [];
    this.infoForm.patchValue({ contact_id: Number(com?.id || 0) });
  }

  selectEmploye(employe: any): void {
    const label = employe?.nom_complet || [employe?.nom, employe?.prenom].filter(Boolean).join(' ').trim();
    this.searchEmploye = label || '';
    this.filteredEmployes = [];
    this.infoForm.patchValue({ employe_id: Number(employe?.id || 0) });
  }

  getDepotLabel(): string {
    const depotId = Number(this.infoForm.get('depot_id')?.value || 0);
    return this.depots.find((d: any) => Number(d?.id || 0) === depotId)?.nom || (this.preparation?.depot_nom || 'Non renseigné');
  }

  saveInfo(): void {
    if (this.infoForm.invalid) { this.infoForm.markAllAsTouched(); return; }
    this.savingInfo = true;
    const v = this.infoForm.value;
    const payload = {
      date: v.date ? String(v.date).replace('T', ' ') + ':00' : null,
      date_fin: v.date_fin || null,
      description: v.description || '',
      part_id: Number(v.part_id || 0) || null,
      contact_id: Number(v.contact_id || 0) || null,
      employe_id: Number(v.employe_id || 0) || null,
      depot_id: Number(v.depot_id || 0) || null
    };
    this.stockService.updatePreparation(this.preparationId, payload).subscribe({
      next: (res: any) => {
        this.savingInfo = false;
        const data = res?.data || this.preparation;
        this.mapPreparationToForm(data);
        this.editInfos = false;
        Swal.fire('Succès', res?.message || 'Informations mises à jour.', 'success');
      },
      error: (err) => {
        this.savingInfo = false;
        Swal.fire('Erreur', err?.error?.message || 'Mise à jour impossible.', 'error');
      }
    });
  }

  addProduit(): void {
    this.produits.push({
      id: 0,
      article_id: 0,
      articleSearch: '',
      pu: 0,
      qte: 1,
      fixed_qte: null,
      taxe: 0.2,
      total: 0,
      qte_demandee: 0,
      quantite_transferee: 0,
      quantite_restante_transfert: 0,
      etat: 0,
      exceeded_warning: false,
      quantity_limit_message: '',
      quantity_warning_visible: false,
      depot_id: this.infoForm.get('depot_id')?.value ?? null,
      designation: '',
      lot: '',
      stock_disponible: null,
      unite_id: null,
      unite_nom: '',
      fact: 0,
      isNomenclature: false,
      nomenclatureComponents: [] as PreparationNomenclatureNode[],
      nomenclatureLoading: false,
      nomenclatureError: '',
      nomenclatureTotal: 0
    });
  }

  removeProduit(index: number): void {
    const line = this.produits?.[index];
    if (!line || this.isTransferredLine(line)) {
      return;
    }

    const previousLines = [...this.produits];
    this.produits.splice(index, 1);
    this.refreshDemandWarnings();

    if (Number(line?.id || 0) <= 0) {
      return;
    }

    this.savingLines = true;
    const lignesRestantes = this.buildPreparationLines();
    this.stockService.savePreparationLines(this.preparationId, lignesRestantes).subscribe({
      next: (res: any) => {
        this.savingLines = false;
        const data = res?.data || this.preparation;
        this.mapPreparationToForm(data);
        Swal.fire('Succès', 'Ligne supprimée.', 'success');
      },
      error: (err) => {
        this.savingLines = false;
        this.produits = previousLines;
        this.refreshDemandWarnings();
        Swal.fire('Erreur', err?.error?.message || 'Suppression impossible.', 'error');
      }
    });
  }

  onArticleSearchChange(index: number, term: string): void {
    this.produits[index].articleSearch = term;
    const n = this.normalize(term);
    if (!n) {
      this.filteredArticles[index] = [];
      return;
    }
    const requestId = (this.articleSearchSeq[index] || 0) + 1;
    this.articleSearchSeq[index] = requestId;

    this.stockService.searchPreparationArticles(term).pipe(
      catchError(() => of({
        data: (this.articles || [])
          .filter((a: any) => this.normalize(a?.article_nom).includes(n) || this.normalize(a?.article_cod).includes(n))
          .slice(0, 20)
      }))
    ).subscribe((response: any) => {
      if (this.articleSearchSeq[index] !== requestId) {
        return;
      }

      const rows = response?.data || response || [];
      this.filteredArticles[index] = Array.isArray(rows) ? rows.slice(0, 20) : [];
    });
  }

  selectArticle(index: number, article: any): void {
    const p = this.produits[index];
    p.article_id = Number(article?.article_id || 0);
    p.articleSearch = article?.article_nom || '';
    p.nomenclatureFromPersistedRows = false;
    if (!p.designation) p.designation = article?.article_nom || '';
    p.lot = article?.matched_serie || '';
    const sourceLine = this.sourceDetails.find((row: any) => Number(row?.article_id || 0) === p.article_id);
    p.qte_demandee = Number(sourceLine?.quantite_demandee || 0);
    p.isNomenclature = this.isNomenclatureArticleId(p.article_id);
    if (p.isNomenclature && p.qte_demandee > 0) {
      p.qte = p.qte_demandee;
    }
    p.fixed_qte = p.isNomenclature ? this.normalizeQuantityValue(p.qte) : null;
    p.stock_disponible = null;
    p.unite_id = null;
    p.unite_nom = '';
    p.fact = 0;
    this.filteredArticles[index] = [];
    this.updateLineStockDisponible(index, p.article_id);
    this.loadArticleUnitMeta(index, p.article_id);
    this.loadNomenclatureForLineIfNeeded(index);
    this.refreshDemandWarnings();
  }

  private normalizeQuantityValue(value: any): number {
    if (value === '' || value === null || value === undefined) {
      return 0;
    }

    const numericValue = typeof value === 'string'
      ? Number(value.replace(',', '.'))
      : Number(value);

    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  private normalizePriceValue(value: any): number {
    if (value === '' || value === null || value === undefined) {
      return 0;
    }

    const numericValue = typeof value === 'string'
      ? Number(value.replace(',', '.'))
      : Number(value);

    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  private normalizeNomenclatureNodes(nodes: any[]): PreparationNomenclatureNode[] {
    return (Array.isArray(nodes) ? nodes : []).map((node: any) => ({
      article_id: Number(node?.article_id || node?.Composant_id || 0),
      code: node?.code || node?.article_cod || node?.composant_cod || '',
      designation: node?.designation || node?.article_nom || node?.composant_nom || '',
      quantite: this.normalizeQuantityValue(node?.quantite),
      quantiteTotale: this.normalizeQuantityValue(node?.quantiteTotale ?? node?.quantite_totale ?? node?.qte ?? node?.quantite),
      prix: this.normalizePriceValue(node?.prix ?? node?.pu),
      total: this.normalizePriceValue(node?.total),
      famille: node?.famille || node?.famille_nom || '',
      unite: node?.unite || node?.unite_nom || '',
      poidsStandard: node?.poidsStandard ?? node?.Poids_Standard ?? null,
      poidsReel: node?.poidsReel ?? node?.Poids_reel ?? null,
      children: this.normalizeNomenclatureNodes(node?.children || node?.nomenclature_components || [])
    }));
  }

  private getLineArticleId(line: any): number {
    return Number(line?.article_id || 0) || 0;
  }

  private flattenNomenclatureNodes(nodes: PreparationNomenclatureNode[]): PreparationNomenclatureNode[] {
    const result: PreparationNomenclatureNode[] = [];
    (Array.isArray(nodes) ? nodes : []).forEach((node: PreparationNomenclatureNode) => {
      result.push(node);
      if (Array.isArray(node.children) && node.children.length > 0) {
        result.push(...this.flattenNomenclatureNodes(node.children));
      }
    });
    return result;
  }

  private syncNomenclatureNodeFromPersistedRows(node: PreparationNomenclatureNode, rows: any[]): void {
    const safeRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
    if (safeRows.length === 0) {
      return;
    }

    const quantity = safeRows.reduce((sum: number, row: any) => {
      return sum + Math.max(0, this.normalizeQuantityValue(row?.qte ?? row?.quantite));
    }, 0);
    const total = safeRows.reduce((sum: number, row: any) => {
      const rowQuantity = Math.max(0, this.normalizeQuantityValue(row?.qte ?? row?.quantite));
      const rowPrice = this.normalizePriceValue(row?.pu ?? row?.prix ?? node.prix);
      return sum + (rowQuantity * rowPrice);
    }, 0);
    const firstRow = safeRows[0] || {};
    const price = quantity > 0 ? total / quantity : this.normalizePriceValue(firstRow?.pu ?? firstRow?.prix ?? node.prix);

    node.quantiteTotale = quantity;
    node.prix = price;
    node.total = total;
    node.code = firstRow.article_cod || node.code || '';
    node.designation = firstRow.articleSearch || firstRow.article_nom || firstRow.designation || node.designation || '';
    node.unite = firstRow.unite_nom || node.unite || '';
  }

  private syncNomenclatureBaseQuantities(nodes: PreparationNomenclatureNode[], parentQuantity: number): void {
    const safeParentQuantity = Math.max(0, this.normalizeQuantityValue(parentQuantity));
    (Array.isArray(nodes) ? nodes : []).forEach((node: PreparationNomenclatureNode) => {
      if (safeParentQuantity > 0) {
        node.quantite = this.normalizeQuantityValue(node.quantiteTotale) / safeParentQuantity;
      }
      node.total = this.normalizePriceValue(node.prix) * this.normalizeQuantityValue(node.quantiteTotale);
      if (Array.isArray(node.children) && node.children.length > 0) {
        this.syncNomenclatureBaseQuantities(node.children, node.quantiteTotale);
      }
    });
  }

  private getLineType(line: any): number {
    return Number(line?.type ?? line?.ligne_type ?? line?.detail_type ?? 0) || 0;
  }

  private isPersistedNomenclatureLine(line: any): boolean {
    return this.getLineType(line) === 1;
  }

  private buildPersistedNomenclatureNode(line: any, parentLine: any): PreparationNomenclatureNode {
    const quantity = this.normalizeQuantityValue(line?.qte ?? line?.quantite ?? 0);
    const price = this.normalizePriceValue(line?.pu ?? line?.prix ?? 0);
    const parentQuantity = this.normalizeQuantityValue(parentLine?.qte ?? parentLine?.quantite ?? 1) || 1;

    return {
      article_id: Number(line?.article_id || 0),
      code: line?.article_cod || line?.code || '',
      designation: line?.articleSearch || line?.article_nom || line?.designation || '',
      quantite: parentQuantity > 0 ? quantity / parentQuantity : quantity,
      quantiteTotale: quantity,
      prix: price,
      total: quantity * price,
      famille: line?.famille_nom || line?.famille || '',
      unite: line?.unite_nom || line?.unite || '',
      poidsStandard: line?.poidsStandard ?? line?.Poids_Standard ?? null,
      poidsReel: line?.poidsReel ?? line?.Poids_reel ?? null,
      children: []
    };
  }

  private attachPersistedNomenclatureRows(lines: any[]): any[] {
    const visibleLines: any[] = [];
    let currentParent: any = null;

    (Array.isArray(lines) ? lines : []).forEach((line: any) => {
      if (this.isPersistedNomenclatureLine(line) && currentParent) {
        if (!currentParent.nomenclatureFromPersistedRows) {
          currentParent.nomenclatureComponents = [];
          currentParent.nomenclatureFromPersistedRows = true;
        }
        currentParent.isNomenclature = true;
        currentParent.nomenclatureComponents.push(this.buildPersistedNomenclatureNode(line, currentParent));
        currentParent.nomenclatureTotal = this.sumNomenclatureNodes(currentParent.nomenclatureComponents);
        return;
      }

      visibleLines.push(line);
      if (!this.isPersistedNomenclatureLine(line)) {
        currentParent = line;
      }
    });

    return visibleLines;
  }

  private collapsePersistedNomenclatureComponentRows(rootLine: any): void {
    if (!rootLine || !Array.isArray(rootLine.nomenclatureComponents) || rootLine.nomenclatureComponents.length === 0) {
      return;
    }

    const rootIndex = this.produits.indexOf(rootLine);
    if (rootIndex < 0) {
      return;
    }

    const flatNodes = this.flattenNomenclatureNodes(rootLine.nomenclatureComponents);
    if (flatNodes.length === 0) {
      return;
    }

    const matchedGroups: Array<{ node: PreparationNomenclatureNode; indexes: number[] }> = [];
    let cursor = rootIndex + 1;

    for (let nodeIndex = 0; nodeIndex < flatNodes.length; nodeIndex += 1) {
      const node = flatNodes[nodeIndex];
      const articleId = Number(node.article_id || 0);
      const indexes: number[] = [];

      while (cursor < this.produits.length && this.getLineArticleId(this.produits[cursor]) === articleId) {
        indexes.push(cursor);
        cursor += 1;

        const nextNode = flatNodes[nodeIndex + 1];
        if (nextNode && Number(nextNode.article_id || 0) === articleId) {
          break;
        }
      }

      if (indexes.length === 0) {
        return;
      }

      matchedGroups.push({ node, indexes });
    }

    const indexesToRemove = new Set<number>();
    matchedGroups.forEach((group) => {
      group.indexes.forEach((index) => indexesToRemove.add(index));
      this.syncNomenclatureNodeFromPersistedRows(
        group.node,
        group.indexes.map((index) => this.produits[index])
      );
    });

    this.syncNomenclatureBaseQuantities(rootLine.nomenclatureComponents, this.normalizeQuantityValue(rootLine.qte) || 1);
    rootLine.nomenclatureFromPersistedRows = true;
    rootLine.nomenclatureTotal = this.sumNomenclatureNodes(rootLine.nomenclatureComponents);

    this.produits = this.produits.filter((_, index) => !indexesToRemove.has(index));
    this.filteredArticles = {};
    this.refreshDemandWarnings();
  }

  private isNomenclatureArticleId(articleId: any): boolean {
    const id = Number(articleId || 0);
    if (!id) {
      return false;
    }

    return (Array.isArray(this.produitsNomenclature) ? this.produitsNomenclature : [])
      .some((article: any) => Number(article?.article_id || 0) === id);
  }

  private getArticleInfoById(articleId: any): any {
    const id = Number(articleId || 0);
    if (!id) {
      return null;
    }

    return (Array.isArray(this.articles) ? this.articles : [])
      .find((article: any) => Number(article?.article_id || 0) === id) || null;
  }

  private extractNomenclatureRows(response: any): any[] {
    const rows = response?.data || response || [];
    return Array.isArray(rows) ? rows : [];
  }

  private buildNomenclatureNode(line: any, parentQuantity: number): PreparationNomenclatureNode {
    const componentId = Number(line?.Composant_id || line?.composant_id || 0) || 0;
    const article = this.getArticleInfoById(componentId);
    const unitQuantity = this.normalizeQuantityValue(line?.Quantite ?? line?.quantite ?? 0);
    const totalQuantity = unitQuantity * parentQuantity;
    const price = this.normalizePriceValue(
      article?.pu ??
      article?.prix_vente ??
      article?.prix ??
      line?.pu ??
      line?.prix ??
      0
    );

    return {
      article_id: componentId,
      code: article?.article_cod || line?.composant_cod || '',
      designation: article?.article_nom || line?.composant_nom || '',
      quantite: unitQuantity,
      quantiteTotale: totalQuantity,
      prix: price,
      total: price * totalQuantity,
      famille: line?.famille_nom || article?.famille_nom || article?.famille || '',
      unite: line?.unite_nom || article?.unite_nom || article?.unite || '',
      poidsStandard: line?.Poids_Standard != null ? this.normalizeQuantityValue(line.Poids_Standard) : null,
      poidsReel: line?.Poids_reel != null ? this.normalizeQuantityValue(line.Poids_reel) : null,
      children: []
    };
  }

  private buildNomenclatureNodes(
    composeId: any,
    parentQuantity: number,
    depth: number = 0,
    visited: Set<number> = new Set<number>()
  ): Observable<PreparationNomenclatureNode[]> {
    const id = Number(composeId || 0);
    if (!id || depth > 4 || visited.has(id)) {
      return of([]);
    }

    const nextVisited = new Set(visited);
    nextVisited.add(id);

    return this.baseService.getArticleNomenclature(id).pipe(
      catchError(() => of({ data: [] })),
      switchMap((response: any) => {
        const rows = this.extractNomenclatureRows(response);
        if (rows.length === 0) {
          return of([]);
        }

        const nodeRequests: Observable<PreparationNomenclatureNode>[] = rows.map((line: any) => {
          const node = this.buildNomenclatureNode(line, parentQuantity);
          if (!node.article_id || depth >= 4 || nextVisited.has(node.article_id) || !this.isNomenclatureArticleId(node.article_id)) {
            return of(node);
          }

          return this.buildNomenclatureNodes(node.article_id, node.quantiteTotale, depth + 1, nextVisited).pipe(
            map((children: PreparationNomenclatureNode[]) => ({
              ...node,
              children
            }))
          );
        });

        return forkJoin(nodeRequests);
      })
    );
  }

  private loadNomenclatureForLineIfNeeded(index: number): void {
    const line = this.produits?.[index];
    const articleId = Number(line?.article_id || 0);

    if (line?.nomenclatureFromPersistedRows && this.hasNomenclatureComponents(line)) {
      line.isNomenclature = true;
      line.nomenclatureLoading = false;
      line.nomenclatureError = '';
      this.updateNomenclatureDisplayTotals(line);
      return;
    }

    if (!line || !articleId || !this.isNomenclatureArticleId(articleId)) {
      if (line?.nomenclatureFromPersistedRows && this.hasNomenclatureComponents(line)) {
        line.isNomenclature = true;
        this.updateNomenclatureDisplayTotals(line);
        return;
      }
      this.clearNomenclatureDisplay(line);
      return;
    }

    line.isNomenclature = true;
    line.nomenclatureLoading = true;
    line.nomenclatureError = '';
    line.nomenclatureComponents = [];
    line.nomenclatureTotal = 0;

    const lineRef = line;
    const quantity = this.normalizeQuantityValue(line.qte);
    this.buildNomenclatureNodes(articleId, quantity).subscribe({
      next: (nodes: PreparationNomenclatureNode[]) => {
        if (!this.produits.includes(lineRef) || Number(lineRef?.article_id || 0) !== articleId) {
          return;
        }

        lineRef.nomenclatureComponents = nodes;
        lineRef.nomenclatureLoading = false;
        lineRef.nomenclatureError = nodes.length ? '' : 'Aucun composant défini pour cette nomenclature.';
        this.updateNomenclatureDisplayTotals(lineRef);
        this.collapsePersistedNomenclatureComponentRows(lineRef);
      },
      error: () => {
        if (!this.produits.includes(lineRef) || Number(lineRef?.article_id || 0) !== articleId) {
          return;
        }

        lineRef.nomenclatureComponents = [];
        lineRef.nomenclatureLoading = false;
        lineRef.nomenclatureError = 'Impossible de charger les composants de cette nomenclature.';
        lineRef.nomenclatureTotal = 0;
      }
    });
  }

  private clearNomenclatureDisplay(line: any): void {
    if (!line) {
      return;
    }

    line.isNomenclature = false;
    line.nomenclatureComponents = [];
    line.nomenclatureLoading = false;
    line.nomenclatureError = '';
    line.nomenclatureTotal = 0;
    line.nomenclatureFromPersistedRows = false;
  }

  private updateNomenclatureDisplayTotals(line: any): void {
    if (!line || !Array.isArray(line.nomenclatureComponents)) {
      return;
    }

    const quantity = this.normalizeQuantityValue(line.qte) || 0;
    this.updateNomenclatureNodeTotals(line.nomenclatureComponents, quantity);
    line.nomenclatureTotal = this.sumNomenclatureNodes(line.nomenclatureComponents);
  }

  private updateNomenclatureNodeTotals(nodes: PreparationNomenclatureNode[], parentQuantity: number): void {
    nodes.forEach((node: PreparationNomenclatureNode) => {
      node.quantiteTotale = this.normalizeQuantityValue(node.quantite) * parentQuantity;
      node.total = this.normalizePriceValue(node.prix) * node.quantiteTotale;
      if (Array.isArray(node.children) && node.children.length > 0) {
        this.updateNomenclatureNodeTotals(node.children, node.quantiteTotale);
      }
    });
  }

  private sumNomenclatureNodes(nodes: PreparationNomenclatureNode[]): number {
    return nodes.reduce((total: number, node: PreparationNomenclatureNode) => {
      const childrenTotal = Array.isArray(node.children) && node.children.length > 0
        ? this.sumNomenclatureNodes(node.children)
        : 0;
      return total + this.normalizePriceValue(node.total) + childrenTotal;
    }, 0);
  }

  hasNomenclatureComponents(line: any): boolean {
    return !!line && Array.isArray(line.nomenclatureComponents) && line.nomenclatureComponents.length > 0;
  }

  shouldDisplayNomenclatureComponents(line: any): boolean {
    return this.hasNomenclatureComponents(line) || !!line?.nomenclatureLoading || !!line?.nomenclatureError;
  }

  getNomenclatureTotal(line: any): number {
    return this.normalizePriceValue(line?.nomenclatureTotal);
  }

  onNomenclatureComponentQuantityChange(rootLine: any, node: PreparationNomenclatureNode, value: any): void {
    if (!rootLine || !node) {
      return;
    }

    const totalQuantity = Math.max(0, this.normalizeQuantityValue(value));
    const parentQuantity = Math.max(1, this.normalizeQuantityValue(rootLine.qte) || 1);
    node.quantite = totalQuantity / parentQuantity;
    node.quantiteTotale = totalQuantity;
    node.total = this.normalizePriceValue(node.prix) * totalQuantity;

    if (Array.isArray(node.children) && node.children.length > 0) {
      this.updateNomenclatureNodeTotals(node.children, totalQuantity);
    }

    rootLine.nomenclatureTotal = this.sumNomenclatureNodes(rootLine.nomenclatureComponents || []);
  }

  trackByNomenclatureNode(index: number, node: PreparationNomenclatureNode): string {
    return `${node.article_id}-${index}`;
  }

  private normalizeArticleUnitMeta(data: any): any {
    const rows = Array.isArray(data) ? data : [];
    if (rows.length === 0) {
      return null;
    }

    const normalized = rows.map((row: any) => ({
      unite_id: row?.unite_id != null ? Number(row.unite_id) : null,
      unite_nom: row?.unite_nom || '',
      fact: Number(row?.fact || 0)
    }));

    return normalized.find((row: any) => row.fact > 1) || normalized[0];
  }

  private applyArticleUnitMeta(index: number, meta: any): void {
    if (!this.produits?.[index]) {
      return;
    }

    this.produits[index].unite_id = meta?.unite_id ?? null;
    this.produits[index].unite_nom = meta?.unite_nom || '';
    this.produits[index].fact = Number(meta?.fact || 0);
  }

  private loadArticleUnitMeta(index: number, articleId: any): void {
    const id = Number(articleId || 0);
    if (!id || !this.produits?.[index]) {
      this.applyArticleUnitMeta(index, null);
      return;
    }

    if (this.articleUnitCache[id]) {
      this.applyArticleUnitMeta(index, this.articleUnitCache[id]);
      return;
    }

    this.baseService.getArticleUnites(id).pipe(
      catchError(() => of([]))
    ).subscribe((response: any) => {
      if (!this.produits?.[index]) {
        return;
      }

      const rows = response?.data || response || [];
      const meta = this.normalizeArticleUnitMeta(rows) || (() => {
        const article = (this.articles || []).find((a: any) => Number(a?.article_id || 0) === id);
        if (!article) return null;
        return {
          unite_id: article?.unite_id != null ? Number(article.unite_id) : null,
          unite_nom: article?.unite_nom || article?.unite || '',
          fact: 0
        };
      })();
      this.articleUnitCache[id] = meta;
      this.applyArticleUnitMeta(index, meta);
    });
  }

  getDisplayedUnitQuantity(line: any): number {
    const qte = Number(line?.qte || 0);
    const fact = Number(line?.fact || 0);
    if (!Number.isFinite(qte)) {
      return 0;
    }
    if (!Number.isFinite(fact) || fact <= 0) {
      return qte;
    }
    return Math.floor(qte / fact);
  }

  getBoxCount(line: any): number {
    const qte = Math.max(0, Number(line?.qte || 0));
    const fact = Number(line?.fact || 0);
    if (!Number.isFinite(fact) || fact <= 0) {
      return 0;
    }
    return Math.floor(qte / fact);
  }

  getUnitRemainder(line: any): number {
    const qte = Math.max(0, Number(line?.qte || 0));
    const fact = Number(line?.fact || 0);
    if (!Number.isFinite(fact) || fact <= 0) {
      return qte;
    }
    return qte % fact;
  }

  isTransferredLine(line: any): boolean {
    return Number(line?.etat || 0) === 1 && this.getTransferableQuantity(line) <= 0;
  }

  getTransferableQuantity(line: any): number {
    return Math.max(0, Number(line?.qte || 0) - Number(line?.quantite_transferee || 0));
  }

  getPreparedQuantityForArticle(articleId: any, untilIndex: number = this.produits.length - 1): number {
    const safeArticleId = Number(articleId || 0);
    if (!safeArticleId) return 0;
    return this.produits.reduce((sum, current, index) => {
      if (index > untilIndex) return sum;
      if (Number(current?.article_id || 0) !== safeArticleId) return sum;
      return sum + Math.max(0, Number(current?.qte || 0));
    }, 0);
  }

  getTotalPreparedQuantityForArticle(articleId: any): number {
    const safeArticleId = Number(articleId || 0);
    if (!safeArticleId) return 0;
    return this.produits.reduce((sum, current) => {
      if (Number(current?.article_id || 0) !== safeArticleId) return sum;
      return sum + Math.max(0, Number(current?.qte || 0));
    }, 0);
  }

  getRemainingDemandForArticle(articleId: any, demandedQty: any): number {
    const demanded = Math.max(0, Number(demandedQty || 0));
    if (demanded <= 0) {
      return 0;
    }
    return demanded - this.getTotalPreparedQuantityForArticle(articleId);
  }

  getDemandIndicatorValue(line: any): number | null {
    const articleId = Number(line?.article_id || 0);
    const demanded = Math.max(0, Number(line?.qte_demandee || 0));
    if (!articleId || demanded <= 0) {
      return null;
    }
    return this.getRemainingDemandForArticle(articleId, demanded);
  }

  onQuantityFocus(index: number): void {
    this.focusedQuantityIndex = index;
  }

  onQuantityBlur(index: number): void {
    if (this.focusedQuantityIndex === index) {
      this.focusedQuantityIndex = null;
    }
  }

  isDemandExceeded(line: any, index: number): boolean {
    return Boolean(line?.exceeded_warning || line?.quantity_warning_visible);
  }

  refreshDemandWarnings(): void {
    const cumulativeByArticle = new Map<number, number>();
    this.produits.forEach((line: any) => {
      const articleId = Number(line?.article_id || 0);
      const demanded = Number(line?.qte_demandee || 0);
      const currentQty = Math.max(0, Number(line?.qte || 0));

      if (!articleId || demanded <= 0) {
        line.exceeded_warning = false;
        line.quantity_warning_visible = false;
        line.quantity_limit_message = '';
        return;
      }

      const previous = cumulativeByArticle.get(articleId) || 0;
      const next = previous + currentQty;
      line.exceeded_warning = next > demanded;
      if (line.exceeded_warning && !line.quantity_limit_message) {
        line.quantity_limit_message = `Quantité maximale autorisée: ${Math.max(0, demanded - previous)}`;
      } else if (!line.exceeded_warning) {
        line.quantity_warning_visible = false;
        line.quantity_limit_message = '';
      }
      cumulativeByArticle.set(articleId, next);
    });
  }

  onQuantityChange(index: number, value?: any): void {
    const line = this.produits?.[index];
    if (!line) return;

    const numericValue = Number(value);
    line.qte = Number.isFinite(numericValue) ? Math.max(0, numericValue) : 0;
    line.quantity_limit_message = '';
    line.quantity_warning_visible = false;

    this.recalculateTotal(index);
    this.refreshDemandWarnings();

    if (!line.exceeded_warning) {
      return;
    }

    const demanded = Number(line?.qte_demandee || 0);
    const prepared = this.getPreparedQuantityForArticle(line?.article_id);
    const articleLabel = line?.articleSearch || line?.designation || 'cet article';
    line.quantity_limit_message = `Le cumul préparé (${prepared}) dépasse la quantité commandée (${demanded}).`;
    line.quantity_warning_visible = true;
    Swal.fire(
      'Attention',
      `Le cumul préparé pour ${articleLabel} dépasse la quantité commandée (${prepared} / ${demanded}).`,
      'warning'
    );
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
      Swal.fire('Info', 'Veuillez choisir un article d\'abord.', 'info');
      return;
    }

    const a = (this.articles || []).find((x: any) => Number(x?.article_id) === articleId);
    if (!a) {
      Swal.fire('Erreur', 'Details article non trouves.', 'error');
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
      const stockDisponibleDisplay = Number.isFinite(stockDisponible) ? String(stockDisponible) : this.escLetter(stockDisponibleRaw ?? '-');
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
        item('&#8595;', 'Stock min', detail.stock_min),
        item('&#9733;', 'Stock disponible', `<strong style="color:${stockDisponibleColor};font-weight:900;">${stockDisponibleDisplay}</strong>`, '', true),
        item('&#8593;', 'Stock max', detail.stock_max),
        item('&#9762;', 'Perissabilite', detail.perissabilite),
        item('&#10003;', 'Prix achat', detail.prix_achat),
        item('&#10010;', 'Prix vente', detail.prix_vente),
        item('&#9873;', 'Depot', detail.depot)
      ].join('');

      const html = `
        <div style="border:1px solid #9c7443;border-radius:12px;padding:22px 18px 14px;background:linear-gradient(180deg,#f3e1be 0%,#ead2a7 100%);font-family: Palatino Linotype, Bookman Old Style, Garamond, Times New Roman, serif;">
          <div style="text-align:center;font-size:1.2rem;letter-spacing:.08em;font-weight:700;text-transform:uppercase;color:#5f3b17;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid rgba(90,58,27,.4);">Fiche Article</div>
          ${ruptureBanner}
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
            <div style="border:1px solid rgba(113,73,35,.22);border-radius:8px;padding:8px 10px;background:rgba(255,248,231,.4);">${leftColumn}</div>
            <div style="border:1px solid rgba(113,73,35,.22);border-radius:8px;padding:8px 10px;background:rgba(255,248,231,.4);">${rightColumn}</div>
          </div>
        </div>
      `;

      Swal.fire({ html, width: 900, background: 'transparent', confirmButtonText: 'Fermer' });
    });
  }

  recalculateTotal(index: number): void {
    const p = this.produits[index];
    if (!p) return;
    const q = Number(p.qte || 0);
    const pu = Number(p.pu || 0);
    const tva = Number(p.taxe || 0);
    const ht = q * pu;
    p.total = ht + (ht * tva);
    this.updateNomenclatureDisplayTotals(p);
  }

  get sousTotal(): number {
    return this.produits.reduce((sum, p) => sum + (Number(p.qte || 0) * Number(p.pu || 0)), 0);
  }

  get taxeTotal(): number {
    return this.produits.reduce((sum, p) => {
      const ht = Number(p.qte || 0) * Number(p.pu || 0);
      return sum + (ht * Number(p.taxe || 0));
    }, 0);
  }

  get totalGeneral(): number {
    return this.produits.reduce((sum, p) => sum + Number(p.total || 0), 0);
  }

  get sourceDetails(): any[] {
    const rows = (Array.isArray(this.preparation?.source_details) ? this.preparation.source_details : [])
      .filter((row: any) => !this.isPersistedNomenclatureLine(row));
    const visibleArticleIds = new Set(
      (Array.isArray(this.produits) ? this.produits : [])
        .map((line: any) => Number(line?.article_id || 0))
        .filter((articleId: number) => articleId > 0)
    );

    if (visibleArticleIds.size === 0) {
      return rows;
    }

    return rows.filter((row: any) => visibleArticleIds.has(Number(row?.article_id || 0)));
  }

  get totalDemandePreparation(): number {
    const visibleSourceTotal = this.sourceDetails.reduce((sum: number, row: any) => {
      return sum + Math.max(0, Number(row?.quantite_demandee || 0));
    }, 0);

    return visibleSourceTotal > 0
      ? visibleSourceTotal
      : Math.max(0, Number(this.preparation?.total_demande || 0));
  }

  get totalPreparePreparation(): number {
    return this.produits.reduce((sum, line) => sum + Math.max(0, Number(line?.qte || 0)), 0);
  }

  get totalRestantPreparation(): number {
    return Math.max(0, Number(this.preparation?.total_restant_preparer || 0));
  }

  get totalTransferePreparation(): number {
    return Math.max(0, Number(this.preparation?.total_transfere || 0));
  }

  get totalRestantTransferer(): number {
    return this.produits.reduce((sum, line) => sum + this.getTransferableQuantity(line), 0);
  }

  get hasDemandExceeded(): boolean {
    return this.produits.some((line) => Boolean(line?.exceeded_warning));
  }

  get hasUnsavedLines(): boolean {
    return this.produits.some((line) =>
      Number(line?.id || 0) <= 0
      && Number(line?.article_id || 0) > 0
      && Number(line?.qte || 0) > 0
    );
  }

  get progressPercent(): number {
    if (this.totalDemandePreparation <= 0) return 0;
    return Math.min(100, Math.max(0, (this.totalPreparePreparation / this.totalDemandePreparation) * 100));
  }

  get progressText(): string {
    return `${this.totalPreparePreparation} / ${this.totalDemandePreparation} (${this.progressPercent.toFixed(0)}%)`;
  }

  get isPreparationComplete(): boolean {
    return this.totalDemandePreparation > 0 && this.totalPreparePreparation === this.totalDemandePreparation;
  }

  get preparationStatusLabel(): string {
    if (this.isPreparationComplete) return 'Transféré';
    if (this.totalPreparePreparation > 0) return 'Partiel';
    return 'Brouillon';
  }

  get preparationStatusClass(): string {
    if (this.isPreparationComplete) return 'bg-success';
    if (this.totalPreparePreparation > 0) return 'bg-info text-dark';
    return 'bg-warning text-dark';
  }

  canTransferPreparation(): boolean {
    return !this.hasUnsavedLines && this.totalRestantTransferer > 0;
  }

  private buildNomenclatureComponentPayload(line: any): any[] {
    if (!this.hasNomenclatureComponents(line)) {
      return [];
    }

    return this.flattenNomenclatureNodes(line.nomenclatureComponents)
      .filter((node) => Number(node?.article_id || 0) > 0 && this.normalizeQuantityValue(node?.quantiteTotale) > 0)
      .map((node) => ({
        article_id: Number(node.article_id || 0),
        quantite: this.normalizeQuantityValue(node.quantiteTotale),
        prix: this.normalizePriceValue(node.prix),
        taux_tva: this.normalizePriceValue(line?.taxe),
        depot_id: Number(line?.depot_id || 0) || null,
        designation: (node.designation || '').toString().trim(),
        lot: '',
        etat: Number(line?.etat || 0),
        unite_id: Number(line?.unite_id || 0) || 1,
        type: 1
      }));
  }

  private buildPreparationLines(): any[] {
    return this.produits
      .filter((p: any) => Number(p?.article_id || 0) > 0 && Number(p?.qte || 0) > 0)
      .map((p: any) => {
        const line = {
          article_id: Number(p.article_id || 0),
          quantite: Number(p.qte || 0),
          prix: Number(p.pu || 0),
          taux_tva: Number(p.taxe || 0),
          depot_id: Number(p.depot_id || 0) || null,
          designation: (p.designation || p.articleSearch || '').toString().trim(),
          lot: (p.lot || '').toString().trim(),
          etat: Number(p.etat || 0),
          unite_id: Number(p.unite_id || 0) || 1,
          nomenclature_components: this.buildNomenclatureComponentPayload(p)
        };

        return line;
      });
  }

  saveLines(): void {
    this.refreshDemandWarnings();
    const exceededLine = this.produits.find((p: any) => Boolean(p?.exceeded_warning));
    if (exceededLine) {
      Swal.fire('Attention', 'La quantité préparée dépasse la quantité commandée pour au moins un article.', 'warning');
      return;
    }

    const lignesValides = this.buildPreparationLines();

    if (lignesValides.length === 0) {
      Swal.fire('Attention', 'Ajoutez au moins une ligne produit valide (article + quantité).', 'warning');
      return;
    }

    this.savingLines = true;
    this.stockService.savePreparationLines(this.preparationId, lignesValides).subscribe({
      next: (res: any) => {
        this.savingLines = false;
        const data = res?.data || this.preparation;
        this.mapPreparationToForm(data);
        Swal.fire('Succès', res?.message || 'Lignes enregistrées.', 'success');
      },
      error: (err) => {
        this.savingLines = false;
        Swal.fire('Erreur', err?.error?.message || 'Enregistrement des lignes impossible.', 'error');
      }
    });
  }

  imprimer(): void {
    if (this.printing) {
      return;
    }

    this.printing = true;
    this.stockService.exportPreparationPdf(this.preparationId).subscribe({
      next: (response: any) => {
        this.printing = false;
        const blob = response?.body;
        if (!blob) {
          Swal.fire('Erreur', 'PDF introuvable.', 'error');
          return;
        }
        const blobUrl = window.URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        setTimeout(() => window.URL.revokeObjectURL(blobUrl), 60000);
      },
      error: (err) => {
        this.printing = false;
        Swal.fire('Erreur', err?.error?.message || 'Impossible d\'ouvrir le PDF.', 'error');
      }
    });
  }

  transfererVersLivraison(): void {
    if (!this.canTransferPreparation()) {
      Swal.fire('Info', 'Aucune quantité restante à transférer.', 'info');
      return;
    }
    this.transfering = true;
    this.stockService.transfererPreparationVersLivraison(this.preparationId).subscribe({
      next: (res: any) => {
        this.transfering = false;
        Swal.fire('Succès', res?.message || 'Transfert effectué.', 'success').then(() => this.loadInitialData());
      },
      error: (err) => {
        this.transfering = false;
        Swal.fire('Erreur', err?.error?.message || 'Transfert impossible.', 'error');
      }
    });
  }

  backToList(): void { this.router.navigate(['/Stock/Preparation']); }
}

