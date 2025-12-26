import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ChequeListComponent } from './cheque-list/cheque-list.component';
import { ChequeEditorComponent } from './cheque-editor/cheque-editor.component';
import { ChequePreviewComponent } from './cheque-preview/cheque-preview.component';

const routes: Routes = [
  { path: 'list', component: ChequeListComponent },
  { path: 'editor', component: ChequeEditorComponent },
  { path: 'edit/:id', component: ChequeEditorComponent },
  { path: 'preview', component: ChequePreviewComponent },
  // Alias (ancien lien/menu)
  { path: 'apercu', component: ChequePreviewComponent },
  { path: 'cheques', component: ChequeListComponent },
  { path: '', redirectTo: 'list', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GenerationRoutingModule { }
