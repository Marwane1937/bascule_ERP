import { AfterViewInit, Component, OnInit } from '@angular/core';
import { Route, Router } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';

@Component({
  selector: 'app-fournisseur',
  templateUrl: './fournisseur.component.html',
  styleUrls: ['./fournisseur.component.css']
})
export class FournisseurComponent  implements OnInit, AfterViewInit {
  fournisseurs: any[] = [];
  dataTable: any;
  loading: boolean = true; // ← par défaut on affiche le spinner

  constructor(private baseService: BaseService , private router : Router) {}

  ngOnInit(): void {
    this.getClients();
  }

  ngAfterViewInit(): void {
    // Ne rien faire ici, on initialise dans getClients après chargement
  }

  getClients(): void {
  this.loading = true;

  this.baseService.getFournisseur().subscribe((response: any) => {
    // Extraire les données de la réponse API qui est au format {success: true, data: [...]}
    this.fournisseurs = response?.data || (Array.isArray(response) ? response : []);

    setTimeout(() => {
      if (this.dataTable) {
        this.dataTable.destroy();
      }

      this.dataTable = $('#clientTable').DataTable({
        pageLength: 10,
        ordering: true,
        order: [[0, 'desc']], // Trier par la première colonne (ID) en DESC par défaut
        searching: true,
        lengthChange: true
      });

     
    }, 0);
     this.loading = false; // ✅ on cache le spinner après le chargement
  });
}
OnEdit(part_id : any){
  this.router.navigate(['/Edit-Fournisseur/'+ part_id]);
}
}
