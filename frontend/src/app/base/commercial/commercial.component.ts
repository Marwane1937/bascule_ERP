import { AfterViewInit, Component, OnInit } from '@angular/core';
import { BaseService } from 'src/app/service/base.service';

@Component({
  selector: 'app-commercial',
  templateUrl: './commercial.component.html',
  styleUrls: ['./commercial.component.css']
})
export class CommercialComponent  implements OnInit, AfterViewInit {
  Commercials: any[] = [];
  dataTable: any;
  loading: boolean = true; // ← par défaut on affiche le spinner

  constructor(private baseService: BaseService) {}

  ngOnInit(): void {
    this.getClients();
  }

  ngAfterViewInit(): void {
    // Ne rien faire ici, on initialise dans getClients après chargement
  }

  getClients(): void {
  this.loading = true;

  this.baseService.getCommercial().subscribe((response: any) => {
    this.Commercials = response?.data || (Array.isArray(response) ? response : []);

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

}
