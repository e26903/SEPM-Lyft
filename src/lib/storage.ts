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

// SITES (Persist to Firestore if logged in)
export async function saveSites(sites: Site[], metadata: { fileName: string; count: number; date: string }) {
  await siteStore.setItem('master_list', sites);
  await siteStore.setItem('manifest_metadata', metadata);

  const user = auth.currentUser;
  if (user) {
    try {
      const siteListRef = doc(db, 'sites', 'master_list');
      await setDoc(siteListRef, { 
        sites, 
        metadata,
        updatedAt: serverTimestamp(),
        updatedBy: user.email
      });
      console.log("[STORAGE] Sites synced to cloud");
    } catch (err) {
      console.error("[STORAGE] Cloud site save failed:", err);
    }
  }
}

export async function getSiteMetadata(): Promise<{ fileName: string; count: number; date: string } | null> {
  const local = await siteStore.getItem<{ fileName: string; count: number; date: string }>('manifest_metadata');
  if (local) return local;

  const user = auth.currentUser;
  if (user) {
    try {
      const siteListSnap = await getDoc(doc(db, 'sites', 'master_list'));
      if (siteListSnap.exists()) {
        const data = siteListSnap.data();
        return data.metadata;
      }
    } catch {}
  }
  return null;
}

export async function clearImportedSites() {
  await siteStore.removeItem('master_list');
  await siteStore.removeItem('manifest_metadata');
  const user = auth.currentUser;
  if (user) {
    try {
      await deleteDoc(doc(db, 'sites', 'master_list'));
    } catch {}
  }
}

export async function getImportedSites(): Promise<Site[]> {
  const local = await siteStore.getItem<Site[]>('master_list');
  if (local && local.length > 0) return local;

  const user = auth.currentUser;
  if (user) {
    try {
      const siteListSnap = await getDoc(doc(db, 'sites', 'master_list'));
      if (siteListSnap.exists()) {
        const data = siteListSnap.data();
        const sites = data.sites as Site[];
        await siteStore.setItem('master_list', sites);
        await siteStore.setItem('manifest_metadata', data.metadata);
        return sites;
      }
    } catch {}
  }
  return [];
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
        console.log(`[SYNC-DEBUG] Extracted Sheet ID: ${sheetId}`);
        const tryFetch = async (fetchUrl: string, options: any) => {
          // Use absolute URL to avoid potential relative path issues in iframes
          const base = window.location.origin;
          const absoluteUrl = fetchUrl.startsWith('http') ? fetchUrl : `${base}${fetchUrl.startsWith('/') ? '' : '/'}${fetchUrl}`;
          
          console.log(`[SYNC-DEBUG] Fetching ${absoluteUrl}...`);
          try {
            const resp = await fetch(absoluteUrl, options);
            if (!resp.ok) {
              const errText = await resp.text().catch(() => 'No details');
              console.error(`[SYNC-DEBUG] Fetch failed with ${resp.status}: ${errText}`);
              throw new Error(`HTTP ${resp.status}: ${errText.substring(0, 80)}`);
            }
            const contentType = resp.headers.get("content-type") || "";
            if (contentType.includes("text/html")) {
               const sample = (await resp.text()).substring(0, 60);
               console.error(`[SYNC-DEBUG] Expected JSON but got HTML for ${absoluteUrl}: ${sample}`);
               throw new Error(`Server returned HTML instead of JSON (Possible Auth Redirect or SPA Fallback).`);
            }
            return await resp.json();
          } catch (fetchErr: any) {
            console.error(`[SYNC-DEBUG] Fetch Exception for ${absoluteUrl}:`, fetchErr.message);
            throw fetchErr;
          }
        };

        let sheetData;
        try {
          const proxyUrl = `/api/smartsheet-api-proxy?sheetId=${sheetId}&t=${Date.now()}`;
          console.log(`[SYNC-DEBUG] Attempting Proxy POST to ${proxyUrl}`);
          sheetData = await tryFetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sheetId, token }),
            cache: 'no-store'
          });
        } catch (proxyErr: any) {
          console.warn("[SYNC-DEBUG] Proxy POST failed, trying Proxy GET...", proxyErr.message);
          try {
            const getUrl = `/api/smartsheet-api-proxy?sheetId=${sheetId}&token=${encodeURIComponent(token)}&t=${Date.now()}`;
            sheetData = await tryFetch(getUrl, {
              method: 'GET',
              cache: 'no-store'
            });
          } catch (getErr: any) {
            console.warn("[SYNC-DEBUG] Proxy GET failed, trying direct fetch...", getErr.message);
            // Last ditch attempt: Direct Smartsheet API
            sheetData = await tryFetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
              headers: { 'Authorization': `Bearer ${token}` }
            });
          }
        }
        
        console.log(`[SYNC-DEBUG] Received sheet data. Name: ${sheetData.name}, Rows: ${sheetData.rows?.length}`);
        const columns = sheetData.columns || [];
        const rows = sheetData.rows || [];
        
        console.log(`[SYNC-DEBUG] Columns: ${columns.map((c: any) => c.title).join(', ')}`);

        if (rows.length === 0) {
          console.warn("[SYNC-DEBUG] Sheet is empty!");
          return { success: false, count: 0, error: "The Smartsheet appears to be empty." };
        }

        const mapped: Site[] = rows.map((row: any, rowIndex: number) => {
          const getVal = (searchKeys: string[]) => {
            const col = columns.find((c: any) => 
              searchKeys.some(sk => {
                const title = (c.title || '').trim().toLowerCase().replace(/\s+/g, ' ');
                const search = sk.toLowerCase().trim();
                return title === search || title.includes(search);
              })
            );
            if (!col) return '';
            const cell = row.cells.find((c: any) => c.columnId === col.id);
            const val = cell?.displayValue || cell?.value || '';
            if (rowIndex < 5) console.log(`[SYNC-DEBUG] Row ${rowIndex} | ${col.title} -> ${val}`);
            return val;
          };

          const sNo = String(getVal(['Location ID', 'Store #', 'Site ID', 'Store Number', 'Site Number', 'ID', 'Location', 'Store No', 'Store', 'Site', 'Loc', 'Station ID', 'Station #', 'Location Number', 'Store/Location', 'STN', 'Unit', 'Stn #', 'Loc #', 'Site #', 'Site No', 'Station No']) || '').trim();

          return {
            storeNo: sNo,
            city: String(getVal(['City', 'Town', 'Location City', 'Municipality', 'Shipping City', 'Dist']) || '').trim(),
            state: String(getVal(['State', 'Province', 'ST', 'Region', 'Shipping State']) || '').trim(),
            streetAddress1: String(getVal(['Address', 'Street', 'Street Address', 'Address 1', 'Full Address', 'Location Address', 'Site Address', 'Shipping Street']) || '').trim(),
            zipcode: String(getVal(['Zip', 'Zipcode', 'Postal Code', 'Zip Code', 'PC', 'Shipping Zip']) || '').trim()
          };
        }).filter((s: Site) => s.storeNo);

        console.log(`[SYNC-DEBUG] Successfully mapped ${mapped.length} sites (from ${rows.length} total rows).`);

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
    let csvData;
    let fallbackToCorsProxy = false;
    
    try {
      // Call our server-side proxy to bypass CORS with cache buster
      const proxyUrl = `/api/proxy-site-data?url=${encodeURIComponent(url)}&t=${Date.now()}`;
      console.log("Sync: Calling CSV Proxy", proxyUrl);
      const response = await fetch(proxyUrl, { cache: 'no-store' });
      
      const contentType = response.headers.get("content-type") || "";
      if (!response.ok || contentType.includes("text/html")) {
        console.warn(`Sync: Backend proxy failed or returned HTML (${response.status}). Trying client-side CORS proxy...`);
        fallbackToCorsProxy = true;
      } else {
        csvData = await response.text();
      }
    } catch (proxyErr: any) {
      console.warn("Sync: CSV Proxy failed, trying direct/CORS proxy...", proxyErr.message);
      fallbackToCorsProxy = true;
    }

    if (fallbackToCorsProxy) {
      try {
        // Try a public CORS proxy as a last resort
        const corsProxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        console.log("Sync: Calling Public CORS Proxy", corsProxyUrl);
        const response = await fetch(corsProxyUrl, { cache: 'no-store' });
        if (!response.ok) throw new Error(`CORS Proxy Failed: ${response.status}`);
        csvData = await response.text();
      } catch (corsErr: any) {
        console.warn("Sync: CORS Proxy failed, trying direct (likely to fail CORS)...", corsErr.message);
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Direct Fetch Failed: ${response.status}`);
        csvData = await response.text();
      }
    }
    
    if (!csvData) throw new Error("Could not retrieve site data from any source.");
    
    return new Promise((resolve) => {
      Papa.parse(csvData, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          console.log("[SYNC-DEBUG-CSV] Parsed rows:", results.data.length);
          if (results.data.length > 0) {
            console.log("[SYNC-DEBUG-CSV] Headers:", Object.keys(results.data[0]));
            console.log("[SYNC-DEBUG-CSV] Row 0 sample:", JSON.stringify(results.data[0]));
          }

          const mapped: Site[] = results.data.map((row: any) => {
            // Fuzzy match headers
          const getVal = (keys: string[]) => {
            const key = Object.keys(row).find(k => {
              const normalized = k.trim().toLowerCase().replace(/^\uFEFF/, '').replace(/\s+/g, ' ');
              return keys.some(searchKey => {
                const search = searchKey.toLowerCase().trim();
                return normalized === search || normalized.includes(search);
              });
            });
            return key ? String(row[key]).trim() : '';
          };

          const sNo = getVal(['Location ID', 'Store #', 'Site ID', 'Store Number', 'Site Number', 'ID', 'Location', 'Store No', 'Store', 'Site', 'Loc', 'Station ID', 'Station #', 'Location Number', 'Store/Location', 'STN', 'Unit', 'Stn #', 'Loc #', 'Site #', 'Site No', 'Station No']) || '';

          return {
            storeNo: sNo,
            city: getVal(['City', 'Town', 'Location City', 'Municipality', 'Shipping City', 'Dist']) || '',
            state: getVal(['State', 'Province', 'ST', 'Region', 'Shipping State']) || '',
            streetAddress1: getVal(['Address', 'Street', 'Street Address', 'Address 1', 'Full Address', 'Location Address', 'Site Address', 'Shipping Street']) || '',
            zipcode: getVal(['Zip', 'Zipcode', 'Postal Code', 'Zip Code', 'PC', 'Shipping Zip']) || ''
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
