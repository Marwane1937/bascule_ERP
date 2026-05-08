import { Component, OnInit } from '@angular/core';
import Swal from 'sweetalert2';
import * as XLSX from 'xlsx';
import { StockService } from 'src/app/service/stock.service';

@Component({
  selector: 'app-stock-entrepot',
  templateUrl: './stock-entrepot.component.html',
  styleUrls: ['./stock-entrepot.component.css']
})
export class StockEntrepotComponent implements OnInit {
  loading = false;
  entrepots: any[] = [];
  searchTerm = '';
  private readonly popupPageSize = 12;

  constructor(private stockService: StockService) {}

  ngOnInit(): void {
    this.loadEntrepots();
  }

  get filteredEntrepots(): any[] {
    const term = (this.searchTerm || '').trim().toLowerCase();
    if (!term) return this.entrepots;
    return (this.entrepots || []).filter((x: any) =>
      String(x?.code || '').toLowerCase().includes(term) ||
      String(x?.depot || '').toLowerCase().includes(term) ||
      String(x?.status || '').toLowerCase().includes(term)
    );
  }

  loadEntrepots(): void {
    this.loading = true;
    this.stockService.getEntrepotResume().subscribe({
      next: (res: any) => {
        this.entrepots = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : []);
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        Swal.fire('Erreur', 'Impossible de charger les entrepôts.', 'error');
      }
    });
  }

  qteEntree(value: any): number {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  qteSortie(value: any): number {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }

  async openEntrepotDetails(row: any): Promise<void> {
    const depotId = Number(row?.depot_id || 0);
    if (!depotId) {
      Swal.fire('Info', 'Dépôt invalide.', 'info');
      return;
    }

    Swal.fire({
      title: `Chargement - ${row?.depot || 'Entrepôt'}`,
      allowOutsideClick: false,
      didOpen: () => Swal.showLoading()
    });

    this.stockService.getEntrepotDetails(depotId).subscribe({
      next: async (res: any) => {
        const details = Array.isArray(res?.data) ? res.data : [];
        const depotName = details[0]?.depot || row?.depot || 'Entrepôt';
        const html = this.buildDetailsPopupHtml(depotName, details);

        const result = await Swal.fire({
          width: 1460,
          padding: 0,
          background: 'transparent',
          html,
          showCloseButton: true,
          showConfirmButton: true,
          confirmButtonText: 'Fermer',
          showDenyButton: true,
          denyButtonText: 'Exporter Excel',
          customClass: {
            popup: 'entrepot-popup-shell',
            confirmButton: 'btn btn-secondary',
            denyButton: 'btn btn-success'
          },
          didOpen: () => {
            this.initEntrepotPopupPagination(details);
          }
        });

        if (result.isDenied) {
          this.exportDetailsExcel(depotName, details);
        }
      },
      error: () => {
        Swal.fire('Erreur', 'Impossible de charger le détail de cet entrepôt.', 'error');
      }
    });
  }

  exportDetailsExcel(depotName: string, details: any[]): void {
    const rows = (details || []).map((d: any) => ({
      Depot: d.depot || depotName,
      Code_Article: d.Code_Article || '',
      Designation: d.Designation || '',
      Famille: d.Famille || '',
      Unite: d.unite || '',
      Qte_Entree: Number(d.qte_entree || 0),
      Qte_Sortie: Number(d.qte_sortie || 0),
      Stock_Disponible: Number(d.stock_disponible || 0)
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Entrepot');
    const safeName = String(depotName || 'entrepot').replace(/[\\/:*?"<>|]/g, '-');
    XLSX.writeFile(wb, `entrepot-${safeName}.xlsx`);
  }

  private esc(v: any): string {
    return String(v ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private normalizeSearchValue(value: any): string {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private matchesPopupSearch(row: any, term: string): boolean {
    if (!term) return true;

    const values = [
      row?.Code_Article,
      row?.Designation,
      row?.Famille,
      row?.unite,
      row?.depot,
      row?.qte_entree,
      row?.qte_sortie,
      row?.stock_disponible
    ];

    return values.some((value: any) => this.normalizeSearchValue(value).includes(term));
  }

  private buildDetailsPopupHtml(depotName: string, details: any[]): string {
    return `
      <div style="
        border-radius:16px;
        overflow:hidden;
        background:linear-gradient(180deg,#f8fbff 0%,#eef5ff 100%);
        border:1px solid rgba(59,130,246,.18);
        box-shadow:0 18px 45px rgba(15,23,42,.22);
        text-align:left;">
        <div style="padding:18px 20px;background:linear-gradient(135deg,#0ea5e9 0%,#2563eb 100%);color:#fff;">
          <div style="font-size:1.1rem;font-weight:700;">Entrepôt - ${this.esc(depotName)}</div>
          <div style="font-size:.9rem;opacity:.95;">Détail des mouvements par article (${details.length} ligne(s))</div>
        </div>
        <div style="padding:16px 18px; background:#f8fbff;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap;">
            <div style="flex:1 1 360px;min-width:260px;max-width:520px;">
              <div style="position:relative;">
                <span style="position:absolute;left:12px;top:50%;transform:translateY(-50%);color:#64748b;font-size:14px;">&#128269;</span>
                <input
                  id="entrepot-popup-search"
                  type="text"
                  placeholder="Rechercher code, désignation, famille, unité..."
                  autocomplete="off"
                  style="width:100%;padding:10px 12px 10px 36px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;font-size:13px;color:#0f172a;outline:none;box-sizing:border-box;"
                />
              </div>
            </div>
            <div id="entrepot-popup-search-summary" style="font-size:12px;color:#475569;white-space:nowrap;"></div>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
            <div id="entrepot-popup-page-info" style="font-size:12px;color:#475569;"></div>
            <div id="entrepot-popup-pager" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;"></div>
          </div>
          <div style="max-height:74vh;overflow:auto;border:1px solid #dbeafe;border-radius:12px;background:#fff;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;min-width:1180px;">
              <thead style="position:sticky;top:0;z-index:1;">
                <tr style="background:linear-gradient(135deg,#eff6ff 0%,#dbeafe 100%);">
                  <th style="padding:12px 10px;border-bottom:1px solid #bfdbfe;white-space:nowrap;">Code</th>
                  <th style="padding:12px 10px;border-bottom:1px solid #bfdbfe;text-align:left;white-space:nowrap;">Désignation</th>
                  <th style="padding:12px 10px;border-bottom:1px solid #bfdbfe;white-space:nowrap;">Famille</th>
                  <th style="padding:12px 10px;border-bottom:1px solid #bfdbfe;white-space:nowrap;">Unité</th>
                  <th style="padding:12px 10px;border-bottom:1px solid #bfdbfe;color:#15803d;white-space:nowrap;">Qté Entrée</th>
                  <th style="padding:12px 10px;border-bottom:1px solid #bfdbfe;color:#b91c1c;white-space:nowrap;">Qté Sortie</th>
                  <th style="padding:12px 10px;border-bottom:1px solid #bfdbfe;color:#1d4ed8;white-space:nowrap;">Stock disponible</th>
                </tr>
              </thead>
              <tbody id="entrepot-popup-table-body"></tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  private initEntrepotPopupPagination(details: any[]): void {
    const htmlContainer = Swal.getHtmlContainer();
    if (!htmlContainer) return;

    const searchInput = htmlContainer.querySelector('#entrepot-popup-search') as HTMLInputElement | null;
    const searchSummaryEl = htmlContainer.querySelector('#entrepot-popup-search-summary') as HTMLElement | null;
    const bodyEl = htmlContainer.querySelector('#entrepot-popup-table-body') as HTMLElement | null;
    const pagerEl = htmlContainer.querySelector('#entrepot-popup-pager') as HTMLElement | null;
    const infoEl = htmlContainer.querySelector('#entrepot-popup-page-info') as HTMLElement | null;
    if (!searchInput || !searchSummaryEl || !bodyEl || !pagerEl || !infoEl) return;

    let currentPage = 1;
    const rows = Array.isArray(details) ? details : [];
    let filteredRows = [...rows];

    const render = () => {
      const totalRows = filteredRows.length;
      const totalPages = Math.max(1, Math.ceil(totalRows / this.popupPageSize));
      currentPage = Math.min(totalPages, Math.max(1, currentPage));
      const start = (currentPage - 1) * this.popupPageSize;
      const pageRows = filteredRows.slice(start, start + this.popupPageSize);

      bodyEl.innerHTML = pageRows.length > 0
        ? pageRows.map((d: any) => `
            <tr>
              <td style="padding:10px;border-bottom:1px solid #eef2ff;white-space:nowrap;">${this.esc(d.Code_Article || '')}</td>
              <td style="padding:10px;border-bottom:1px solid #eef2ff;text-align:left;min-width:260px;">${this.esc(d.Designation || '')}</td>
              <td style="padding:10px;border-bottom:1px solid #eef2ff;white-space:nowrap;">${this.esc(d.Famille || '')}</td>
              <td style="padding:10px;border-bottom:1px solid #eef2ff;white-space:nowrap;">${this.esc(d.unite || '')}</td>
              <td style="padding:10px;border-bottom:1px solid #eef2ff;color:#15803d;font-weight:700;text-align:right;white-space:nowrap;">${Number(d.qte_entree || 0).toLocaleString('fr-FR')}</td>
              <td style="padding:10px;border-bottom:1px solid #eef2ff;color:#b91c1c;font-weight:700;text-align:right;white-space:nowrap;">${Number(d.qte_sortie || 0).toLocaleString('fr-FR')}</td>
              <td style="padding:10px;border-bottom:1px solid #eef2ff;color:#1d4ed8;font-weight:700;text-align:right;white-space:nowrap;">${Number(d.stock_disponible || 0).toLocaleString('fr-FR')}</td>
            </tr>
          `).join('')
        : '<tr><td colspan="7" style="padding:16px;text-align:center;color:#64748b;">Aucun article trouvé</td></tr>';

      const from = totalRows === 0 ? 0 : start + 1;
      const to = Math.min(start + this.popupPageSize, totalRows);
      infoEl.innerHTML = `Affichage <strong>${from}-${to}</strong> sur <strong>${totalRows}</strong> ligne(s)`;
      searchSummaryEl.innerHTML = totalRows === rows.length
        ? `Total: <strong>${rows.length}</strong> ligne(s)`
        : `Résultat(s): <strong>${totalRows}</strong> / ${rows.length}`;

      const pages = this.getPopupPageNumbers(currentPage, totalPages);
      pagerEl.innerHTML = `
        <button type="button" data-page="${currentPage - 1}" ${currentPage === 1 ? 'disabled' : ''}
          style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:4px 10px;font-size:12px;${currentPage === 1 ? 'opacity:.5;cursor:not-allowed;' : 'cursor:pointer;'}">
          Préc.
        </button>
        ${pages.map((p) => `
          <button type="button" data-page="${p}"
            style="border:1px solid ${p === currentPage ? '#2563eb' : '#cbd5e1'};background:${p === currentPage ? '#2563eb' : '#fff'};color:${p === currentPage ? '#fff' : '#334155'};border-radius:8px;padding:4px 10px;font-size:12px;cursor:pointer;">
            ${p}
          </button>
        `).join('')}
        <button type="button" data-page="${currentPage + 1}" ${currentPage === totalPages ? 'disabled' : ''}
          style="border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:4px 10px;font-size:12px;${currentPage === totalPages ? 'opacity:.5;cursor:not-allowed;' : 'cursor:pointer;'}">
          Suiv.
        </button>
      `;
    };

    pagerEl.addEventListener('click', (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest('button[data-page]') as HTMLButtonElement | null;
      if (!button || button.disabled) return;
      const page = Number(button.dataset['page'] || 1);
      if (!Number.isFinite(page)) return;
      const totalPages = Math.max(1, Math.ceil(filteredRows.length / this.popupPageSize));
      currentPage = Math.min(totalPages, Math.max(1, page));
      render();
    });

    searchInput.addEventListener('input', () => {
      const term = this.normalizeSearchValue(searchInput.value);
      filteredRows = rows.filter((row: any) => this.matchesPopupSearch(row, term));
      currentPage = 1;
      render();
    });

    render();
  }

  private getPopupPageNumbers(currentPage: number, totalPages: number): number[] {
    const maxVisible = 7;
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    let start = Math.max(1, currentPage - 3);
    let end = Math.min(totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
}
