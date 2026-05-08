import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-warehouse',
  templateUrl: './warehouse.component.html',
  styleUrls: ['./warehouse.component.css']
})
export class WarehouseComponent implements OnInit {
  warehouses: any[] = [];
  loading = true;

  currentPage = 1;
  pageSize = 25;
  totalRecords = 0;
  totalPages = 0;

  searchTerm = '';
  sortColumn = 'nom';
  sortDirection: 'ASC' | 'DESC' = 'ASC';

  constructor(private baseService: BaseService, private router: Router) {}

  ngOnInit(): void {
    this.loadWarehouses(1);
  }

  loadWarehouses(page: number = 1, search: string = ''): void {
    this.loading = true;
    this.currentPage = page;
    this.baseService.getWarehousesPaged({
      page: this.currentPage,
      pageSize: this.pageSize,
      orderBy: this.sortColumn,
      orderDirection: this.sortDirection,
      search: search || this.searchTerm
    }).subscribe({
      next: (response: any) => {
        this.warehouses = response?.data || [];
        const pagination = response?.pagination || {};
        this.totalRecords = pagination.total || 0;
        this.totalPages = pagination.totalPages || 1;
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.warehouses = [];
        this.totalRecords = 0;
        this.totalPages = 1;
        this.showError(`Erreur de chargement: ${err?.error?.message || err?.message || 'Erreur inconnue'}`);
      }
    });
  }

  onSearch(): void {
    this.loadWarehouses(1, this.searchTerm);
  }

  onSort(column: string): void {
    if (this.sortColumn === column) {
      this.sortDirection = this.sortDirection === 'ASC' ? 'DESC' : 'ASC';
    } else {
      this.sortColumn = column;
      this.sortDirection = 'ASC';
    }
    this.loadWarehouses(1);
  }

  getSortIcon(column: string): string {
    if (this.sortColumn !== column) return 'fa-sort text-muted';
    return this.sortDirection === 'ASC' ? 'fa-sort-up text-primary' : 'fa-sort-down text-primary';
  }

  onPageChange(page: number): void {
    if (page >= 1 && page <= this.totalPages && page !== this.currentPage) {
      this.loadWarehouses(page);
    }
  }

  onPageSizeChange(event: any): void {
    const nextSize = parseInt(event?.target?.value, 10);
    if (nextSize > 0 && nextSize !== this.pageSize) {
      this.pageSize = nextSize;
      this.loadWarehouses(1);
    }
  }

  getPageNumbers(): number[] {
    const pages: number[] = [];
    const maxVisible = 5;
    let start = Math.max(1, this.currentPage - Math.floor(maxVisible / 2));
    let end = Math.min(this.totalPages, start + maxVisible - 1);
    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1);
    }
    for (let i = start; i <= end; i++) pages.push(i);
    return pages;
  }

  getDisplayRange(): string {
    if (this.totalRecords === 0) return '0 - 0';
    const start = (this.currentPage - 1) * this.pageSize + 1;
    const end = Math.min(this.currentPage * this.pageSize, this.totalRecords);
    return `${start} - ${end}`;
  }

  isFonctionnel(status: any): boolean {
    return String(status || '').trim().toLowerCase() === 'fonctionnel';
  }

  goToEditWarehouse(id: number): void {
    if (!id) return;
    this.router.navigate(['/Edit-Warehouse', id]);
  }

  showError(message: string): void {
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: message
    });
  }
}

