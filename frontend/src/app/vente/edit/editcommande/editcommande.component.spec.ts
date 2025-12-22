import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditcommandeComponent } from './editcommande.component';

describe('EditcommandeComponent', () => {
  let component: EditcommandeComponent;
  let fixture: ComponentFixture<EditcommandeComponent>;

  beforeEach(() => {
    TestBed.configureTestingModule({
      declarations: [EditcommandeComponent]
    });
    fixture = TestBed.createComponent(EditcommandeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
