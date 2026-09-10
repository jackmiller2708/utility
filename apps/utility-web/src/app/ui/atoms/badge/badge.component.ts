import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './badge.component.html',
})
export class BadgeComponent {
  variant = input<'neutral' | 'indigo' | 'cyan' | 'emerald' | 'amber' | 'crimson'>('neutral');
  mono = input<boolean>(true);
}
