import { Pipe, PipeTransform } from "@angular/core";
import { Option } from "effect";

@Pipe({ name: 'option', standalone: true })
export class OptionPipe implements PipeTransform {
  transform<T>(value: Option.Option<T>) {
		return Option.getOrNull(value);
	}
}