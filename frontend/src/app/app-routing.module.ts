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
import { EditProduitArticleComponent } from './base/edit/edit-produit-article/edit-produit-article.component';
import { VehiculeComponent } from './base/vehicule/vehicule.component';
import { EditVehiculeComponent } from './base/edit/edit-vehicule/edit-vehicule.component';
import { DevisComponent } from './vente/devis/devis.component';
import { EditDevisComponent } from './vente/edit/edit-devis/edit-devis.component';
import { EditcommandeComponent } from './vente/edit/editcommande/editcommande.component';
import { CommandeComponent } from './vente/commande/commande.component';
import { LivraisonComponent } from './vente/livraison/livraison.component';
import { EditlivraisonComponent } from './vente/edit/editlivraison/editlivraison.component';
import { EditContratComponent } from './vente/edit/edit-contrat/edit-contrat.component';
import { FacturationComponent } from './vente/facturation/facturation.component';
import { ReglementComponent } from './vente/reglement/reglement.component';
import { EditReglementComponent } from './vente/edit/edit-reglement/edit-reglement.component';
import { RetourComponent } from './vente/retour/retour.component';
import { EditRetourComponent } from './vente/edit/edit-retour/edit-retour.component';
import { AvoirComponent } from './vente/avoir/avoir.component';
import { ContratComponent } from './vente/contrat/contrat.component';
import { LoginComponent } from './auth/login/login.component';
import { UsersComponent } from './users/users.component';
import { UserPermissionsComponent } from './users/user-permissions/user-permissions.component';
import { ListesComponent } from './security/listes/listes.component';
import { CaisseComponent } from './vente/caisse/caisse.component';
import { CaisseRecettesComponent } from './vente/caisse/caisse-recettes.component';
import { CaisseDepensesComponent } from './vente/caisse/caisse-depenses.component';
import { BonCommandeComponent } from './achat/bon-commande/bon-commande.component';
import { EditBonCommandeComponent } from './achat/edit/edit-bon-commande/edit-bon-commande.component';
import { NotificationComponent } from './notification/notification.component';
import { FactureFournisseurComponent } from './achat/facture-fournisseur/facture-fournisseur.component';

// Import des composants Stock
import { StockEntreeComponent } from './stock/stock-entree/stock-entree.component';
import { StockSortieComponent } from './stock/stock-sortie/stock-sortie.component';
import { StockInventaireComponent } from './stock/stock-inventaire/stock-inventaire.component';
import { StockHistoriqueComponent } from './stock/stock-historique/stock-historique.component';
import { StockReportingComponent } from './stock/stock-reporting/stock-reporting.component';
import { InterventionListComponent } from './interventions/intervention-list.component';
import { InterventionFormComponent } from './interventions/intervention-form/intervention-form.component';
import { VilleComponent } from './base/ville/ville.component';
import { BanqueComponent } from './base/banque/banque.component';
import { BeneficiaireComponent } from './base/beneficiaire/beneficiaire.component';
import { DepartementComponent } from './base/departement/departement.component';
import { CompteurComponent } from './base/compteur/compteur.component';
import { UniteComponent } from './base/unite/unite.component';

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
    path: 'Vehicule',
    component: VehiculeComponent,
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
    path: 'Contrat',
    component: ContratComponent,
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
    path: 'Facture-Fournisseur',
    component: FactureFournisseurComponent,
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
    path: 'Notifications',
    component: NotificationComponent,
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
    path: 'Edit-Vehicule/:vehicule_id',
    component: EditVehiculeComponent,
  },
  {
    path: 'Edit-Produit/:article_id',
    component: EditProduitArticleComponent,
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
    path: 'Edit-Contrat/:id',
    component: EditContratComponent,
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
    path: 'generation',
    loadChildren: () => import('./generation/generation.module').then(m => m.GenerationModule)
  },
  {
    path: 'Stock/Entree',
    component: StockEntreeComponent
  },
  {
    path: 'Stock/Sortie',
    component: StockSortieComponent
  },
  {
    path: 'Stock/Inventaire',
    component: StockInventaireComponent
  },
  {
    path: 'Stock/Historique',
    component: StockHistoriqueComponent
  },
  {
    path: 'Stock/Reporting',
    component: StockReportingComponent
  },
  {
    path: 'Interventions',
    component: InterventionListComponent
  },
  {
    path: 'Interventions/Nouvelle',
    component: InterventionFormComponent
  },
  {
    path: 'Ville',
    component: VilleComponent
  },
  {
    path: 'Banque',
    component: BanqueComponent
  },
  {
    path: 'Beneficiaire',
    component: BeneficiaireComponent
  },
  {
    path: 'Departement',
    component: DepartementComponent
  },
  {
    path: 'Unite',
    component: UniteComponent
  },
  {
    path: 'Compteur',
    component: CompteurComponent
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

