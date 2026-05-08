import { ChangeDetectorRef, OnDestroy, Pipe, PipeTransform } from '@angular/core';
import { Subscription } from 'rxjs';
import { LanguageService } from '../service/language.service';

@Pipe({
  name: 't',
  pure: false
})
export class TranslatePipe implements PipeTransform, OnDestroy {
  private languageSubscription: Subscription;

  constructor(
    private languageService: LanguageService,
    private cdr: ChangeDetectorRef
  ) {
    this.languageSubscription = this.languageService.language$.subscribe(() => {
      this.cdr.markForCheck();
    });
  }

  transform(key: string): string {
    return this.languageService.instant(key);
  }

  ngOnDestroy(): void {
    this.languageSubscription.unsubscribe();
  }
}
