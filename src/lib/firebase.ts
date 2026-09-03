import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  Firestore
} from 'firebase/firestore';
import { CampusItem, ItemMatch, ItemStatus } from '../types';
import rawFirebaseConfig from '../../firebase-applet-config.json';

// Support both static json and runtime/build-time environment variables
const env = (import.meta as any).env || {};
const activeFirebaseConfig = {
  projectId: env.VITE_FIREBASE_PROJECT_ID || rawFirebaseConfig.projectId,
  appId: env.VITE_FIREBASE_APP_ID || rawFirebaseConfig.appId,
  apiKey: env.VITE_FIREBASE_API_KEY || rawFirebaseConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || rawFirebaseConfig.authDomain,
  firestoreDatabaseId:
    env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
    env.VITE_FIRESTORE_DATABASE_ID ||
    rawFirebaseConfig.firestoreDatabaseId ||
    '(default)',
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || rawFirebaseConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || rawFirebaseConfig.messagingSenderId,
};

// Initialize Firebase client
const app = getApps().length === 0 ? initializeApp(activeFirebaseConfig) : getApp();

// Use the designated databaseId from configuration
export const db: Firestore = getFirestore(
  app,
  activeFirebaseConfig.firestoreDatabaseId || '(default)'
);

/**
 * Utility to strip undefined properties from objects to prevent Firestore write crashes
 */
export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  const clean: any = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      clean[key] = obj[key];
    }
  }
  return clean as T;
}

/**
 * Fetch all items from Firestore
 */
export async function getItemsFromFirestore(): Promise<CampusItem[]> {
  const snapshot = await getDocs(collection(db, 'items'));
  const items: CampusItem[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    items.push({
      id: docSnap.id,
      itemType: data.itemType,
      itemName: data.itemName,
      category: data.category || 'Other',
      description: data.description,
      color: data.color || 'Not specified',
      location: data.location,
      date: data.date,
      imageUrl: data.imageUrl || undefined,
      contact: data.contact,
      status: data.status || data.itemType,
      createdAt: data.createdAt || new Date().toISOString(),
      matchedItemIds: Array.isArray(data.matchedItemIds) ? data.matchedItemIds : []
    });
  });

  // Sort descending by creation date
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return items;
}

/**
 * Fetch all matches from Firestore
 */
export async function getMatchesFromFirestore(itemsLookup?: Map<string, CampusItem>): Promise<ItemMatch[]> {
  const snapshot = await getDocs(collection(db, 'matches'));
  const rawMatches: any[] = [];
  snapshot.forEach((docSnap) => {
    rawMatches.push({ id: docSnap.id, ...docSnap.data() });
  });

  // If lookup map is not provided, fetch items to populate lostItem & foundItem references
  let itemsMap = itemsLookup;
  if (!itemsMap) {
    const items = await getItemsFromFirestore();
    itemsMap = new Map(items.map(item => [item.id, item]));
  }

  const matches: ItemMatch[] = [];
  for (const raw of rawMatches) {
    const lostItem = itemsMap.get(raw.lostItemId) || raw.lostItem || {
      id: raw.lostItemId,
      itemType: 'lost',
      itemName: 'Lost Item',
      category: 'Other',
      description: 'Item report',
      color: 'Not specified',
      location: 'Campus',
      date: 'Recent',
      contact: 'Campus Desk',
      status: 'possible_match',
      createdAt: raw.createdAt || new Date().toISOString()
    };

    const foundItem = itemsMap.get(raw.foundItemId) || raw.foundItem || {
      id: raw.foundItemId,
      itemType: 'found',
      itemName: 'Found Item',
      category: 'Other',
      description: 'Found report',
      color: 'Not specified',
      location: 'Campus',
      date: 'Recent',
      contact: 'Campus Desk',
      status: 'possible_match',
      createdAt: raw.createdAt || new Date().toISOString()
    };

    matches.push({
      id: raw.id,
      lostItemId: raw.lostItemId,
      foundItemId: raw.foundItemId,
      lostItem,
      foundItem,
      matchLevel: raw.matchLevel || 'Medium',
      score: typeof raw.score === 'number' ? raw.score : 80,
      reason: raw.reason || 'AI identified matching attributes between reports.',
      keyFactors: Array.isArray(raw.keyFactors) ? raw.keyFactors : [],
      createdAt: raw.createdAt || new Date().toISOString()
    });
  }

  // Sort descending by creation date
  matches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return matches;
}

/**
 * Save an item directly to Firestore
 */
export async function saveItemToFirestore(item: CampusItem): Promise<void> {
  const cleanItem = sanitizeForFirestore({
    itemType: item.itemType,
    itemName: item.itemName,
    category: item.category,
    description: item.description,
    color: item.color,
    location: item.location,
    date: item.date,
    imageUrl: item.imageUrl || undefined,
    contact: item.contact,
    status: item.status,
    createdAt: item.createdAt,
    matchedItemIds: item.matchedItemIds || []
  });

  await setDoc(doc(db, 'items', item.id), cleanItem);
}

/**
 * Update an item status in Firestore (e.g. marked as 'returned' or 'possible_match')
 */
export async function updateItemStatusInFirestore(
  itemId: string,
  status: ItemStatus,
  counterpartId?: string
): Promise<void> {
  const itemRef = doc(db, 'items', itemId);
  const snap = await getDoc(itemRef);
  if (!snap.exists()) return;

  const currentData = snap.data();
  const matchedList = new Set<string>(Array.isArray(currentData.matchedItemIds) ? currentData.matchedItemIds : []);
  if (counterpartId) {
    matchedList.add(counterpartId);
  }

  await updateDoc(itemRef, {
    status,
    matchedItemIds: Array.from(matchedList)
  });

  // If marked returned and has matched item, update counterpart as well
  if (status === 'returned' && counterpartId) {
    try {
      const counterpartRef = doc(db, 'items', counterpartId);
      const counterSnap = await getDoc(counterpartRef);
      if (counterSnap.exists()) {
        await updateDoc(counterpartRef, {
          status: 'returned'
        });
      }
    } catch (e) {
      console.warn('Could not update counterpart status:', e);
    }
  }
}

/**
 * Save a match directly to Firestore
 */
export async function saveMatchToFirestore(match: ItemMatch): Promise<void> {
  const cleanMatch = sanitizeForFirestore({
    lostItemId: match.lostItemId,
    foundItemId: match.foundItemId,
    lostItem: sanitizeForFirestore(match.lostItem as any),
    foundItem: sanitizeForFirestore(match.foundItem as any),
    matchLevel: match.matchLevel,
    score: match.score,
    reason: match.reason,
    keyFactors: match.keyFactors || [],
    createdAt: match.createdAt
  });

  await setDoc(doc(db, 'matches', match.id), cleanMatch);
}

/**
 * Subscribe to real-time changes on items collection
 */
export function subscribeToFirestoreItems(
  onUpdate: (items: CampusItem[]) => void,
  onError: (err: any) => void
): () => void {
  return onSnapshot(
    collection(db, 'items'),
    (snapshot) => {
      const items: CampusItem[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        items.push({
          id: docSnap.id,
          itemType: data.itemType,
          itemName: data.itemName,
          category: data.category || 'Other',
          description: data.description,
          color: data.color || 'Not specified',
          location: data.location,
          date: data.date,
          imageUrl: data.imageUrl || undefined,
          contact: data.contact,
          status: data.status || data.itemType,
          createdAt: data.createdAt || new Date().toISOString(),
          matchedItemIds: Array.isArray(data.matchedItemIds) ? data.matchedItemIds : []
        });
      });
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(items);
    },
    (err) => {
      console.error('Firestore items subscription error:', err);
      onError(err);
    }
  );
}

/**
 * Subscribe to real-time changes on matches collection
 */
export function subscribeToFirestoreMatches(
  onUpdate: (matches: any[]) => void,
  onError: (err: any) => void
): () => void {
  return onSnapshot(
    collection(db, 'matches'),
    (snapshot) => {
      const rawMatches: any[] = [];
      snapshot.forEach((docSnap) => {
        rawMatches.push({ id: docSnap.id, ...docSnap.data() });
      });
      rawMatches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      onUpdate(rawMatches);
    },
    (err) => {
      console.error('Firestore matches subscription error:', err);
      onError(err);
    }
  );
}
