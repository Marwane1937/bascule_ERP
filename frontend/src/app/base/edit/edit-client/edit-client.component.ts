import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import Swal from 'sweetalert2';
declare var $: any;

@Component({
  selector: 'app-edit-client',
  templateUrl: './edit-client.component.html',
  styleUrls: ['./edit-client.component.css']
})
export class EditClientComponent implements OnInit, AfterViewInit {
  adresses: any[] = [];
  identifiants: any[] = [];
  contacts: any[] = [];
  part_id: any;
  villes: any;
  comerciaux: any;
  identifs: any;
 checkedIdentifiants: any[] = [];

  selectedAdresse:any = null;
  selectedContact: any = null;
  selectedIdentifiant: any = null;

  constructor(private baseService: BaseService, private route: ActivatedRoute,
              private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.AllVille();
    this.AllCommercial();
    this.AllIdentifiant();
    this.route.params.subscribe(params => {
      this.part_id = params['part_id'];
      if (this.part_id) {
        this.getClientDetails(this.part_id);
      }
    });
  }

  ngAfterViewInit(): void {}

  AllVille() {
    this.baseService.getVille().subscribe(data => {
      this.villes = data;
    });
  }

  AllCommercial() {
    this.baseService.getCommercial().subscribe(data => {
      this.comerciaux = data;
    });
  }

  AllIdentifiant() {
    this.baseService.getIdentifiants().subscribe(data => {
      this.identifs = data;
    });
  }

  getClientDetails(part_id: string): void {
    this.baseService.getClientComplement(part_id).subscribe((data: any) => {
      this.adresses = data.adresses || [];
      this.contacts = data.contacts || [];
      this.identifiants = data.identifiants || [];

      setTimeout(() => {
        $('#adresseTable').DataTable({
          order: [[0, 'desc']] // Trier par la première colonne en DESC par défaut
        });
        $('#identifiantTable').DataTable({
          order: [[0, 'desc']] // Trier par la première colonne en DESC par défaut
        });
        $('#contactTable').DataTable({
          order: [[0, 'desc']] // Trier par la première colonne en DESC par défaut
        });
      }, 100);
    });
  }

 getVilleNomById(ville: number): string {
  const ville_nom = this.villes.find((v: any) => v.id === ville);
  return ville_nom ? ville_nom.id : '';
}
getVilleIdByNom(nom: string): number | null {
  const ville = this.villes.find((v: any) => v.nom === nom);
  return ville ? ville.id : null;
}
 getCommercialById(company_contact: number): string {
    const commercial_nom = this.comerciaux.find((c: any) => c.id === company_contact);
   return commercial_nom ? commercial_nom.nom : '';  
  } 
 getIdentifiantById(identifiant_type: number): string {
    const type = this.identifs.find((i: any) => i.id === identifiant_type);
   return type ? type.nom : '';  
  } 

  // ✳️ Afficher modale pour ajout
  onAddAdresse() {
    this.selectedAdresse = {
      adresse: '',
      ville_id: null,
      postal_code: ''
    };
    ($('#adresseModal') as any).modal('show');
  }

  // ✅ Enregistrer adresse sans recharger
onSaveAdresse(): void {
  const part_id = this.part_id;
  const isEdit = !!this.selectedAdresse.id;

  const payload = {
    adresses: [
      {
        id: this.selectedAdresse.id, // facultatif si c'est un ajout
        adresse: this.selectedAdresse.adresse,
        ville_id: this.selectedAdresse.ville_id,
        postal_code: this.selectedAdresse.postal_code
      }
    ],
    contacts: [],
    identifiants: []
  };

  const request$ = isEdit
    ? this.baseService.updateClientDetails(part_id, payload)
    : this.baseService.saveClientDetails(part_id, payload);

  request$.subscribe({
    next: () => {
      const table: any = $('#adresseTable').DataTable();

      if (isEdit) {
        const rowIndex = table
          .rows()
          .indexes()
          .filter((idx: number) => {
            const row = table.row(idx).node();
            return $(row).hasClass('editing');
          })[0];

        table
          .row(rowIndex)
          .data([
            '<input type="checkbox" />',
            this.selectedAdresse.adresse,
            this.selectedAdresse.postal_code,
            this.getVilleNomById(this.selectedAdresse.ville_id),
            `<button class="btn btn-warning btn-round"><i class="fas fa-edit"></i></button>`
          ])
          .draw(false);

        table.row(rowIndex).node().classList.remove('editing');
        this.showSuccess('Adresse modifiée avec succès.');
      } else {
        const newRow = [
          '<input type="checkbox" />',
          this.selectedAdresse.adresse,
          this.selectedAdresse.postal_code,
          this.getVilleNomById(this.selectedAdresse.ville_id),
          `<button class="btn btn-warning btn-round"><i class="fas fa-edit"></i></button>`
        ];

        const rowNode = table.row.add(newRow).draw(false).node();
        $(rowNode).find('td').css('text-align', 'center');
        $(rowNode).addClass('ligne-surbrillance');

        this.showSuccess('Adresse ajoutée avec succès.');
      }

      ($('#adresseModal') as any).modal('hide');

      this.selectedAdresse = {
        adresse: null,
        postal_code: null,
        ville_id: null
      };
    },
    error: (err) => {
      console.error('❌ Erreur:', err);
      this.showError(isEdit ? 'Erreur lors de la modification' : 'Erreur lors de l\'ajout de l\'adresse');
    }
  });
}


  // ✅ CONTACT
onAddContact() {
  const nextLigne = this.getNextLigne(); // fonction que tu vas ajouter ci-dessous
  this.selectedContact = {
    ligne: nextLigne.toString(),
    company_contact: null
  };
  ($('#contactModal') as any).modal('show');
}
//// INSERT & UPDATE
onSaveContact(): void {
  const part_id = this.part_id;
  const isEdit = !!this.selectedContact.id;

  const commercialObj = this.comerciaux.find(
    (c: any) => c.id === Number(this.selectedContact.company_contact)
  );

  const payload = {
    adresses: [],
    contacts: [
      {
        id: this.selectedContact.id, // Sera undefined pour un nouvel ajout
        ligne: this.selectedContact.ligne,
        company_contact: this.selectedContact.company_contact
      }
    ],
    identifiants: []
  };

  const request$ = isEdit
    ? this.baseService.updateClientDetails(part_id, payload)
    : this.baseService.saveClientDetails(part_id, payload);

  request$.subscribe({
    next: () => {
      const table: any = $('#contactTable').DataTable();

      if (isEdit) {
        // 🔁 Mise à jour de la ligne en édition
        const rowIndex = table
          .rows()
          .indexes()
          .filter((idx: number) => {
            const row = table.row(idx).node();
            return $(row).hasClass('editing');
          })[0];

        table
          .row(rowIndex)
          .data([
            '<input type="checkbox" />',
            this.selectedContact.ligne,
            commercialObj ? commercialObj.nom : '',
            `<button class="btn btn-warning btn-round"><i class="fas fa-edit"></i></button>`
          ])
          .draw(false);

        table.row(rowIndex).node().classList.remove('editing');
        this.showSuccess('Contact modifié avec succès.');
      } else {
        // ➕ Ajout d'une nouvelle ligne
        const newRow = [
          '<input type="checkbox" />',
          this.selectedContact.ligne,
          commercialObj ? commercialObj.nom : '',
          `<button class="btn btn-warning btn-round"><i class="fas fa-edit"></i></button>`
        ];

        const rowNode = table.row.add(newRow).draw(false).node();
        $(rowNode).find('td').css('text-align', 'center');
        $(rowNode).addClass('ligne-surbrillance');

        this.showSuccess('Contact ajouté avec succès.');
      }

      // Fermer la modale
      ($('#contactModal') as any).modal('hide');

      // Réinitialiser le formulaire
      this.selectedContact = {
        ligne: null,
        company_contact: null
      };
    },
    error: (err) => {
      console.error('❌ Erreur:', err);
      this.showError(isEdit ? 'Erreur lors de la modification' : 'Erreur lors de l\'ajout du contact');
    }
  });
}


getNextLigne(): number {
  if (!this.contacts || this.contacts.length === 0) return 1;

  const lignes = this.contacts.map(i => parseInt(i.ligne, 10));
  const max = Math.max(...lignes);
  return max + 1;
}
  // ✅ IDENTIFIANT
 onAddIdentifiant(): void {
  this.selectedIdentifiant = {
    identifiant: '',
    identifiant_type: null
  };
  ($('#identifiantModal') as any).modal('show');
}

onSaveIdentifiant(): void {
  const part_id = this.part_id;

  const isEdit = !!this.selectedIdentifiant.id; // ✅ Si ID présent => modification

  const identifObj = this.identifs.find(
    (i: any) => i.id === Number(this.selectedIdentifiant.identifiant_type)
  );

  const payload = {
    adresses: [],
    identifiants: [
      {
        id: this.selectedIdentifiant.id, // ❗ Ne pas oublier l’id s’il existe
        identifiant_type: identifObj ? identifObj.id : '',
        type: identifObj ? identifObj.nom : '',
        identifiant: this.selectedIdentifiant.identifiant
      }
    ],
    contacts: []
  };

  this.baseService.saveClientDetails(part_id, payload).subscribe({
    next: () => {
      const table: any = $('#identifiantTable').DataTable();

      const rowData = [
        '<input type="checkbox" />',
        identifObj ? identifObj.nom : '',
        this.selectedIdentifiant.identifiant,
        `<button class="btn btn-warning btn-round"><i class="fas fa-edit"></i></button>`
      ];

      if (isEdit) {
        // 🔁 Modifier la ligne existante
        const rowIndex = table
          .rows()
          .indexes()
          .filter((idx: number) => {
            const row = table.row(idx).node();
            return $(row).hasClass('editing'); // ligne marquée à modifier
          })[0];

        table.row(rowIndex).data(rowData).draw(false);
        table.row(rowIndex).node().classList.remove('editing');

        this.showSuccess('Identifiant modifié avec succès.');
      } else {
        // ➕ Ajouter une nouvelle ligne
        const rowNode = table.row.add(rowData).draw(false).node();
        if (rowNode) {
          $(rowNode).find('td').css('text-align', 'center');
          $(rowNode).addClass('ligne-surbrillance');
        }

        // Ajouter à ton tableau local Angular si nécessaire
        this.identifiants.push(payload.identifiants[0]);

        this.showSuccess('Identifiant ajouté avec succès.');
      }

      // Fermer la modale
      ($('#identifiantModal') as any).modal('hide');

      // Réinitialiser le champ
      this.selectedIdentifiant = {
        identifiant: '',
        identifiant_type: null
      };
    },
    error: (err) => {
      console.error('❌ Erreur:', err);
      this.showError(isEdit ? 'Erreur lors de la modification de l\'identifiant' : 'Erreur lors de l\'ajout de l\'identifiant');
    }
  });
}


  // ✅ Alertes
  showSuccess(message: string) {
    Swal.fire({
      icon: 'success',
      title: 'Succès',
      text: message,
      confirmButtonText: 'OK',
      customClass: {
        confirmButton: 'btn btn-success'
      },
      buttonsStyling: false
    });
  }

  showError(message: string) {
    Swal.fire({
      icon: 'error',
      title: 'Erreur',
      text: message,
      confirmButtonText: 'Fermer',
      customClass: {
        confirmButton: 'btn btn-danger'
      },
      buttonsStyling: false
    });
  }


onCheckboxChange(row: any): void {
  if (row.checked) {
    this.checkedIdentifiants.push(row);
  } else {
    this.checkedIdentifiants = this.checkedIdentifiants.filter(r => r.id !== row.id);
  }

 }

/////// Pour la suppression
onDeleteIdentifiants(): void {
    if (this.checkedIdentifiants.length === 0) {
    this.showError('Veuillez sélectionner au moins un identifiant à supprimer ');
    return;
  }

  const table: any = $('#identifiantTable').DataTable();

  const identifiantsToDelete = this.checkedIdentifiants.map(item => ({ id: item.id }));

  this.checkedIdentifiants.forEach(item => {
    table.rows().every((rowIdx: any) => {
      const data = table.row(rowIdx).data();
      const identifiant = data[2];
      if (identifiant === item.identifiant) {
        table.row(rowIdx).remove();
      }
    });
    this.identifiants = this.identifiants.filter(c => c.id !== item.id);
  });

  table.draw(false);
  this.checkedIdentifiants = [];

  this.baseService.deleteClientDetails({
    identifiants: identifiantsToDelete,
    adresses: [],
    contacts: []
  }).subscribe({
    next: res => {
      this.showSuccess('Les identifiants sélectionnés ont été supprimés avec succès ');
    },
    error: err => {
      console.error('❌ Erreur suppression', err);
    }
  });
}
///////
onDeleteAdresses(): void {
    if (this.checkedIdentifiants.length === 0) {
    this.showError('Veuillez sélectionner au moins une adresse à supprimer ');
    return;
  }

  const table: any = $('#adresseTable').DataTable();

  const adressesToDelete = this.checkedIdentifiants.map(item => ({ id: item.id }));

  this.checkedIdentifiants.forEach(item => {
    table.rows().every((rowIdx: any) => {
      const data = table.row(rowIdx).data();
      const adresse = data[1]; // Ajuster selon colonne
      if (adresse === item.adresse) {
        table.row(rowIdx).remove();
      }
    });
    this.adresses = this.adresses.filter(a => a.id !== item.id);
  });

  table.draw(false);
  this.checkedIdentifiants = [];

  this.baseService.deleteClientDetails({
    identifiants: [],
    adresses: adressesToDelete,
    contacts: []
  }).subscribe({
    next: res => {
      this.showSuccess('Les adresses sélectionnées ont été supprimées avec succès ');
    },
    error: err => {
      console.error('❌ Erreur suppression adresses', err);
    }
  });
}
///////

onDeleteContacts(): void {
  if (this.checkedIdentifiants.length === 0) {
    this.showError('Veuillez sélectionner au moins un contact à supprimer ');
    return;
  }

  const table: any = $('#contactTable').DataTable();

  const contactsToDelete = this.checkedIdentifiants.map(item => ({ id: item.id }));

  this.checkedIdentifiants.forEach(item => {
    table.rows().every((rowIdx: any) => {
      const data = table.row(rowIdx).data();
      const nom = data[1]; // Adapter si nécessaire
      if (nom === item.nom) {
        table.row(rowIdx).remove();
      }
    });
    this.contacts = this.contacts.filter(i => i.id !== item.id);
  });

  table.draw(false);
  this.checkedIdentifiants = [];

  this.baseService.deleteClientDetails({
    identifiants: [],
    adresses: [],
    contacts: contactsToDelete
  }).subscribe({
    next: res => {
      this.showSuccess('Les contacts sélectionnés ont été supprimés avec succès');
    },
    error: err => {
      console.error('❌ Erreur suppression contacts', err);
    }
  });
}

////// EDIT

editMode = {
  adresse: false,
  contact: false,
  identifiant: false
};

currentEditItem = {
  adresse: null,
  contact: null,
  identifiant: null
};

onEditAdresse(adresse: any, index: number): void {
  // Passer en mode édition
  this.editMode.adresse = true;

  // Sauvegarder les données sélectionnées
  this.selectedAdresse = {
    id: adresse.id,
    adresse: adresse.adresse,
    ville_id: adresse.ville,
    postal_code: adresse.postal_code
  };

  // Marquer la ligne comme en édition dans DataTable
  const table = $('#adresseTable').DataTable();
  table.rows().nodes().to$().removeClass('editing'); // Retirer les anciennes
  $(table.row(index).node()).addClass('editing');    // Ajouter la classe à la ligne ciblée

  // Ouvrir la modale Bootstrap
  ($('#adresseModal') as any).modal('show');
}

onEditContact(row: any, index: number): void {
  // Sauvegarder les données de la ligne à modifier
  this.selectedContact = {
    id: row.id,
    ligne: row.ligne,
    company_contact: row.company_contact
  };

  // Marquer la ligne en cours de modification (pour DataTables)
  const table = $('#contactTable').DataTable();
  table.rows().nodes().to$().removeClass('editing'); // Clear previous
  $(table.row(index).node()).addClass('editing');

  // Ouvrir la modale
  ($('#contactModal') as any).modal('show');
}

onEditIdentifiant(identifiant: any): void {
  this.editMode.identifiant = true;
  this.selectedIdentifiant = { ...identifiant }; // Pour pré-remplir le modal
  $('#identifiantModal').modal('show');      // Ouvre le modal (jQuery Bootstrap)
}
}
