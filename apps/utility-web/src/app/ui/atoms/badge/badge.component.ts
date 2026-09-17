import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-badge',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './badge.component.html',
  host: {
    class: 'inline-flex items-center gap-1 px-2 pt-[3px] pb-[1px] rounded-sm text-xs font-bold border tracking-[0.04em]',
    '[class.font-mono]': 'mono()',
    '[class.bg-paper-fresh]': "surface() === 'paper' && variant() === 'neutral'",
    '[class.border-paper-deckle]': "surface() === 'paper' && variant() === 'neutral'",
    '[class.text-ink]': "surface() === 'paper' && (variant() === 'neutral' || variant() === 'pink' || variant() === 'mint' || variant() === 'gold')",
    '[class.bg-riso-pink]': "surface() === 'paper' && variant() === 'pink'",
    '[class.bg-riso-mint]': "surface() === 'paper' && variant() === 'mint'",
    '[class.bg-riso-gold]': "surface() === 'paper' && variant() === 'gold'",
    '[class.bg-riso-blue]': "surface() === 'paper' && variant() === 'blue'",
    '[class.bg-riso-red]': "surface() === 'paper' && variant() === 'red'",
    '[class.text-paper-fresh]': "surface() === 'paper' && (variant() === 'blue' || variant() === 'red')",
    '[class.border-transparent]': "surface() === 'paper' && variant() !== 'neutral'",
    '[class.bg-press-elevated]': "surface() === 'press' && variant() === 'neutral'",
    '[class.border-press-line]': "surface() === 'press' && variant() === 'neutral'",
    '[class.text-press-text-muted]': "surface() === 'press' && variant() === 'neutral'",
    '[class.bg-riso-pink-pooled]': "surface() === 'press' && variant() === 'pink'",
    '[class.border-riso-pink]': "surface() === 'press' && variant() === 'pink'",
    '[class.text-press-text]': "surface() === 'press' && variant() === 'pink'",
    '[class.border-riso-blue]': "surface() === 'press' && variant() === 'blue'",
    '[class.text-riso-blue]': "surface() === 'press' && variant() === 'blue'",
    '[class.border-riso-mint]': "surface() === 'press' && variant() === 'mint'",
    '[class.text-riso-mint]': "surface() === 'press' && variant() === 'mint'",
    '[class.border-riso-gold]': "surface() === 'press' && variant() === 'gold'",
    '[class.text-riso-gold]': "surface() === 'press' && variant() === 'gold'",
    '[class.border-riso-red]': "surface() === 'press' && variant() === 'red'",
    '[class.text-riso-red]': "surface() === 'press' && variant() === 'red'",
    '[class.bg-transparent]': "surface() === 'press' && variant() !== 'neutral'",
  },
})
export class BadgeComponent {
  variant = input<'neutral' | 'pink' | 'blue' | 'mint' | 'gold' | 'red'>('neutral');
  /** paper: a stamped ledger tag on a working surface. press: a chrome tag on the dark canvas. */
  surface = input<'paper' | 'press'>('paper');
  mono = input<boolean>(true);
}
