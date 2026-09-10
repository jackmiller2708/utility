import { Component, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export interface PresetItem {
  id: string;
  label: string;
}

@Component({
  selector: 'app-preset-buttons',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './preset-buttons.component.html',
})
export class PresetButtonsComponent {
  presets = input<readonly PresetItem[]>([]);
  activeId = input<string | null>(null);
  presetSelected = output<string>();
}
