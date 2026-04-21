import localforage from 'localforage';
import { InspectionData } from '../types';
import { Site } from '../data/sites';

const inspectionStore = localforage.createInstance({
  name: 'sepm-lyfit',
  storeName: 'inspections'
});

const siteStore = localforage.createInstance({
  name: 'sepm-lyfit',
  storeName: 'sites'
});

const settingsStore = localforage.createInstance({
  name: 'sepm-lyfit',
  storeName: 'settings'
});

export async function saveInspection(data: InspectionData) {
  await inspectionStore.setItem(data.id, data);
}

export async function getInspection(id: string): Promise<InspectionData | null> {
  return await inspectionStore.getItem(id);
}

export async function getAllInspections(): Promise<InspectionData[]> {
  const inspections: InspectionData[] = [];
  await inspectionStore.iterate((value: InspectionData) => {
    inspections.push(value);
  });
  return inspections.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function deleteInspection(id: string) {
  await inspectionStore.removeItem(id);
}

export async function saveSites(sites: Site[], metadata: { fileName: string; count: number; date: string }) {
  await siteStore.setItem('master_list', sites);
  await siteStore.setItem('manifest_metadata', metadata);
}

export async function getSiteMetadata(): Promise<{ fileName: string; count: number; date: string } | null> {
  return await siteStore.getItem('manifest_metadata');
}

export async function clearImportedSites() {
  await siteStore.removeItem('master_list');
  await siteStore.removeItem('manifest_metadata');
}

export async function getImportedSites(): Promise<Site[]> {
  return await siteStore.getItem('master_list') || [];
}

export async function saveSmartsheetUrl(url: string) {
  await settingsStore.setItem('smartsheet_url', url);
}

export async function getSmartsheetUrl(): Promise<string> {
  return await settingsStore.getItem('smartsheet_url') || '';
}

export async function saveDestinationUrl(url: string) {
  await settingsStore.setItem('destination_url', url);
}

export async function getDestinationUrl(): Promise<string> {
  return await settingsStore.getItem('destination_url') || 'https://www.dropbox.com/scl/fo/8gywiw5gwrp83taoh1gy7/AODhd3zQ_0O39u9OjcQ1ON0?rlkey=qpr3velgtb351alo7byqs8z4d&st=1dk66rgi&dl=0';
}

export async function saveDropboxToken(token: string) {
  await settingsStore.setItem('dropbox_token', token);
}

export async function getDropboxToken(): Promise<string> {
  return await settingsStore.getItem('dropbox_token') || '';
}
