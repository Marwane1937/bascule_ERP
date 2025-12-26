import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ChequePreviewComponent } from './cheque-preview.component';

describe('ChequePreviewComponent', () => {
  let component: ChequePreviewComponent;
  let fixture: ComponentFixture<ChequePreviewComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [ChequePreviewComponent]
    });
    fixture = TestBed.createComponent(ChequePreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
