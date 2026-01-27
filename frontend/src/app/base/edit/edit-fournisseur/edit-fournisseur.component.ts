import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import Swal from 'sweetalert2';
declare var $: any;

@Component({
  selector: 'app-edit-fournisseur',
  templateUrl: './edit-fournisseur.component.html',
  styleUrls: ['./edit-fournisseur.component.css']
})
export class EditFournisseurComponent implements OnInit, AfterViewInit {
  adresses: any[] = [];
  identifiants: any[] = [];
  contacts: any[] = [];
  part_id: any;
  fournisseurInfo: { code: any; nom: string } = { code: '', nom: '' };
  villes: any[] = [];
  comerciaux: any[] = [];
  identifs: any[] = [];
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
        this.getFournisseurBasic(this.part_id);
        this.getClientDetails(this.part_id);
      }
    });
  }

  getFournisseurBasic(part_id: string): void {
    this.baseService.getClientById(part_id).subscribe({
      next: (data: any) => {
        const fournisseur = data?.data || data;
        this.fournisseurInfo = {
          code: fournisseur?.code ?? '',
          nom: fournisseur?.nom ?? ''
        };
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        this.showError('❌ Erreur lors du chargement du fournisseur.');
      }
    });
  }

  onSaveFournisseurBasic(): void {
    if (!this.part_id) {
      this.showError('❌ Identifiant fournisseur introuvable.');
      return;
    }
    if (!this.fournisseurInfo?.nom || !String(this.fournisseurInfo.nom).trim()) {
      this.showError('❗ Le nom du fournisseur est requis.');
      return;
    }
    if (this.fournisseurInfo?.code == null || String(this.fournisseurInfo.code).trim() === '') {
      this.showError('❗ Le code du fournisseur est requis.');
      return;
    }

    this.baseService.updateClient(this.part_id, {
      code: this.fournisseurInfo.code,
      nom: this.fournisseurInfo.nom
    }).subscribe({
      next: () => {
        this.showSuccess('Fournisseur mis à jour avec succès.');
      },
      error: (err: any) => {
        this.showError(err?.error?.message || 'Erreur lors de la mise à jour du fournisseur.');
      }
    });
  }

  ngAfterViewInit(): void {}

  AllVille() {
    this.baseService.getVille().subscribe((response: any) => {
      this.villes = response?.data || (Array.isArray(response) ? response : []);
    }, err => {
      this.villes = [];
    });
  }

  AllCommercial() {
    this.baseService.getCommercial().subscribe((response: any) => {
      this.comerciaux = response?.data || (Array.isArray(response) ? response : []);
    }, err => {
      this.comerciaux = [];
    });
  }

  AllIdentifiant() {
    this.baseService.getIdentifiants().subscribe((response: any) => {
      this.identifs = response?.data || (Array.isArray(response) ? response : []);
    }, err => {
      this.identifs = [];
    });
  }

  getClientDetails(part_id: string): void {
    this.baseService.getClientComplement(part_id).subscribe({
      next: (data: any) => {
        this.adresses = data?.adresses || [];
        this.contacts = data?.contacts || [];
        this.identifiants = data?.identifiants || [];

        this.cdr.detectChanges();

        setTimeout(() => {
          this.initOrRefreshDataTable('#adresseTable', { order: [[0, 'desc']] });
          this.initOrRefreshDataTable('#identifiantTable', { order: [[0, 'desc']] });
          this.initOrRefreshDataTable('#contactTable', { order: [[0, 'desc']] });
        }, 100);
      },
      error: (err: any) => {
        this.adresses = [];
        this.contacts = [];
        this.identifiants = [];
        this.showError(err?.error?.message || 'Erreur lors du chargement des détails fournisseur.');
      }
    });
  }

 getVilleNomById(ville: number): string {
  const ville_nom = this.villes.find((v: any) => v.id === ville);
  return ville_nom ? ville_nom.nom : '';
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

  const isEdit = !!this.selectedIdentifiant?.original_identifiant_type;

  const identifObj = this.identifs.find(
    (i: any) => i.id === Number(this.selectedIdentifiant.identifiant_type)
  );

  const payload = {
    adresses: [],
    identifiants: [
      {
        identifiant_type: identifObj ? identifObj.id : null,
        identifiant: (this.selectedIdentifiant.identifiant || '').toString(),
        original_identifiant_type: this.selectedIdentifiant.original_identifiant_type,
        original_identifiant: this.selectedIdentifiant.original_identifiant
      }
    ],
    contacts: []
  };

  const request$ = isEdit
    ? this.baseService.updateClientDetails(part_id, payload)
    : this.baseService.saveClientDetails(part_id, payload);

  request$.subscribe({
    next: () => {
      ($('#identifiantModal') as any).modal('hide');
      this.showSuccess(isEdit ? 'Identifiant modifié avec succès.' : 'Identifiant ajouté avec succès.');
      this.getClientDetails(part_id);
      this.selectedIdentifiant = { identifiant: '', identifiant_type: null };
    },
    error: (err) => {
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
    const selected = (this.identifiants || []).filter((x: any) => x?.checked);
    if (selected.length === 0) {
    this.showError('Veuillez sélectionner au moins un identifiant à supprimer ');
    return;
  }
  
  const identifiantsToDelete = selected.map((item: any) => ({
    identifiant_type: item.identifiant_type
  }));

  this.baseService.deleteClientDetails({
    part_id: this.part_id,
    // @ts-ignore
    identifiants: identifiantsToDelete as any,
    adresses: [],
    contacts: []
  }).subscribe({
    next: () => {
      this.showSuccess('Les identifiants sélectionnés ont été supprimés avec succès ');
      this.getClientDetails(this.part_id);
    },
    error: err => {
      this.showError(err?.error?.message || '❌ Erreur suppression identifiants');
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
  this.selectedIdentifiant = {
    ...identifiant,
    original_identifiant_type: identifiant.identifiant_type,
    original_identifiant: identifiant.identifiant
  };
  $('#identifiantModal').modal('show');      // Ouvre le modal (jQuery Bootstrap)
}

  private initOrRefreshDataTable(selector: string, options: any = {}): void {
    try {
      // @ts-ignore
      const hasDT = typeof ($) !== 'undefined' && $.fn && $.fn.DataTable;
      if (!hasDT) return;

      const $el = $(selector);
      if (!$el || $el.length === 0) return;

      // @ts-ignore
      if ($.fn.DataTable.isDataTable(selector)) {
        // @ts-ignore
        $el.DataTable().clear().destroy();
      }

      // @ts-ignore
      $el.DataTable(options);
    } catch (e) {
    }
  }
}
