import { Directive, HostListener } from '@angular/core';
import { NgControl } from '@angular/forms';

@Directive({
  selector: '[appUppercase]'
})
export class UppercaseDirective {
  constructor(private control: NgControl) {}

  @HostListener('input', ['$event'])
  onInput(event: Event): void {
    const inputElement = event.target as HTMLInputElement;
    const upperValue = inputElement.value.toUpperCase();
    this.control.control?.setValue(upperValue);
  }
}