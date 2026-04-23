import localforage from 'localforage';
import { InspectionData } from '../types';
import { Site } from '../data/sites';
import { db, auth } from './firebase';
import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  collection, 
  deleteDoc, 
  query, 
  orderBy,
  where,
  serverTimestamp
} from 'firebase/firestore';

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

// CLOUD STORAGE (Firestore)
export async function saveInspection(data: InspectionData) {
  const user = auth.currentUser;
  if (!user) {
    // If not logged in, only save locally
    await inspectionStore.setItem(data.id, data);
    return;
  }

  const inspectionRef = doc(db, 'inspections', data.id);
  const payload = {
    id: data.id,
    status: data.status,
    createdAt: data.createdAt,
    submittedAt: data.submittedAt || null,
    workOrderNo: data.workOrderNo,
    storeNo: data.storeNo,
    technicianName: data.technicianName,
    userId: user.uid,
    data: data, // Include the full payload
    updatedAt: serverTimestamp()
  };

  await setDoc(inspectionRef, payload, { merge: true });
  await inspectionStore.setItem(data.id, data); // Local cache
}

export async function getInspection(id: string): Promise<InspectionData | null> {
  const docRef = doc(db, 'inspections', id);
  const docSnap = await getDoc(docRef);

  if (docSnap.exists()) {
    const cloudData = docSnap.data().data as InspectionData;
    await inspectionStore.setItem(id, cloudData); // Refresh cache
    return cloudData;
  }

  return await inspectionStore.getItem(id);
}

export async function getAllInspections(): Promise<InspectionData[]> {
  const user = auth.currentUser;
  if (!user) {
    const inspections: InspectionData[] = [];
    await inspectionStore.iterate((value: InspectionData) => {
      inspections.push(value);
    });
    return inspections.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  try {
    const adminEmails = [
      'crcjehaas@gmail.com', 
      'charles_haas@outlook.com', 
      'ruth_haas@outlook.com', 
      'ruth.haas@sepmfix.com', 
      'andy.phipps@sepmfix.com'
    ];
    const userEmail = user.email?.toLowerCase() || '';
    const isAdmin = adminEmails.includes(userEmail) || userEmail.endsWith('@sepmfix.com');

    let q;
    if (isAdmin) {
      q = query(collection(db, 'inspections'), orderBy('createdAt', 'desc'));
    } else {
      q = query(collection(db, 'inspections'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
    }

    const querySnapshot = await getDocs(q);
    const inspections: InspectionData[] = [];
    
    querySnapshot.forEach((doc) => {
      const item = doc.data().data as InspectionData;
      inspections.push(item);
      inspectionStore.setItem(item.id, item); // Sync to local
    });

    return inspections;
  } catch (error) {
    console.error("Error fetching cloud inspections:", error);
    // Fallback to local
    const inspections: InspectionData[] = [];
    await inspectionStore.iterate((value: InspectionData) => {
      inspections.push(value);
    });
    return inspections.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export async function deleteInspection(id: string) {
  const user = auth.currentUser;
  if (user) {
    await deleteDoc(doc(db, 'inspections', id));
  }
  await inspectionStore.removeItem(id);
}

// SHARED SETTINGS (Firestore)
async function getCloudSetting(key: string): Promise<string | null> {
  try {
    const docSnap = await getDoc(doc(db, 'settings', key));
    return docSnap.exists() ? docSnap.data().value : null;
  } catch { return null; }
}

async function saveCloudSetting(key: string, value: string) {
  if (!auth.currentUser) return;
  try {
    await setDoc(doc(db, 'settings', key), { value, updatedAt: serverTimestamp() });
  } catch (err) { console.error("Cloud setting save failed", err); }
}

// SITES (Remains Local for speed/offline)
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

// SETTINGS WRAPPERS
export async function saveSmartsheetUrl(url: string) {
  await saveCloudSetting('smartsheet_url', url);
  await settingsStore.setItem('smartsheet_url', url);
}

export async function getSmartsheetUrl(): Promise<string> {
  const cloud = await getCloudSetting('smartsheet_url');
  if (cloud) return cloud;
  return await settingsStore.getItem('smartsheet_url') || '';
}

export async function saveDestinationUrl(url: string) {
  await saveCloudSetting('destination_url', url);
  await settingsStore.setItem('destination_url', url);
}

export async function getDestinationUrl(): Promise<string> {
  const cloud = await getCloudSetting('destination_url');
  if (cloud) return cloud;
  return await settingsStore.getItem('destination_url') || '/SEPM Lyft/Inspection Reports';
}

export async function saveDropboxToken(token: string) {
  await saveCloudSetting('dropbox_token', token);
  await settingsStore.setItem('dropbox_token', token);
}

export async function getDropboxToken(): Promise<string> {
  const cloud = await getCloudSetting('dropbox_token');
  if (cloud) return cloud;

  const token = await settingsStore.getItem<string>('dropbox_token');
  if (token) return token;
  return (import.meta.env.VITE_DROPBOX_ACCESS_TOKEN as string) || '';
}

export async function saveEmailRecipients(recipients: string) {
  await saveCloudSetting('email_recipients', recipients);
  await settingsStore.setItem('email_recipients', recipients);
}

export async function getEmailRecipients(): Promise<string> {
  const cloud = await getCloudSetting('email_recipients');
  if (cloud) return cloud;
  return await settingsStore.getItem('email_recipients') || 'Ruth.Haas@sepmfix.com';
}

export async function getAuthorizedUsers(): Promise<string[]> {
  try {
    const querySnapshot = await getDocs(collection(db, 'authorized_users'));
    const users: string[] = [];
    querySnapshot.forEach((doc) => {
      users.push(doc.id); // The ID is the email
    });
    return users;
  } catch (error) {
    console.error("Failed to fetch authorized users:", error);
    return [];
  }
}

export async function addAuthorizedUser(email: string) {
  const emailId = email.toLowerCase().trim();
  await setDoc(doc(db, 'authorized_users', emailId), { 
    addedAt: serverTimestamp(),
    addedBy: auth.currentUser?.email 
  });
}

// Function to handle programmatic user creation would usually be done via Firebase Admin SDK
// However, since we are client-side, we can only create the currently logged in user.
// The best approach here is for the admin to use the Firebase Console for password management,
// OR for the technician to "Sign Up" if we allow it.
// For now, we will stick to the Allowlist + Password Reset flow.

export async function removeAuthorizedUser(email: string) {
  await deleteDoc(doc(db, 'authorized_users', email));
}
