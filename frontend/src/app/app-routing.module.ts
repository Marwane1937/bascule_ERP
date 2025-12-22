import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { DashbordComponent } from './dashbord/dashbord.component';
import { FamilleComponent } from './base/famille/famille.component';
import { ProduitComponent } from './base/produit/produit.component';
import { CommercialComponent } from './base/commercial/commercial.component';
import { FournisseurComponent } from './base/fournisseur/fournisseur.component';
import { ClientComponent } from './base/client/client.component';
import { EmployeComponent } from './base/employe/employe.component';
import { EditClientComponent } from './base/edit/edit-client/edit-client.component';
import { EditFournisseurComponent } from './base/edit/edit-fournisseur/edit-fournisseur.component';
import { EditProduitComponent } from './base/edit/edit-produit/edit-produit.component';
import { DevisComponent } from './vente/devis/devis.component';
import { EditDevisComponent } from './vente/edit/edit-devis/edit-devis.component';
import { EditcommandeComponent } from './vente/edit/editcommande/editcommande.component';
import { CommandeComponent } from './vente/commande/commande.component';
import { LivraisonComponent } from './vente/livraison/livraison.component';
import { EditlivraisonComponent } from './vente/edit/editlivraison/editlivraison.component';
import { FacturationComponent } from './vente/facturation/facturation.component';
import { ReglementComponent } from './vente/reglement/reglement.component';
import { EditReglementComponent } from './vente/edit/edit-reglement/edit-reglement.component';
import { RetourComponent } from './vente/retour/retour.component';
import { EditRetourComponent } from './vente/edit/edit-retour/edit-retour.component';
import { AvoirComponent } from './vente/avoir/avoir.component';
import { LoginComponent } from './auth/login/login.component';
import { UsersComponent } from './users/users.component';
import { UserPermissionsComponent } from './users/user-permissions/user-permissions.component';
import { ListesComponent } from './security/listes/listes.component';
import { CaisseComponent } from './vente/caisse/caisse.component';
import { CaisseRecettesComponent } from './vente/caisse/caisse-recettes.component';
import { CaisseDepensesComponent } from './vente/caisse/caisse-depenses.component';
import { BonCommandeComponent } from './achat/bon-commande/bon-commande.component';
import { EditBonCommandeComponent } from './achat/edit/edit-bon-commande/edit-bon-commande.component';
import { ChequeListComponent } from './generation/cheque-list/cheque-list.component';
import { ChequeEditorComponent } from './generation/cheque-editor/cheque-editor.component';
import { ChequePreviewComponent } from './generation/cheque-preview/cheque-preview.component';
import { CalibrationComponent } from './generation/calibration/calibration.component';
import { PdfPrintComponent } from './generation/pdf-print/pdf-print.component';

const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
  },
  {
    path: 'Dashbord',
    component: DashbordComponent,
  },
  {
    path: 'Client',
    component: ClientComponent,
  },
  {
    path: 'Employe',
    component: EmployeComponent,
  },
  {
    path: 'Fournisseur',
    component: FournisseurComponent,
  },
  {
    path: 'Commercial',
    component: CommercialComponent,
  },
  {
    path: 'Produit',
    component: ProduitComponent,
  },
  {
    path: 'Famille',
    component: FamilleComponent,
  },
  {
    path: 'Devis',
    component: DevisComponent,
  },
  {
    path: 'Commande',
    component: CommandeComponent,
  },
  {
    path: 'Livraison',
    component: LivraisonComponent,
  },
  {
    path: 'Facturation',
    component: FacturationComponent,
  },
  {
    path: 'Reglement',
    component: ReglementComponent,
  },
  {
    path: 'Retour',
    component: RetourComponent,
  },
  {
    path: 'Avoir',
    component: AvoirComponent,
  },
  {
    path: 'Caisse',
    component: CaisseComponent,
  },
  {
    path: 'Caisse-Recettes',
    component: CaisseRecettesComponent,
  },
  {
    path: 'Caisse-Depenses',
    component: CaisseDepensesComponent,
  },
  {
    path: 'Bon-Commande',
    component: BonCommandeComponent,
  },
  {
    path: 'Users',
    component: UsersComponent,
  },
  {
    path: 'User-Permissions',
    component: UserPermissionsComponent,
  },
  {
    path: 'Listes',
    component: ListesComponent,
  },
  {
    path: 'Edit-Client/:part_id',
    component: EditClientComponent,
  },
  {
    path: 'Edit-Fournisseur/:part_id',
    component: EditFournisseurComponent,
  },
   {
    path: 'Edit-Produit/:article_id',
    component: EditProduitComponent,
  },
  {
    path: 'Edit-Devis/:document_id',
    component: EditDevisComponent,
  },
  {
    path: 'Edit-Commande/:document_id',
    component: EditcommandeComponent,
  },
  {
    path: 'Edit-Livraison/:document_id',
    component: EditlivraisonComponent,
  },
  {
    path: 'Edit-Reglement/:id',
    component: EditReglementComponent,
  },
  {
    path: 'Edit-Retour/:document_id',
    component: EditRetourComponent,
  },
  {
    path: 'Edit-Bon-Commande-Achat/:document_id',
    component: EditBonCommandeComponent,
  },
  {
    path: 'generation/cheques',
    component: ChequeListComponent,
  },
  {
    path: 'generation/cheque-editor',
    component: ChequeEditorComponent,
  },
  {
    path: 'generation/cheque-preview',
    component: ChequePreviewComponent,
  },
  {
    path: 'generation/calibration',
    component: CalibrationComponent,
  },
  {
    path: 'generation/pdf-print',
    component: PdfPrintComponent,
  },

  {
    path: '', redirectTo: '/Dashbord', pathMatch: 'full'
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }

