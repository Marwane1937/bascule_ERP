import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ChequeListComponent } from './cheque-list/cheque-list.component';
import { ChequeEditorComponent } from './cheque-editor/cheque-editor.component';
import { ChequePreviewComponent } from './cheque-preview/cheque-preview.component';
import { CalibrationComponent } from './calibration/calibration.component';
import { PdfPrintComponent } from './pdf-print/pdf-print.component';

const routes: Routes = [
  { path: '', component: ChequeListComponent },
  { path: 'edit/:id', component: ChequeEditorComponent },
  { path: 'preview/:id', component: ChequePreviewComponent },
  { path: 'calibration/:id', component: CalibrationComponent },
  { path: 'print/:id', component: PdfPrintComponent }
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class GenerationRoutingModule { }
