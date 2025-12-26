import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

import { GenerationRoutingModule } from './generation-routing.module';
import { ChequeListComponent } from './cheque-list/cheque-list.component';
import { ChequeEditorComponent } from './cheque-editor/cheque-editor.component';
import { ChequePreviewComponent } from './cheque-preview/cheque-preview.component';
import { ChequeGenerationService } from './cheque.service';

@NgModule({
  declarations: [
    ChequeListComponent,
    ChequeEditorComponent,
    ChequePreviewComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    GenerationRoutingModule
  ],
  providers: [
    ChequeGenerationService
  ]
})
export class GenerationModule { }
