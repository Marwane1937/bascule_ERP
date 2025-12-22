import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { GenerationRoutingModule } from './generation-routing.module';
import { ChequeListComponent } from './cheque-list/cheque-list.component';
import { ChequeEditorComponent } from './cheque-editor/cheque-editor.component';
import { ChequePreviewComponent } from './cheque-preview/cheque-preview.component';
import { CalibrationComponent } from './calibration/calibration.component';
import { PdfPrintComponent } from './pdf-print/pdf-print.component';

@NgModule({
  declarations: [
    ChequeListComponent,
    ChequeEditorComponent,
    ChequePreviewComponent,
    CalibrationComponent,
    PdfPrintComponent
  ],
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    GenerationRoutingModule
  ]
})
export class GenerationModule { }
