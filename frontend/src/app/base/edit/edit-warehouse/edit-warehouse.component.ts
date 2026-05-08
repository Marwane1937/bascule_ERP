import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-edit-warehouse',
  templateUrl: './edit-warehouse.component.html',
  styleUrls: ['./edit-warehouse.component.css']
})
export class EditWarehouseComponent implements OnInit {
  warehouseId = 0;
  loading = false;
  saving = false;
  warehouseForm!: FormGroup;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private fb: FormBuilder,
    private baseService: BaseService
  ) {}

  ngOnInit(): void {
    this.warehouseForm = this.fb.group({
      code: ['', Validators.required],
      nom: ['', Validators.required],
      status: ['', Validators.required]
    });

    this.warehouseId = Number(this.route.snapshot.paramMap.get('id') || 0);
    if (!this.warehouseId) {
      this.showError('Identifiant warehouse introuvable');
      return;
    }
    this.loadWarehouse();
  }

  loadWarehouse(): void {
    this.loading = true;
    this.baseService.getWarehouseById(this.warehouseId).subscribe({
      next: (response: any) => {
        const data = response?.data || response;
        this.warehouseForm.patchValue({
          code: data?.code || '',
          nom: data?.nom || '',
          status: data?.status || ''
        });
        this.loading = false;
      },
      error: (err) => {
        this.loading = false;
        this.showError(err?.error?.message || 'Erreur lors du chargement du warehouse');
      }
    });
  }

  onSave(): void {
    if (this.warehouseForm.invalid || !this.warehouseId) {
      this.showError('Formulaire invalide');
      return;
    }
    this.saving = true;
    this.baseService.updateWarehouse(this.warehouseId, this.warehouseForm.value).subscribe({
      next: (res: any) => {
        this.saving = false;
        Swal.fire({
          icon: 'success',
          title: 'Succès',
          text: res?.message || 'Warehouse mis à jour avec succès'
        });
      },
      error: (err) => {
        this.saving = false;
        this.showError(err?.error?.message || 'Erreur lors de la mise à jour');
      }
    });
  }

  backToList(): void {
    this.router.navigate(['/Warehouse']);
  }

  private showError(message: string): void {
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: message
    });
  }
}

