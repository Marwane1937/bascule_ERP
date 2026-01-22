import { Component, OnInit } from '@angular/core';
import { FinanceService } from 'src/app/service/finance.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-finance-reporting',
  templateUrl: './finance-reporting.component.html',
  styleUrls: ['./finance-reporting.component.css']
})
export class FinanceReportingComponent implements OnInit {
  activeTab: string = 'compte-client';

  // Compte client
  compteClient: any[] = [];
  compteClientLoading: boolean = false;
  compteClientSearchTerm: string = '';
  compteClientCurrentPage: number = 1;
  compteClientPageSize: number = 25;
  compteClientTotalRecords: number = 0;
  compteClientTotalPages: number = 0;
  compteClientSortColumn: string = 'client_nom';
  compteClientSortDirection: 'ASC' | 'DESC' = 'ASC';

  // Balance client
  balanceClient: any[] = [];
  balanceClientLoading: boolean = false;
  balanceClientSearchTerm: string = '';
  balanceClientCurrentPage: number = 1;
  balanceClientPageSize: number = 25;
  balanceClientTotalRecords: number = 0;
  balanceClientTotalPages: number = 0;
  balanceClientSortColumn: string = 'client_nom';
  balanceClientSortDirection: 'ASC' | 'DESC' = 'ASC';
  balanceClientDateFrom: string = '';
  balanceClientDateTo: string = '';

  // Solde client
  soldeClient: any[] = [];
  soldeClientLoading: boolean = false;
  soldeClientSearchTerm: string = '';
  soldeClientCurrentPage: number = 1;
  soldeClientPageSize: number = 25;
  soldeClientTotalRecords: number = 0;
  soldeClientTotalPages: number = 0;
  soldeClientSortColumn: string = 'solde';
  soldeClientSortDirection: 'ASC' | 'DESC' = 'DESC';

  // Vue globale
  vueGlobale: any = null;
  vueGlobaleLoading: boolean = false;
  vueGlobaleDateFrom: string = '';
  vueGlobaleDateTo: string = '';

  constructor(private financeService: FinanceService) { }

  ngOnInit(): void {
    this.getCompteClient();
  }

  // === ONGLET COMPTE CLIENT ===

  getCompteClient(): void {
    this.compteClientLoading = true;

    const options: any = {
      page: this.compteClientCurrentPage,
      pageSize: this.compteClientPageSize,
      orderBy: this.compteClientSortColumn,
      orderDirection: this.compteClientSortDirection,
      search: this.compteClientSearchTerm
    };

    this.financeService.getCompteClient(options).subscribe({
      next: (response: any) => {
        this.compteClient = response.data || [];
        this.compteClientTotalRecords = response.pagination?.total || 0;
        this.compteClientTotalPages = response.pagination?.totalPages || 0;
        this.compteClientLoading = false;
      },
      error: (error) => {
        console.error('Erreur chargement compte client:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement des comptes clients', 'error');
        this.compteClientLoading = false;
      }
    });
  }

  onCompteClientSearch(): void {
    this.compteClientCurrentPage = 1;
    this.getCompteClient();
  }

  onCompteClientPageChange(page: number): void {
    this.compteClientCurrentPage = page;
    this.getCompteClient();
  }

  onCompteClientSort(column: string): void {
    if (this.compteClientSortColumn === column) {
      this.compteClientSortDirection = this.compteClientSortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.compteClientSortColumn = column;
      this.compteClientSortDirection = 'ASC';
    }
    this.compteClientCurrentPage = 1;
    this.getCompteClient();
  }

  getCompteClientSortIcon(column: string): string {
    if (this.compteClientSortColumn !== column) {
      return 'fa-sort';
    }
    return this.compteClientSortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // === ONGLET BALANCE CLIENT ===

  getBalanceClient(): void {
    this.balanceClientLoading = true;

    const options: any = {
      page: this.balanceClientCurrentPage,
      pageSize: this.balanceClientPageSize,
      orderBy: this.balanceClientSortColumn,
      orderDirection: this.balanceClientSortDirection,
      search: this.balanceClientSearchTerm
    };

    if (this.balanceClientDateFrom) options.dateFrom = this.balanceClientDateFrom;
    if (this.balanceClientDateTo) options.dateTo = this.balanceClientDateTo;

    this.financeService.getBalanceClient(options).subscribe({
      next: (response: any) => {
        this.balanceClient = response.data || [];
        this.balanceClientTotalRecords = response.pagination?.total || 0;
        this.balanceClientTotalPages = response.pagination?.totalPages || 0;
        this.balanceClientLoading = false;
      },
      error: (error) => {
        console.error('Erreur chargement balance client:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement de la balance client', 'error');
        this.balanceClientLoading = false;
      }
    });
  }

  onBalanceClientSearch(): void {
    this.balanceClientCurrentPage = 1;
    this.getBalanceClient();
  }

  onBalanceClientPageChange(page: number): void {
    this.balanceClientCurrentPage = page;
    this.getBalanceClient();
  }

  onBalanceClientSort(column: string): void {
    if (this.balanceClientSortColumn === column) {
      this.balanceClientSortDirection = this.balanceClientSortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.balanceClientSortColumn = column;
      this.balanceClientSortDirection = 'ASC';
    }
    this.balanceClientCurrentPage = 1;
    this.getBalanceClient();
  }

  getBalanceClientSortIcon(column: string): string {
    if (this.balanceClientSortColumn !== column) {
      return 'fa-sort';
    }
    return this.balanceClientSortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // === ONGLET SOLDE CLIENT ===

  getSoldeClient(): void {
    this.soldeClientLoading = true;

    const options: any = {
      page: this.soldeClientCurrentPage,
      pageSize: this.soldeClientPageSize,
      orderBy: this.soldeClientSortColumn,
      orderDirection: this.soldeClientSortDirection,
      search: this.soldeClientSearchTerm
    };

    this.financeService.getSoldeClient(options).subscribe({
      next: (response: any) => {
        this.soldeClient = response.data || [];
        this.soldeClientTotalRecords = response.pagination?.total || 0;
        this.soldeClientTotalPages = response.pagination?.totalPages || 0;
        this.soldeClientLoading = false;
      },
      error: (error) => {
        console.error('Erreur chargement solde client:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement des soldes clients', 'error');
        this.soldeClientLoading = false;
      }
    });
  }

  onSoldeClientSearch(): void {
    this.soldeClientCurrentPage = 1;
    this.getSoldeClient();
  }

  onSoldeClientPageChange(page: number): void {
    this.soldeClientCurrentPage = page;
    this.getSoldeClient();
  }

  onSoldeClientSort(column: string): void {
    if (this.soldeClientSortColumn === column) {
      this.soldeClientSortDirection = this.soldeClientSortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.soldeClientSortColumn = column;
      this.soldeClientSortDirection = 'DESC';
    }
    this.soldeClientCurrentPage = 1;
    this.getSoldeClient();
  }

  getSoldeClientSortIcon(column: string): string {
    if (this.soldeClientSortColumn !== column) {
      return 'fa-sort';
    }
    return this.soldeClientSortDirection === 'ASC' ? 'fa-sort-up' : 'fa-sort-down';
  }

  // === ONGLET VUE GLOBALE ===

  getVueGlobale(): void {
    this.vueGlobaleLoading = true;

    const options: any = {};
    if (this.vueGlobaleDateFrom) options.dateFrom = this.vueGlobaleDateFrom;
    if (this.vueGlobaleDateTo) options.dateTo = this.vueGlobaleDateTo;

    this.financeService.getVueGlobale(options).subscribe({
      next: (response: any) => {
        this.vueGlobale = response.data || null;
        this.vueGlobaleLoading = false;
      },
      error: (error) => {
        console.error('Erreur chargement vue globale:', error);
        Swal.fire('Erreur', 'Erreur lors du chargement de la vue globale', 'error');
        this.vueGlobaleLoading = false;
      }
    });
  }

  // === UTILITAIRES ===

  switchTab(tab: string): void {
    this.activeTab = tab;
    if (tab === 'compte-client' && this.compteClient.length === 0) {
      this.getCompteClient();
    } else if (tab === 'balance-client' && this.balanceClient.length === 0) {
      this.getBalanceClient();
    } else if (tab === 'solde-client' && this.soldeClient.length === 0) {
      this.getSoldeClient();
    } else if (tab === 'vue-globale' && !this.vueGlobale) {
      this.getVueGlobale();
    }
  }

  formatCurrency(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR'
    }).format(amount || 0);
  }

  formatDate(date: string): string {
    if (!date) return '';
    return new Date(date).toLocaleDateString('fr-FR');
  }

  getDisplayRange(currentPage: number, pageSize: number, totalRecords: number): string {
    const start = (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalRecords);
    return `${start} - ${end}`;
  }

  getPageNumbers(totalPages: number, currentPage: number): number[] {
    const pages: number[] = [];
    const maxPages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPages / 2));
    let endPage = Math.min(totalPages, startPage + maxPages - 1);

    if (endPage - startPage < maxPages - 1) {
      startPage = Math.max(1, endPage - maxPages + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }

    return pages;
  }

  // === EXPORT COMPTE CLIENT ===

  exportCompteClient(format: 'pdf' | 'excel'): void {
    if (this.compteClient.length === 0) {
      Swal.fire('Erreur', 'Aucune donnée à exporter', 'error');
      return;
    }

    if (format === 'pdf') {
      this.exportCompteClientPDF();
    } else {
      this.exportCompteClientExcel();
    }
  }

  exportCompteClientPDF(): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Compte Client</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #007bff; text-align: center; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f8f9fa; font-weight: bold; }
              .text-end { text-align: right; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <h1>Compte Client - ${new Date().toLocaleDateString('fr-FR')}</h1>
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th style="text-align: right;">Débit</th>
                  <th style="text-align: right;">Crédit</th>
                  <th style="text-align: right;">Solde</th>
                </tr>
              </thead>
              <tbody>
                ${this.compteClient.map(item => `
                  <tr>
                    <td>${item.client_nom || '-'}</td>
                    <td style="text-align: right;">${this.formatCurrency(item.debit || 0)}</td>
                    <td style="text-align: right;">${this.formatCurrency(item.credit || 0)}</td>
                    <td style="text-align: right;"><strong>${this.formatCurrency(item.solde || 0)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }

  exportCompteClientExcel(): void {
    const csvData = [
      ['Client', 'Débit', 'Crédit', 'Solde'],
      ...this.compteClient.map(item => [
        item.client_nom || '',
        item.debit || 0,
        item.credit || 0,
        item.solde || 0
      ])
    ];

    this.downloadCSV(csvData, 'compte-client.csv');
  }

  // === EXPORT BALANCE CLIENT ===

  exportBalanceClient(format: 'pdf' | 'excel'): void {
    if (this.balanceClient.length === 0) {
      Swal.fire('Erreur', 'Aucune donnée à exporter', 'error');
      return;
    }

    if (format === 'pdf') {
      this.exportBalanceClientPDF();
    } else {
      this.exportBalanceClientExcel();
    }
  }

  exportBalanceClientPDF(): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const dateRange = this.balanceClientDateFrom && this.balanceClientDateTo
        ? `du ${this.formatDate(this.balanceClientDateFrom)} au ${this.formatDate(this.balanceClientDateTo)}`
        : 'toutes périodes';

      printWindow.document.write(`
        <html>
          <head>
            <title>Balance Client</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #007bff; text-align: center; }
              .periode { text-align: center; color: #6c757d; margin-bottom: 20px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f8f9fa; font-weight: bold; }
              .text-end { text-align: right; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <h1>Balance Client</h1>
            <div class="periode">Période: ${dateRange}</div>
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Client</th>
                  <th>Document</th>
                  <th style="text-align: right;">Débit</th>
                  <th style="text-align: right;">Crédit</th>
                  <th style="text-align: right;">Solde</th>
                </tr>
              </thead>
              <tbody>
                ${this.balanceClient.map(item => `
                  <tr>
                    <td>${this.formatDate(item.date)}</td>
                    <td>${item.client_nom || '-'}</td>
                    <td>${item.numero || '-'}</td>
                    <td style="text-align: right;">${this.formatCurrency(item.debit || 0)}</td>
                    <td style="text-align: right;">${this.formatCurrency(item.credit || 0)}</td>
                    <td style="text-align: right;"><strong>${this.formatCurrency(item.solde || 0)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }

  exportBalanceClientExcel(): void {
    const csvData = [
      ['Date', 'Client', 'Document', 'Débit', 'Crédit', 'Solde'],
      ...this.balanceClient.map(item => [
        this.formatDate(item.date),
        item.client_nom || '',
        item.numero || '',
        item.debit || 0,
        item.credit || 0,
        item.solde || 0
      ])
    ];

    this.downloadCSV(csvData, 'balance-client.csv');
  }

  // === EXPORT SOLDE CLIENT ===

  exportSoldeClient(format: 'pdf' | 'excel'): void {
    if (this.soldeClient.length === 0) {
      Swal.fire('Erreur', 'Aucune donnée à exporter', 'error');
      return;
    }

    if (format === 'pdf') {
      this.exportSoldeClientPDF();
    } else {
      this.exportSoldeClientExcel();
    }
  }

  exportSoldeClientPDF(): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head>
            <title>Solde Client</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #007bff; text-align: center; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f8f9fa; font-weight: bold; }
              .text-end { text-align: right; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <h1>Solde Client - ${new Date().toLocaleDateString('fr-FR')}</h1>
            <table>
              <thead>
                <tr>
                  <th>Client</th>
                  <th style="text-align: right;">Solde</th>
                </tr>
              </thead>
              <tbody>
                ${this.soldeClient.map(item => `
                  <tr>
                    <td>${item.client_nom || '-'}</td>
                    <td style="text-align: right;"><strong>${this.formatCurrency(item.solde || 0)}</strong></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }

  exportSoldeClientExcel(): void {
    const csvData = [
      ['Client', 'Solde'],
      ...this.soldeClient.map(item => [
        item.client_nom || '',
        item.solde || 0
      ])
    ];

    this.downloadCSV(csvData, 'solde-client.csv');
  }

  // === EXPORT VUE GLOBALE ===

  exportVueGlobale(format: 'pdf' | 'excel'): void {
    if (!this.vueGlobale) {
      Swal.fire('Erreur', 'Aucune donnée à exporter', 'error');
      return;
    }

    if (format === 'pdf') {
      this.exportVueGlobalePDF();
    } else {
      this.exportVueGlobaleExcel();
    }
  }

  exportVueGlobalePDF(): void {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const dateRange = this.vueGlobaleDateFrom && this.vueGlobaleDateTo
        ? `du ${this.formatDate(this.vueGlobaleDateFrom)} au ${this.formatDate(this.vueGlobaleDateTo)}`
        : 'toutes périodes';

      printWindow.document.write(`
        <html>
          <head>
            <title>Vue Globale Finance</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              h1 { color: #007bff; text-align: center; }
              .periode { text-align: center; color: #6c757d; margin-bottom: 20px; }
              .summary { background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 5px; }
              .summary-item { margin: 10px 0; }
              .text-end { text-align: right; }
              @media print { body { margin: 0; } }
            </style>
          </head>
          <body>
            <h1>Vue Globale Finance</h1>
            <div class="periode">Période: ${dateRange}</div>
            <div class="summary">
              <div class="summary-item"><strong>Total Débits:</strong> ${this.formatCurrency(this.vueGlobale.total_debit || 0)}</div>
              <div class="summary-item"><strong>Total Crédits:</strong> ${this.formatCurrency(this.vueGlobale.total_credit || 0)}</div>
              <div class="summary-item"><strong>Solde Global:</strong> ${this.formatCurrency(this.vueGlobale.solde_global || 0)}</div>
              <div class="summary-item"><strong>Nombre de Clients:</strong> ${this.vueGlobale.nombre_clients || 0}</div>
            </div>
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  }

  exportVueGlobaleExcel(): void {
    const csvData = [
      ['Indicateur', 'Valeur'],
      ['Total Débits', this.vueGlobale.total_debit || 0],
      ['Total Crédits', this.vueGlobale.total_credit || 0],
      ['Solde Global', this.vueGlobale.solde_global || 0],
      ['Nombre de Clients', this.vueGlobale.nombre_clients || 0]
    ];

    this.downloadCSV(csvData, 'vue-globale-finance.csv');
  }

  // === UTILITAIRE POUR TÉLÉCHARGEMENT CSV ===

  downloadCSV(data: any[][], filename: string): void {
    const csvContent = data.map(row =>
      row.map(cell => {
        if (typeof cell === 'string' && (cell.includes(',') || cell.includes('"'))) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}








