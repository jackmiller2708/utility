import type { ToolParameterModel } from '@app/domain';

import { Component, input, model, computed } from '@angular/core';
import { SelectComponent, SelectOption } from '@app/ui/atoms/select/select.component';
import { TileGroupComponent, TileItem } from '@app/ui/molecules/tile-group/tile-group.component';
import { ToggleComponent } from '@app/ui/atoms/toggle/toggle.component';
import { InputComponent } from '@app/ui/atoms/input/input.component';
import { CommonModule } from '@angular/common';

/** Above this many options, a tile row would wrap awkwardly — fall back to a native select. */
const MAX_TILE_OPTIONS = 6;

/**
 * Renders any operation's non-file parameters from its own declared `ToolParameter[]` —
 * the backend metadata every operation has carried since M3 (label, type, required,
 * defaultValue, options, min/max). Maps `type` to the same atoms the hand-built tool forms
 * already use: string/number → Input, boolean → Toggle, select → TileGroup (the app's
 * established "pick one of a few" pattern — SelectComponent exists only as the overflow
 * case for an option set too large for a tile row).
 *
 * This does not replace image-resize/pdf-workbench/merge-split's own hand-built forms —
 * those carry bespoke logic (aspect-ratio locking, page-range nudging, cost estimates) no
 * generic renderer can reproduce without losing it. It exists for surfaces that need "the
 * operation's settings" as a plain group with no bespoke behavior of their own — batch
 * mode's one shared settings panel applied to every file is the first of these.
 */
@Component({
  selector: 'app-operation-form',
  standalone: true,
  imports: [CommonModule, InputComponent, ToggleComponent, SelectComponent, TileGroupComponent],
  templateUrl: './operation-form.component.html',
  host: { class: 'flex flex-col gap-5 min-w-0' },
})
export class OperationFormComponent {
  readonly parameters = input<readonly ToolParameterModel[]>([]);
  /** Two-way: seed with defaults via `[values]`, or bind `[(values)]` to read every change back. */
  readonly values = model<Readonly<Record<string, unknown>>>({});

  readonly fields = computed(() => this.parameters().filter((param) => param.type !== 'file'));

  fieldValue(param: ToolParameterModel): unknown {
    const current = this.values()[param.name];
    return current !== undefined ? current : param.defaultValue;
  }

  numberValue(param: ToolParameterModel): number | null {
    const value = this.fieldValue(param);
    return typeof value === 'number' ? value : null;
  }

  stringValue(param: ToolParameterModel): string {
    const value = this.fieldValue(param);
    return value == null ? '' : String(value);
  }

  booleanValue(param: ToolParameterModel): boolean {
    return this.fieldValue(param) === true;
  }

  useTiles(param: ToolParameterModel): boolean {
    return (param.options?.length ?? 0) <= MAX_TILE_OPTIONS;
  }

  tileItems(param: ToolParameterModel): readonly TileItem[] {
    return (param.options ?? []).map((option) => ({ id: option, label: (param.optionLabels?.[option] ?? option).toUpperCase() }));
  }

  selectOptions(param: ToolParameterModel): readonly SelectOption[] {
    return (param.options ?? []).map((option) => ({ value: option, label: param.optionLabels?.[option] ?? option }));
  }

  isSlider(param: ToolParameterModel): boolean {
    return param.type === 'number' && param.inputStyle === 'slider';
  }

  sliderValue(param: ToolParameterModel): number {
    return this.numberValue(param) ?? (typeof param.defaultValue === 'number' ? param.defaultValue : (param.min ?? 0));
  }

  onSliderInput(param: ToolParameterModel, event: Event): void {
    this.setValue(param.name, Number((event.target as HTMLInputElement).value));
  }

  setValue(name: string, value: unknown): void {
    this.values.update((current) => ({ ...current, [name]: value }));
  }
}
