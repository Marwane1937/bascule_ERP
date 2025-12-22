import { Component, OnInit, AfterViewInit } from '@angular/core';
import { BaseService } from 'src/app/service/base.service';
import * as $ from 'jquery';
import 'datatables.net';
import { Router } from '@angular/router';

@Component({
  selector: 'app-client',
  templateUrl: './client.component.html',
  styleUrls: ['./client.component.css']
})
export class ClientComponent implements OnInit, AfterViewInit {
  clients: any[] = [];
  dataTable: any;
  loading: boolean = true; // ← par défaut on affiche le spinner

  constructor(private baseService: BaseService ,private router : Router) {}

  ngOnInit(): void {
    this.getClients();
  }

  ngAfterViewInit(): void {
    // Ne rien faire ici, on initialise dans getClients après chargement
  }

  getClients(): void {
  this.loading = true;

  this.baseService.getClient().subscribe((response: any) => {
    this.clients = response?.data || (Array.isArray(response) ? response : []);

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
  this.router.navigate(['/Edit-Client/'+ part_id]);
}

}
