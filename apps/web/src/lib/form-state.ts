/**
 * What a server-action form reports back to the browser.
 *
 * The same shape `AuthState` uses, hoisted for the forms that are not auth:
 * an overall message, plus per-field messages when the validator said which
 * field. Lives in `lib/` rather than beside a route group because the client
 * components that render the errors must import it, and a component reaching
 * into a route group is the dependency pointing the wrong way — it also
 * breaks the static export outright, which removes those routes.
 */
export interface FormState {
  error?: string;
  fields?: Record<string, string>;
}
