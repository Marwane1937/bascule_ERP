import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import { DragDropModule } from '@angular/cdk/drag-drop';
import {HttpClientModule, HTTP_INTERCEPTORS} from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DashbordComponent } from './dashbord/dashbord.component';
import { ClientComponent } from './base/client/client.component';
import { EmployeComponent } from './base/employe/employe.component';
import { FournisseurComponent } from './base/fournisseur/fournisseur.component';
import { CommercialComponent } from './base/commercial/commercial.component';
import { ProduitComponent } from './base/produit/produit.component';
import { WarehouseComponent } from './base/warehouse/warehouse.component';
import { FamilleComponent } from './base/famille/famille.component';
import { HeaderComponent } from './header/header.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { EditClientComponent } from './base/edit/edit-client/edit-client.component';
import { UppercaseDirective } from './uppercase.directive';
import { EditFournisseurComponent } from './base/edit/edit-fournisseur/edit-fournisseur.component';
import { EditProduitComponent } from './base/edit/edit-produit/edit-produit.component';
import { EditProduitArticleComponent } from './base/edit/edit-produit-article/edit-produit-article.component';
import { EditWarehouseComponent } from './base/edit/edit-warehouse/edit-warehouse.component';
import { VehiculeComponent } from './base/vehicule/vehicule.component';
import { EditVehiculeComponent } from './base/edit/edit-vehicule/edit-vehicule.component';
import { DevisComponent } from './vente/devis/devis.component';
import { AssistantComponent } from './assistant/assistant.component';
import { EditDevisComponent } from './vente/edit/edit-devis/edit-devis.component';
import { QuillModule } from 'ngx-quill';
import { CommandeComponent } from './vente/commande/commande.component';
import { LoginComponent } from './auth/login/login.component';
import { SocieteManagementComponent } from './admin/societe-management/societe-management.component';
import { DatabaseSelectorComponent } from './shared/database-selector/database-selector.component';
import { AuthInterceptor } from './interceptors/auth.interceptor';
import { UsersComponent } from './users/users.component';
import { UserPermissionsComponent } from './users/user-permissions/user-permissions.component';
import { ListesComponent } from './security/listes/listes.component';
import { UserService } from './service/user.service';
import { ListesService } from './service/listes.service';
import { UserPermissionsService } from './service/user-permissions.service';
import { PermissionsService } from './service/permissions.service';
import { AuthService } from './service/auth.service';
import { EditcommandeComponent } from './vente/edit/editcommande/editcommande.component';
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
import { CaisseComponent } from './vente/caisse/caisse.component';
import { CaisseRecettesComponent } from './vente/caisse/caisse-recettes.component';
import { CaisseDepensesComponent } from './vente/caisse/caisse-depenses.component';
import { CaisseRecetteDepenseComponent } from './vente/caisse/caisse-recette-depense.component';
import { EditCaisseRecetteDepenseComponent } from './vente/edit/edit-caisse-recette-depense/edit-caisse-recette-depense.component';
import { BonCommandeComponent } from './achat/bon-commande/bon-commande.component';
import { EditBonCommandeComponent } from './achat/edit/edit-bon-commande/edit-bon-commande.component';
import { DemandeAchatComponent } from './achat/demande-achat/demande-achat.component';
import { EditDemandeAchatComponent } from './achat/edit/edit-demande-achat/edit-demande-achat.component';
import { NotificationComponent } from './notification/notification.component';
import { FactureFournisseurComponent } from './achat/facture-fournisseur/facture-fournisseur.component';
import { ReceptionComponent } from './achat/reception/reception.component';
import { EditReceptionComponent } from './achat/edit/edit-reception/edit-reception.component';
import { EditFactureFournisseurComponent } from './achat/edit/edit-facture-fournisseur/edit-facture-fournisseur.component';
import { AchatReportingComponent } from './achat/achat-reporting/achat-reporting.component';

// Import des composants Stock
import { StockEntreeComponent } from './stock/stock-entree/stock-entree.component';
import { StockSortieComponent } from './stock/stock-sortie/stock-sortie.component';
import { StockInventaireComponent } from './stock/stock-inventaire/stock-inventaire.component';
import { StockHistoriqueComponent } from './stock/stock-historique/stock-historique.component';
import { StockReportingComponent } from './stock/stock-reporting/stock-reporting.component';
import { StockPreparationComponent } from './stock/stock-preparation/stock-preparation.component';
import { StockEntrepotComponent } from './stock/stock-entrepot/stock-entrepot.component';
import { VenteReportingComponent } from './vente/vente-reporting/vente-reporting.component';
import { FinanceReportingComponent } from './finance/finance-reporting/finance-reporting.component';
import { BordereauRemiseComponent } from './finance/bordereau-remise/bordereau-remise.component';
import { EditBordereauRemiseComponent } from './finance/edit/edit-bordereau-remise/edit-bordereau-remise.component';
import { EditEntreeStockComponent } from './stock/edit-entree-stock/edit-entree-stock.component';
import { EditSortieStockComponent } from './stock/edit-sortie-stock/edit-sortie-stock.component';
import { EditInventaireComponent } from './stock/edit-inventaire/edit-inventaire.component';
import { EditPreparationComponent } from './stock/edit-preparation/edit-preparation.component';

// Import des composants Interventions
import { InterventionListComponent } from './interventions/intervention-list.component';
import { InterventionFormComponent } from './interventions/intervention-form/intervention-form.component';

// Import des nouveaux composants Base
import { VilleComponent } from './base/ville/ville.component';
import { BanqueComponent } from './base/banque/banque.component';
import { BeneficiaireComponent } from './base/beneficiaire/beneficiaire.component';
import { DepartementComponent } from './base/departement/departement.component';
import { UniteComponent } from './base/unite/unite.component';
import { CompteurComponent } from './base/compteur/compteur.component';
import { TranslatePipe } from './pipes/translate.pipe';
import { ProfileComponent } from './security/profile/profile.component';

@NgModule({
  declarations: [
    UppercaseDirective,
    AppComponent,
    DashbordComponent,
    ClientComponent,
    EmployeComponent,
    FournisseurComponent,
    CommercialComponent,
    ProduitComponent,
    WarehouseComponent,
    FamilleComponent,
    HeaderComponent,
    EditClientComponent,
    UppercaseDirective,
    EditFournisseurComponent,
    EditProduitComponent,
    EditProduitArticleComponent,
    EditWarehouseComponent,
    VehiculeComponent,
    EditVehiculeComponent,
    DevisComponent,
    AssistantComponent,
    EditDevisComponent,
    CommandeComponent,
    LoginComponent,
    SocieteManagementComponent,
    DatabaseSelectorComponent,
    UsersComponent,
    UserPermissionsComponent,
    ListesComponent,
    EditcommandeComponent,
    LivraisonComponent,
    EditlivraisonComponent,
    EditContratComponent,
    FacturationComponent,
    ReglementComponent,
    EditReglementComponent,
    RetourComponent,
    EditRetourComponent,
    AvoirComponent,
    ContratComponent,
    CaisseComponent,
    CaisseRecettesComponent,
    CaisseDepensesComponent,
    CaisseRecetteDepenseComponent,
    EditCaisseRecetteDepenseComponent,
    BonCommandeComponent,
    EditBonCommandeComponent,
    DemandeAchatComponent,
    EditDemandeAchatComponent,
    NotificationComponent,
    FactureFournisseurComponent,
    ReceptionComponent,
    EditReceptionComponent,
    EditFactureFournisseurComponent,
    AchatReportingComponent,
    // Composants Stock
    StockEntreeComponent,
    StockSortieComponent,
    StockInventaireComponent,
    StockHistoriqueComponent,
    StockReportingComponent,
    StockPreparationComponent,
    StockEntrepotComponent,
    VenteReportingComponent,
    FinanceReportingComponent,
    BordereauRemiseComponent,
    EditBordereauRemiseComponent,
    EditEntreeStockComponent,
    EditSortieStockComponent,
    EditInventaireComponent,
    EditPreparationComponent,
    InterventionListComponent,
    InterventionFormComponent,
    VilleComponent,
    BanqueComponent,
    BeneficiaireComponent,
    DepartementComponent,
    UniteComponent,
    CompteurComponent,
    TranslatePipe,
    ProfileComponent,
  ],
  imports: [
    BrowserModule,
    CommonModule,
    QuillModule.forRoot({
      modules: {
        toolbar: {
          container: [
            ['bold', 'italic', 'underline', 'strike'],       
            [{ 'header': 1 }, { 'header': 2 }],              
            [{ 'list': 'ordered' }, { 'list': 'bullet' }],  
            [{ 'indent': '-1' }, { 'indent': '+1' }],        
            [{ 'size': ['small', false, 'large', 'huge'] }],
            [{ 'color': [] }, { 'background': [] }],         
            [{ 'font': [] }],
            ['link', 'image'],
            ['clean'],
            ['customProductDropdown'] // bouton personnalisé
          ],
        },
      },
    }),
    FormsModule,
    ReactiveFormsModule,
    DragDropModule,
    HttpClientModule,
    AppRoutingModule,
  ],
  providers: [
    {
      provide: HTTP_INTERCEPTORS,
      useClass: AuthInterceptor,
      multi: true
    },
    UserService,
    UserPermissionsService,
    ListesService,
    AuthService,
    PermissionsService
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
