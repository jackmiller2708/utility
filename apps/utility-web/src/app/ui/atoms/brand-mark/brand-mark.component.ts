import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

// Geometry ported from the Design project's "Brand Marks" canvas — a filled square inside an
// open one, on a fixed 32-unit grid. Keep in sync with that canvas if the mark ever changes.
const OUTER_INSET = 2.25;
const OUTER_SPAN = 32 - OUTER_INSET * 2;
const STROKE_WEIGHT = 3;
const INNER_GAP = STROKE_WEIGHT / 2 + 1.25;
const INNER_SPAN = (OUTER_SPAN - INNER_GAP) * 0.55;
const INNER_XY = OUTER_INSET + INNER_GAP;

@Component({
  selector: 'app-brand-mark',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './brand-mark.component.html',
})
export class BrandMarkComponent {
  readonly size = input<number>(24);
  readonly variant = input<'default' | 'reversed'>('default');

  readonly outerInset = OUTER_INSET;
  readonly outerSpan = OUTER_SPAN;
  readonly strokeWeight = STROKE_WEIGHT;
  readonly innerSpan = INNER_SPAN;
  readonly innerXY = INNER_XY;
}
