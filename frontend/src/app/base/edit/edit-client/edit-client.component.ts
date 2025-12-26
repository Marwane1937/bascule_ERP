import { AfterViewInit, ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { BaseService } from 'src/app/service/base.service';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
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
  clientInfo: { code: any; nom: string } = { code: '', nom: '' };
  villes: any[] = [];
  comerciaux: any[] = [];
  identifs: any[] = [];
 checkedIdentifiants: any[] = [];
  exonerationData: any = {
    identifiant: '',
    motif: 'Exonération TVA',
    reference: '',
    date_debut: null,
    date_fin: null
  };
  hasExoneration: boolean = false;
  allExonerations: any[] = [];

  selectedAdresse:any = null;
  selectedContact: any = null;
  selectedIdentifiant: any = null;

  constructor(private baseService: BaseService, private route: ActivatedRoute,
              private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Charger les données de référence en parallèle (une seule fois)
    forkJoin({
      villes: this.baseService.getVille().pipe(catchError(() => of({ data: [] }))),
      commerciaux: this.baseService.getCommercial().pipe(catchError(() => of({ data: [] }))),
      identifiants: this.baseService.getIdentifiants().pipe(catchError(() => of({ data: [] })))
    }).subscribe({
      next: (results: any) => {
        this.villes = results.villes?.data || (Array.isArray(results.villes) ? results.villes : []);
        this.comerciaux = results.comerciaux?.data || (Array.isArray(results.comerciaux) ? results.comerciaux : []);
        this.identifs = results.identifiants?.data || (Array.isArray(results.identifiants) ? results.identifiants : []);
      },
      error: (err) => {
        console.error('[EditClientComponent] Erreur chargement données de référence:', err);
        this.villes = [];
        this.comerciaux = [];
        this.identifs = [];
      }
    });

    // Charger les données du client en parallèle
    this.route.params.subscribe(params => {
      this.part_id = params['part_id'];
      if (this.part_id) {
        this.loadClientData();
      }
    });
  }

  /**
   * Charge toutes les données du client en parallèle pour optimiser les performances
   */
  loadClientData(): void {
    forkJoin({
      client: this.baseService.getClientById(this.part_id).pipe(catchError(() => of(null))),
      details: this.baseService.getClientComplement(this.part_id).pipe(catchError(() => of(null))),
      exoneration: this.baseService.getExoneration(this.part_id).pipe(catchError(() => of(null)))
    }).subscribe({
      next: (results: any) => {
        // Traiter les données du client de base
        if (results.client) {
          const client = results.client?.data || results.client;
          this.clientInfo = {
            code: client?.code ?? '',
            nom: client?.nom ?? ''
          };
        }

        // Traiter les détails (adresses, contacts, identifiants)
        if (results.details) {
          const details: any = results.details;
          this.adresses = details.adresses || [];
          this.contacts = details.contacts || [];
          this.identifiants = details.identifiants || [];
        } else {
          this.adresses = [];
          this.contacts = [];
          this.identifiants = [];
        }

        // Traiter l'exonération
        if (results.exoneration) {
          const data = results.exoneration?.data || results.exoneration;
          if (data && (data.identifiant || data.motif || data.reference || data.date_debut || data.date_fin)) {
            this.hasExoneration = true;
            this.exonerationData = {
              identifiant: data.identifiant || '',
              motif: data.motif || 'Exonération TVA',
              reference: data.reference || '',
              date_debut: data.date_debut || null,
              date_fin: data.date_fin || null
            };
          } else {
            this.hasExoneration = false;
            this.exonerationData = {
              identifiant: '',
              motif: 'Exonération TVA',
              reference: '',
              date_debut: null,
              date_fin: null
            };
          }
        } else {
          this.hasExoneration = false;
          this.exonerationData = {
            identifiant: '',
            motif: 'Exonération TVA',
            reference: '',
            date_debut: null,
            date_fin: null
          };
        }

        // Une seule détection de changements après tous les chargements
        this.cdr.detectChanges();

        // Initialiser DataTables après un court délai pour s'assurer que le DOM est prêt
        setTimeout(() => {
          this.initOrRefreshDataTable('#adresseTable', { order: [[0, 'desc']] });
          this.initOrRefreshDataTable('#identifiantTable', { order: [[0, 'desc']] });
          this.initOrRefreshDataTable('#contactTable', { order: [[0, 'desc']] });
        }, 50); // Réduit de 100ms à 50ms
      },
      error: (err) => {
        console.error('[EditClientComponent] ❌ Erreur chargement données client:', err);
        this.showError('Erreur lors du chargement des données du client.');
      }
    });
  }
  getClientBasic(part_id: string): void {
    this.baseService.getClientById(part_id).subscribe({
      next: (data: any) => {
        const client = data?.data || data;
        this.clientInfo = {
          code: client?.code ?? '',
          nom: client?.nom ?? ''
        };
        // Pas besoin de detectChanges ici, sera fait dans loadClientData
      },
      error: (err: any) => {
        console.error('[EditClientComponent] ❌ Erreur chargement client:', err);
        this.showError('❌ Erreur lors du chargement du client.');
      }
    });
  }

  onSaveClientBasic(): void {
    if (!this.part_id) {
      this.showError('❌ Identifiant client introuvable.');
      return;
    }
    if (!this.clientInfo?.nom || !String(this.clientInfo.nom).trim()) {
      this.showError('❗ Le nom du client est requis.');
      return;
    }
    if (this.clientInfo?.code == null || String(this.clientInfo.code).trim() === '') {
      this.showError('❗ Le code du client est requis.');
      return;
    }

    this.baseService.updateClient(this.part_id, {
      code: this.clientInfo.code,
      nom: this.clientInfo.nom
    }).subscribe({
      next: () => {
        this.showSuccess('Client mis à jour avec succès.');
      },
      error: (err: any) => {
        console.error('[EditClientComponent] ❌ Erreur update client:', err);
        this.showError(err?.error?.message || 'Erreur lors de la mise à jour du client.');
      }
    });
  }

  ngAfterViewInit(): void {}

  // Méthodes conservées pour compatibilité mais maintenant chargées en parallèle dans ngOnInit
  AllVille() {
    // Déjà chargé dans ngOnInit en parallèle
  }

  AllCommercial() {
    // Déjà chargé dans ngOnInit en parallèle
  }

  AllIdentifiant() {
    // Déjà chargé dans ngOnInit en parallèle
  }

  getClientDetails(part_id: string): void {
    this.baseService.getClientComplement(part_id).subscribe({
      next: (data: any) => {
        this.adresses = data?.adresses || [];
        this.contacts = data?.contacts || [];
        this.identifiants = data?.identifiants || [];

        // S'assurer que le DOM est à jour avant de (re)initialiser DataTables
        this.cdr.detectChanges();

        setTimeout(() => {
          this.initOrRefreshDataTable('#adresseTable', { order: [[0, 'desc']] });
          this.initOrRefreshDataTable('#identifiantTable', { order: [[0, 'desc']] });
          this.initOrRefreshDataTable('#contactTable', { order: [[0, 'desc']] });
        }, 50); // Réduit de 100ms à 50ms
      },
      error: (err: any) => {
        console.error('[EditClientComponent] ❌ Erreur chargement complément client:', err);
        this.adresses = [];
        this.contacts = [];
        this.identifiants = [];
        this.showError(err?.error?.message || 'Erreur lors du chargement des détails client.');
      }
    });
  }

  /**
   * Évite l'erreur DataTables "Cannot reinitialise DataTable" en détruisant
   * l'instance existante avant ré-init (utile après reload / onglets).
   */
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
      // Ne pas casser l'écran si DataTables n'est pas dispo
      console.warn('[EditClientComponent] DataTable init skipped/error for', selector, e);
    }
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

  const isEdit = !!this.selectedIdentifiant?.original_identifiant_type; // ✅ modification si on a un "original"

  const identifObj = this.identifs.find(
    (i: any) => i.id === Number(this.selectedIdentifiant.identifiant_type)
  );

  const payload = {
    adresses: [],
    identifiants: [
      {
        identifiant_type: identifObj ? identifObj.id : null,
        identifiant: (this.selectedIdentifiant.identifiant || '').toString(),
        // Pour gérer le changement de type (PK = part_id + identifiant_type)
        original_identifiant_type: this.selectedIdentifiant.original_identifiant_type,
        original_identifiant: this.selectedIdentifiant.original_identifiant
      }
    ],
    contacts: []
  };

  // Ajout => POST /:id/details (UPSERT côté backend)
  // Modif => PUT /:id/details (supprime l'ancien type si changement, puis UPSERT)
  const request$ = isEdit
    ? this.baseService.updateClientDetails(part_id, payload)
    : this.baseService.saveClientDetails(part_id, payload);

  request$.subscribe({
    next: () => {
      ($('#identifiantModal') as any).modal('hide');
      this.showSuccess(isEdit ? 'Identifiant modifié avec succès.' : 'Identifiant ajouté avec succès.');
      // Recharger depuis le serveur pour refléter l'UPSERT et éviter les incohérences DataTables
      this.getClientDetails(part_id);
      this.selectedIdentifiant = { identifiant: '', identifiant_type: null };
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
    const selected = (this.identifiants || []).filter((x: any) => x?.checked);
    if (selected.length === 0) {
    this.showError('Veuillez sélectionner au moins un identifiant à supprimer ');
    return;
  }
  
  const identifiantsToDelete = selected.map((item: any) => ({
    // PK = (part_id, identifiant_type)
    // @ts-ignore
    identifiant_type: item.identifiant_type
  }));

  this.baseService.deleteClientDetails({
    part_id: this.part_id,
    // on garde le champ "identifiants" (backend sait traiter identifiant_type)
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
      console.error('❌ Erreur suppression', err);
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
  this.selectedIdentifiant = {
    ...identifiant,
    original_identifiant_type: identifiant.identifiant_type,
    original_identifiant: identifiant.identifiant
  }; // Pour pré-remplir le modal + permettre update (PK)
  $('#identifiantModal').modal('show');      // Ouvre le modal (jQuery Bootstrap)
}

  // ✅ EXONERATION
  loadExoneration(reset: boolean = false): void {
    if (!this.part_id) {
      // Si pas de part_id, juste réinitialiser les champs
      if (reset) {
        this.exonerationData = {
          identifiant: '',
          motif: 'Exonération TVA',
          reference: '',
          date_debut: null,
          date_fin: null
        };
        this.hasExoneration = false;
        this.cdr.detectChanges();
      }
      return;
    }

    // Si reset est true, vider les champs sans charger depuis le serveur
    if (reset) {
      this.exonerationData = {
        identifiant: '',
        motif: 'Exonération TVA',
        reference: '',
        date_debut: null,
        date_fin: null
      };
      this.hasExoneration = false;
      this.cdr.detectChanges();
      return;
    }

    // Sinon, charger depuis le serveur
    this.baseService.getExoneration(this.part_id).subscribe({
      next: (response: any) => {
        const data = response?.data || response;
        if (data && (data.identifiant || data.motif || data.reference || data.date_debut || data.date_fin)) {
          // Une exonération existe
          this.hasExoneration = true;
          this.exonerationData = {
            identifiant: data.identifiant || '',
            motif: data.motif || 'Exonération TVA',
            reference: data.reference || '',
            date_debut: data.date_debut || null,
            date_fin: data.date_fin || null
          };
        } else {
          // Aucune exonération
          this.hasExoneration = false;
          this.exonerationData = {
            identifiant: '',
            motif: 'Exonération TVA',
            reference: '',
            date_debut: null,
            date_fin: null
          };
        }
        // Pas besoin de detectChanges si appelé depuis loadClientData
        if (!this.adresses.length && !this.contacts.length && !this.identifiants.length) {
          this.cdr.detectChanges();
        }
      },
      error: (err: any) => {
        console.error('[EditClientComponent] ❌ Erreur chargement exonération:', err);
        // En cas d'erreur (ex: 404), aucune exonération n'existe
        this.hasExoneration = false;
        this.exonerationData = {
          identifiant: '',
          motif: 'Exonération TVA',
          reference: '',
          date_debut: null,
          date_fin: null
        };
        this.cdr.detectChanges();
      }
    });
  }

  onSaveExoneration(): void {
    if (!this.part_id) {
      this.showError('❌ Identifiant client introuvable.');
      return;
    }

    const payload = {
      identifiant: this.exonerationData.identifiant || null,
      motif: this.exonerationData.motif || 'Exonération TVA',
      reference: this.exonerationData.reference || null,
      date_debut: this.exonerationData.date_debut || null,
      date_fin: this.exonerationData.date_fin || null,
      type: null,
      etat: null,
      user_id: null // À remplir si vous avez un système d'authentification
    };

    this.baseService.saveOrUpdateExoneration(this.part_id, payload).subscribe({
      next: (response: any) => {
        this.showSuccess(response?.message || 'Lettre d\'exonération ajoutée avec succès.');
        // Vider les champs après ajout pour permettre l'ajout d'une nouvelle lettre
        this.exonerationData = {
          identifiant: '',
          motif: 'Exonération TVA',
          reference: '',
          date_debut: null,
          date_fin: null
        };
        this.loadExoneration(); // Recharger pour s'assurer que les données sont à jour et mettre à jour hasExoneration
      },
      error: (err: any) => {
        console.error('[EditClientComponent] ❌ Erreur sauvegarde exonération:', err);
        this.showError(err?.error?.message || 'Erreur lors de la sauvegarde de l\'exonération.');
      }
    });
  }

  // Calculer les jours restants avant expiration
  getDaysRemaining(dateFin: string | null): number | null {
    if (!dateFin) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const finDate = new Date(dateFin);
    finDate.setHours(0, 0, 0, 0);
    const diffTime = finDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  }

  // Vérifier si la lettre est périmée
  isExpired(dateFin: string | null): boolean {
    if (!dateFin) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const finDate = new Date(dateFin);
    finDate.setHours(0, 0, 0, 0);
    return finDate < today;
  }

  // Obtenir le statut de la lettre
  getStatus(dateFin: string | null): string {
    if (!dateFin) return 'Non défini';
    if (this.isExpired(dateFin)) {
      return 'Périmé';
    }
    return 'Valide';
  }

  // Ouvrir la modale pour afficher toutes les lettres d'exonération
  openAllExonerationsModal(): void {
    if (!this.part_id) {
      this.showError('❌ Identifiant client introuvable.');
      return;
    }

    // Charger toutes les exonérations
    this.baseService.getAllExonerations(this.part_id).subscribe({
      next: (response: any) => {
        // Gérer différentes structures de réponse
        if (response && response.success !== undefined) {
          this.allExonerations = response.data || [];
        } else if (Array.isArray(response)) {
          this.allExonerations = response;
        } else if (response && response.data) {
          this.allExonerations = Array.isArray(response.data) ? response.data : [];
        } else {
          this.allExonerations = [];
        }
        // Ouvrir la modale
        ($('#allExonerationsModal') as any).modal('show');
        this.cdr.detectChanges();
      },
      error: (err: any) => {
        console.error('[EditClientComponent] ❌ Erreur chargement toutes les exonérations:', err);
        // Ne pas afficher d'erreur si c'est juste une 404 (pas d'exonérations)
        if (err.status !== 404) {
          this.showError('Erreur lors du chargement des lettres d\'exonération.');
        }
        this.allExonerations = [];
        // Ouvrir quand même la modale pour afficher le message "Aucune lettre"
        ($('#allExonerationsModal') as any).modal('show');
        this.cdr.detectChanges();
      }
    });
  }
}
