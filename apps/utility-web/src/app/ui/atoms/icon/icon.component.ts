import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type IconName =
  | 'bolt'
  | 'image'
  | 'upload'
  | 'download'
  | 'document'
  | 'clock'
  | 'play'
  | 'check'
  | 'link'
  | 'unlink'
  | 'grip'
  | 'close'
  | 'chevron';

@Component({
  selector: 'app-icon',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './icon.component.html',
})
export class IconComponent {
  name = input<IconName>('image');
  className = input<string>('w-4 h-4');
}
