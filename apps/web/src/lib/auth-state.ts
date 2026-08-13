/**
 * What a sign-in or sign-up attempt reports back.
 *
 * Lives here rather than beside the server actions because the form component
 * needs it too, and a component importing a type out of a route group is the
 * dependency pointing the wrong way — routes may know about components, not
 * the reverse. It also broke the static export outright: removing the
 * signed-in routes from the preview build left the component importing a file
 * that no longer existed.
 */
export interface AuthState {
  error?: string;
  /** Field-level messages, keyed by field, from §12's VALIDATION_ERROR details. */
  fields?: Record<string, string>;
}
