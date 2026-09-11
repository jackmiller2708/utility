/**
 * Conversion traits for adapting a parsed DTO (protocol schema output) into
 * a domain model, and back. Mirrors Rust's `From<T>` / `Into<T>`.
 *
 * A DTO decoded off the wire (protocol layer) must never be operated on
 * directly by domain logic. It is first adapted into the corresponding
 * domain model via a `From<Source, Target>` adaptor defined alongside that
 * domain model.
 */

/**
 * Implemented by an adaptor that builds a `Target` domain model from a
 * `Source` DTO. The mapping is assumed infallible: `Source` has already
 * been validated (e.g. by an Effect Schema decode) before it reaches here.
 */
export interface From<Source, Target> {
  from(source: Source): Target;
}

/**
 * Implemented by a domain model (or value) that can convert itself into a
 * `Target` shape, e.g. back into a transport DTO.
 */
export interface Into<Target> {
  into(): Target;
}
