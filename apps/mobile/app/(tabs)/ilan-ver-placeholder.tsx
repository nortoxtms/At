import { Redirect } from 'expo-router';

/**
 * The centre [+] slot.
 *
 * `Tabs` needs a route behind every screen it renders a button for, but this
 * button opens the composer as a stack screen rather than switching tabs — the
 * layout preventDefaults the press, so this file is only reached if that fails.
 * Redirecting rather than rendering null means the failure mode is "the
 * composer opens in the wrong place" instead of "the app shows a blank tab".
 */
export default function CreateTabSlot() {
  return <Redirect href="/ilan-ver" />;
}
