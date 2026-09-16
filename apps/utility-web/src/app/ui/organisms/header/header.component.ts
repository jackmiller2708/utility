import { Component, input, output, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DeviceTrustService } from '@app/core';
import { BrandMarkComponent } from '@app/ui/atoms/brand-mark/brand-mark.component';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, BrandMarkComponent],
  templateUrl: './header.component.html',
  host: {
    class: 'flex-none bg-press-elevated border-b border-press-line sticky top-0 z-50',
    role: 'banner',
  },
})
export class HeaderComponent {
  readonly deviceTrust = inject(DeviceTrustService);

  readonly activeJobCount = input<number>(0);
  readonly sectionLabel = input<string>('');
  readonly jobTrayToggled = output<void>();
  readonly devicesClicked = output<void>();
}
