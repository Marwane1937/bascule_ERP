import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-edit-bon-commande',
  templateUrl: './edit-bon-commande.component.html',
  styleUrls: ['./edit-bon-commande.component.css']
})
export class EditBonCommandeComponent implements OnInit {
  documentId: number = 0;

  constructor(private route: ActivatedRoute) { }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('document_id');
    if (id) {
      this.documentId = +id;
      // TODO: Charger les données du bon de commande
    }
  }
}

