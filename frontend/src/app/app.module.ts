import { CUSTOM_ELEMENTS_SCHEMA, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { CommonModule } from '@angular/common';
import {HttpClientModule, HTTP_INTERCEPTORS} from '@angular/common/http';
import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DashbordComponent } from './dashbord/dashbord.component';
import { ClientComponent } from './base/client/client.component';
import { EmployeComponent } from './base/employe/employe.component';
import { FournisseurComponent } from './base/fournisseur/fournisseur.component';
import { CommercialComponent } from './base/commercial/commercial.component';
import { ProduitComponent } from './base/produit/produit.component';
import { FamilleComponent } from './base/famille/famille.component';
import { HeaderComponent } from './header/header.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { EditClientComponent } from './base/edit/edit-client/edit-client.component';
import { UppercaseDirective } from './uppercase.directive';
import { EditFournisseurComponent } from './base/edit/edit-fournisseur/edit-fournisseur.component';
import { EditProduitComponent } from './base/edit/edit-produit/edit-produit.component';
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
import { FacturationComponent } from './vente/facturation/facturation.component';
import { ReglementComponent } from './vente/reglement/reglement.component';
import { EditReglementComponent } from './vente/edit/edit-reglement/edit-reglement.component';
import { RetourComponent } from './vente/retour/retour.component';
import { EditRetourComponent } from './vente/edit/edit-retour/edit-retour.component';
import { AvoirComponent } from './vente/avoir/avoir.component';
import { CaisseComponent } from './vente/caisse/caisse.component';
import { CaisseRecettesComponent } from './vente/caisse/caisse-recettes.component';
import { CaisseDepensesComponent } from './vente/caisse/caisse-depenses.component';
import { BonCommandeComponent } from './achat/bon-commande/bon-commande.component';
import { EditBonCommandeComponent } from './achat/edit/edit-bon-commande/edit-bon-commande.component';
import { NotificationComponent } from './notification/notification.component';

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
    FamilleComponent,
    HeaderComponent,
    EditClientComponent,
    UppercaseDirective,
    EditFournisseurComponent,
    EditProduitComponent,
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
    FacturationComponent,
    ReglementComponent,
    EditReglementComponent,
    RetourComponent,
    EditRetourComponent,
    AvoirComponent,
    CaisseComponent,
    CaisseRecettesComponent,
    CaisseDepensesComponent,
    BonCommandeComponent,
    EditBonCommandeComponent,
    NotificationComponent,
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
