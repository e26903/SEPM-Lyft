import localforage from 'localforage';
import Papa from 'papaparse';
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
      const docData = doc.data() as any;
      const item = docData.data as InspectionData;
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

export async function saveSmartsheetToken(token: string) {
  await settingsStore.setItem('smartsheet_token', token);
  await saveCloudSetting('smartsheet_token', token);
}

export async function getSmartsheetToken(): Promise<string> {
  const cloud = await getCloudSetting('smartsheet_token');
  if (cloud) return cloud;
  return await settingsStore.getItem('smartsheet_token') || '';
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

// REMOTE SYNC (BETA)
export async function syncSitesFromRemote(): Promise<{ success: boolean; count: number; error?: string }> {
  const url = await getSmartsheetUrl();
  const token = await getSmartsheetToken();
  
  if (!url) return { success: false, count: 0, error: "No remote URL configured." };

  // Detect if we should use API Synchronization
  const isSmartsheetEditUrl = url.includes('app.smartsheet.com/sheets/');
  if (isSmartsheetEditUrl && token) {
    const sheetId = url.split('/sheets/')[1]?.split('?')[0];
    if (sheetId) {
      try {
        const finalUrl = `/api/smartsheet-api-proxy?sheetId=${sheetId}&token=${encodeURIComponent(token)}`;
        console.log("Sync: Calling API Proxy", finalUrl);
        const response = await fetch(finalUrl);
        if (!response.ok) {
          console.error("Sync: API Proxy Failed", response.status, response.statusText);
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.details || `Server Error: ${response.status}`);
        }
        
        const sheetData = await response.json();
        const columns = sheetData.columns || [];
        const rows = sheetData.rows || [];

        const mapped: Site[] = rows.map((row: any) => {
          const getVal = (searchKeys: string[]) => {
            const col = columns.find((c: any) => 
              searchKeys.some(sk => c.title.trim().toLowerCase().replace(/\s+/g, ' ') === sk.toLowerCase())
            );
            if (!col) return '';
            const cell = row.cells.find((c: any) => c.columnId === col.id);
            return cell?.displayValue || cell?.value || '';
          };

          return {
            storeNo: String(getVal(['Location ID', 'Store #', 'Site ID', 'Store Number', 'Site Number', 'ID', 'Location', 'Store No', 'Store', 'Site', 'Loc', 'Station ID', 'Station #', 'Location Number']) || '').trim(),
            city: String(getVal(['City', 'Town', 'Location City', 'Municipality']) || '').trim(),
            state: String(getVal(['State', 'Province', 'ST', 'Region']) || '').trim(),
            streetAddress1: String(getVal(['Address', 'Street', 'Street Address', 'Address 1', 'Full Address', 'Location Address', 'Site Address']) || '').trim(),
            zipcode: String(getVal(['Zip', 'Zipcode', 'Postal Code', 'Zip Code', 'PC']) || '').trim()
          };
        }).filter((s: Site) => s.storeNo);

        if (mapped.length > 0) {
          await saveSites(mapped, { fileName: 'Smartsheet API', count: mapped.length, date: new Date().toISOString() });
          return { success: true, count: mapped.length };
        } else {
          return { success: false, count: 0, error: "No valid sites found in sheet via API." };
        }
      } catch (err: any) {
        console.error("Smartsheet API Sync failed:", err);
        return { success: false, count: 0, error: `API Sync Failed: ${err.message}` };
      }
    }
  }

  // Fallback to CSV / Proxy fetch
  try {
    // Call our server-side proxy to bypass CORS
    const finalUrl = `/api/proxy-site-data?url=${encodeURIComponent(url)}`;
    console.log("Sync: Calling CSV Proxy", finalUrl);
    const response = await fetch(finalUrl);
    if (!response.ok) {
      console.error("Sync: CSV Proxy Failed", response.status, response.statusText);
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.details || `Server Error: ${response.status}`);
    }
    
    const csvData = await response.text();
    
    return new Promise((resolve) => {
      Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          console.log("Remote Sync: Parsed", results.data.length, "rows");
          if (results.data.length > 0) {
            console.log("Sample Row Keys:", Object.keys(results.data[0]));
          }

          const mapped: Site[] = results.data.map((row: any) => {
            // Fuzzy match headers
            const getVal = (keys: string[]) => {
              const key = Object.keys(row).find(k => {
                const normalized = k.trim().toLowerCase().replace(/^\uFEFF/, '').replace(/\s+/g, ' ');
                return keys.some(searchKey => normalized === searchKey.toLowerCase());
              });
              return key ? String(row[key]).trim() : '';
            };

            return {
              storeNo: getVal(['Location ID', 'Store #', 'Site ID', 'Store Number', 'Site Number', 'ID', 'Location', 'Store No', 'Store', 'Site', 'Loc', 'Station ID', 'Station #', 'Location Number']) || '',
              city: getVal(['City', 'Town', 'Location City', 'Municipality']) || '',
              state: getVal(['State', 'Province', 'ST', 'Region']) || '',
              streetAddress1: getVal(['Address', 'Street', 'Street Address', 'Address 1', 'Full Address', 'Location Address', 'Site Address']) || '',
              zipcode: getVal(['Zip', 'Zipcode', 'Postal Code', 'Zip Code', 'PC']) || ''
            };
          }).filter(s => s.storeNo);

          console.log("Remote Sync: Mapped", mapped.length, "valid sites");
          
          if (mapped.length > 0) {
            const metadata = {
              fileName: 'Remote Source',
              count: mapped.length,
              date: new Date().toISOString()
            };
            await saveSites(mapped, metadata);
            resolve({ success: true, count: mapped.length });
          } else {
            const foundHeaders = results.data.length > 0 ? Object.keys(results.data[0]).join(', ') : 'None';
            resolve({ 
              success: false, 
              count: 0, 
              error: `No 'Location ID' columns found. Found headers: ${foundHeaders}. Please ensure one column is named 'Location ID' or 'Store #'.` 
            });
          }
        },
        error: (err) => {
          resolve({ success: false, count: 0, error: err.message });
        }
      });
    });
  } catch (err: any) {
    console.error("Remote site sync failed:", err);
    return { success: false, count: 0, error: err.message };
  }
}
