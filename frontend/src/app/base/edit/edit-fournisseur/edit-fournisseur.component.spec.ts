import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditFournisseurComponent } from './edit-fournisseur.component';

describe('EditFournisseurComponent', () => {
  let component: EditFournisseurComponent;
  let fixture: ComponentFixture<EditFournisseurComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [EditFournisseurComponent]
    });
    fixture = TestBed.createComponent(EditFournisseurComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
