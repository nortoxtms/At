import AsyncStorage from '@react-native-async-storage/async-storage';

import { setDemoHandler } from '@/lib/api';
import { demoRequest } from '@/lib/demo-api';
import { clear, getState, persist, reset, restore } from '@/lib/demo-store';

/**
 * Turning demo mode on and off.
 *
 * The flag is persisted separately from the data, so relaunching the app puts
 * you back where you were. A demo you have to re-enter on every launch is one
 * you stop using halfway through showing it to someone.
 */
const FLAG = 'only-horses.demo.on';

export async function enableDemo(): Promise<void> {
  await restore();
  getState();
  await persist();
  await AsyncStorage.setItem(FLAG, '1').catch(() => {});
  setDemoHandler(demoRequest);
}

export async function disableDemo(): Promise<void> {
  setDemoHandler(null);
  await AsyncStorage.removeItem(FLAG).catch(() => {});
  await clear();
}

export async function resetDemo(): Promise<void> {
  await reset();
}

/** Called once at launch, before the first screen asks for anything. */
export async function restoreDemo(): Promise<boolean> {
  const on = await AsyncStorage.getItem(FLAG).catch(() => null);
  if (on !== '1') return false;

  await restore();
  setDemoHandler(demoRequest);
  return true;
}

export { isDemo } from '@/lib/api';
