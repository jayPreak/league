// Champion behaviour, registered by lowercased champion id. Numbers come from src/champions.
import type { KApi, Kit } from './types';

export let K: KApi;
export const setKitApi = (api: KApi) => {
  K = api;
};
export const KITS: Record<string, Kit> = {};
export const register = (id: string, kit: Kit) => {
  KITS[id] = kit;
};
