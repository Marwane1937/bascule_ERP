import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { EditProduitArticleComponent } from './edit-produit-article.component';

describe('EditProduitArticleComponent', () => {
  let component: EditProduitArticleComponent;
  let fixture: ComponentFixture<EditProduitArticleComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FormsModule, HttpClientTestingModule],
      declarations: [EditProduitArticleComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EditProduitArticleComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});





















