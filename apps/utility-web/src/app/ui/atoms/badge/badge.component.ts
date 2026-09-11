import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './badge.component.html',
})
export class BadgeComponent {
  variant = input<'neutral' | 'pink' | 'blue' | 'mint' | 'gold' | 'red'>('neutral');
  /** paper: a stamped ledger tag on a working surface. press: a chrome tag on the dark canvas. */
  surface = input<'paper' | 'press'>('paper');
  mono = input<boolean>(true);
}
