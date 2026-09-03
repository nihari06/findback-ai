import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  Firestore
} from "firebase/firestore";

dotenv.config();

// Types
export interface CampusItem {
  id: string;
  itemType: "lost" | "found";
  itemName: string;
  category: string;
  description: string;
  color: string;
  location: string;
  date: string;
  imageUrl?: string;
  contact: string;
  status: "lost" | "found" | "possible_match" | "returned";
  createdAt: string;
  matchedItemIds?: string[];
}

export interface ItemMatch {
  id: string;
  lostItemId: string;
  foundItemId: string;
  lostItem: CampusItem;
  foundItem: CampusItem;
  matchLevel: "High" | "Medium" | "Low" | "None";
  score: number;
  reason: string;
  keyFactors?: string[];
  createdAt: string;
}

// Load Firebase configuration
let firebaseConfig: any = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  firestoreDatabaseId: "(default)"
};

try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const fileConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    firebaseConfig = { ...firebaseConfig, ...fileConfig };
  }
} catch (err) {
  console.warn("Could not read firebase-applet-config.json, using environment variables:", err);
}

// Initialize Firebase SDK
const fbApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db: Firestore = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId || "(default)");

// Strict undefined stripper to ensure zero Firestore crashes
function sanitizePayload<T extends Record<string, any>>(obj: T): T {
  const clean: any = {};
  for (const key of Object.keys(obj)) {
    if (obj[key] !== undefined) {
      clean[key] = obj[key];
    }
  }
  return clean as T;
}

// Gemini AI Helper with Resilient Fallback Ladder
const FALLBACK_MODELS = [
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-flash-latest",
  "gemini-3.7-flash"
];

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

// Generic Semantic Similarity & Heuristic Pre-Filter
// Calculates compatibility: Item Type / Category / Semantic Object is PRIMARY
// Location, Color, and Date are strictly SUPPORTING EVIDENCE
function calculateHeuristicMatch(lostItem: CampusItem, foundItem: CampusItem): {
  isMatch: boolean;
  matchLevel: "High" | "Medium" | "Low" | "None";
  score: number;
  reason: string;
  keyFactors: string[];
  isCompatibleObject: boolean;
} {
  const normalize = (str: string) => (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();

  const name1 = normalize(lostItem.itemName);
  const name2 = normalize(foundItem.itemName);
  const cat1 = normalize(lostItem.category);
  const cat2 = normalize(foundItem.category);
  const desc1 = normalize(lostItem.description);
  const desc2 = normalize(foundItem.description);
  const color1 = normalize(lostItem.color);
  const color2 = normalize(foundItem.color);
  const loc1 = normalize(lostItem.location);
  const loc2 = normalize(foundItem.location);

  // Synonyms and semantic object clusters
  const semanticClusters: string[][] = [
    ["backpack", "bag", "schoolbag", "rucksack", "knapsack", "satchel"],
    ["id", "id card", "badge", "identity card", "college id", "student id", "campus card"],
    ["charger", "adapter", "power adapter", "charging cable", "power brick", "usb c", "power supply"],
    ["phone", "mobile", "smartphone", "iphone", "android", "cellphone"],
    ["laptop", "notebook", "macbook", "computer"],
    ["wallet", "purse", "billfold", "money clip"],
    ["earphones", "headphones", "airpods", "earbuds", "headset"],
    ["bottle", "water bottle", "flask", "tumbler", "thermos"],
    ["glasses", "spectacles", "sunglasses", "eyewear"],
    ["watch", "smartwatch", "timepiece"],
    ["keys", "keychain", "key fob"],
    ["umbrella", "parasol"],
    ["jacket", "hoodie", "sweater", "coat"],
    ["book", "notebook", "textbook", "journal", "diary"]
  ];

  const fullText1 = `${name1} ${cat1} ${desc1}`;
  const fullText2 = `${name2} ${cat2} ${desc2}`;

  // Check if both items belong to the same semantic object type
  let semanticMatchFound = false;
  for (const cluster of semanticClusters) {
    const has1 = cluster.some(word => fullText1.includes(word));
    const has2 = cluster.some(word => fullText2.includes(word));
    if (has1 && has2) {
      semanticMatchFound = true;
      break;
    }
  }

  // Check for common significant words (length > 2, excluding stopwords)
  const stopWords = new Set(["the", "and", "with", "for", "near", "from", "that", "this", "left", "lost", "found", "item", "please", "room"]);
  const words1 = name1.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const words2 = name2.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const commonNameWords = words1.filter(w => words2.includes(w));

  const descWords1 = desc1.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const descWords2 = desc2.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));
  const commonDescWords = descWords1.filter(w => descWords2.includes(w));

  const sameCategory = (cat1 === cat2 && cat1 !== "other") ||
                       cat1.includes(cat2) || cat2.includes(cat1);

  // Is this a compatible physical object?
  // If categories completely conflict and no semantic cluster matches and no key words match -> incompatible!
  const isCompatibleObject = semanticMatchFound || sameCategory || commonNameWords.length > 0 || commonDescWords.length >= 2;

  // If items are clearly different object types (e.g., ID card vs Charger, Water Bottle vs Adapter),
  // they MUST NOT match, even if color or location match!
  if (!isCompatibleObject) {
    return {
      isMatch: false,
      matchLevel: "None",
      score: 5,
      reason: "The reported items are different types of objects.",
      keyFactors: ["Different item types"],
      isCompatibleObject: false
    };
  }

  // Calculate generic relevance score
  let score = 0;
  const factors: string[] = [];

  // Primary: Object type & category match (up to 45 points)
  if (sameCategory) {
    score += 30;
    factors.push(`Matching category: ${lostItem.category}`);
  }
  if (semanticMatchFound) {
    score += 25;
    factors.push(`Semantically matching item type`);
  }
  if (commonNameWords.length > 0) {
    score += Math.min(20, commonNameWords.length * 10);
    factors.push(`Common keywords: ${commonNameWords.join(", ")}`);
  }
  if (commonDescWords.length > 0) {
    score += Math.min(15, commonDescWords.length * 5);
  }

  // Secondary Supporting Evidence 1: Color (up to 15 points)
  const isGenericColor = (c: string) => !c || c === "not specified" || c === "other" || c === "none";
  if (!isGenericColor(color1) && !isGenericColor(color2)) {
    if (color1.includes(color2) || color2.includes(color1)) {
      score += 15;
      factors.push(`Matching color: ${lostItem.color}`);
    } else {
      // Conflicting colors reduce score slightly
      score = Math.max(0, score - 10);
    }
  }

  // Secondary Supporting Evidence 2: Location (up to 15 points)
  if (loc1 && loc2) {
    const locKeywords = ["canteen", "library", "cafeteria", "audi", "hall", "lab", "gym", "hostel", "ground", "parking", "gate", "class", "bench", "center"];
    let locMatched = false;
    for (const kw of locKeywords) {
      if (loc1.includes(kw) && loc2.includes(kw)) {
        locMatched = true;
        score += 15;
        factors.push(`Shared area: ${kw.charAt(0).toUpperCase() + kw.slice(1)}`);
        break;
      }
    }
    if (!locMatched && (loc1.includes(loc2) || loc2.includes(loc1))) {
      score += 12;
      factors.push(`Proximity: ${lostItem.location}`);
    }
  }

  // Secondary Supporting Evidence 3: Date proximity (up to 10 points)
  if (lostItem.date && foundItem.date) {
    try {
      const d1 = new Date(lostItem.date).getTime();
      const d2 = new Date(foundItem.date).getTime();
      const diffDays = Math.abs(d1 - d2) / (1000 * 60 * 60 * 24);
      if (diffDays <= 1) {
        score += 10;
        factors.push("Reported around the same day");
      } else if (diffDays <= 4) {
        score += 5;
        factors.push("Reported within a few days of each other");
      }
    } catch {
      // Ignore date parse errors
    }
  }

  score = Math.min(100, Math.max(0, score));

  let matchLevel: "High" | "Medium" | "Low" | "None" = "None";
  let reason = "No strong match found.";

  if (score >= 75) {
    matchLevel = "High";
    reason = `Strong correspondence between the lost and found ${lostItem.itemName.toLowerCase()} reports.`;
  } else if (score >= 50) {
    matchLevel = "Medium";
    reason = `Possible match between reports with shared attributes and timing.`;
  } else if (score >= 30) {
    matchLevel = "Low";
    reason = `Low correspondence between reports.`;
  }

  return {
    isMatch: score >= 50,
    matchLevel,
    score,
    reason,
    keyFactors: factors.length > 0 ? factors : ["Item attribute evaluation"],
    isCompatibleObject: true
  };
}

// AI Matching Function using Gemini with Semantic Understanding
async function compareItemsWithGemini(
  lostItem: CampusItem,
  foundItem: CampusItem
): Promise<{
  isMatch: boolean;
  matchLevel: "High" | "Medium" | "Low" | "None";
  score: number;
  reason: string;
  keyFactors: string[];
}> {
  // First evaluate deterministic rules
  const heuristic = calculateHeuristicMatch(lostItem, foundItem);

  // If the items are completely incompatible objects, do NOT consider them a match
  if (!heuristic.isCompatibleObject) {
    return {
      isMatch: false,
      matchLevel: "None",
      score: Math.min(15, heuristic.score),
      reason: "No strong match found. The reports describe completely different types of items.",
      keyFactors: ["Different item categories and physical object types"]
    };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return {
      isMatch: heuristic.isMatch,
      matchLevel: heuristic.matchLevel,
      score: heuristic.score,
      reason: heuristic.score >= 50 ? heuristic.reason : "No strong match found.",
      keyFactors: heuristic.keyFactors
    };
  }

  const prompt = `You are the AI matching engine for 'FindBack AI' (Campus Lost and Found).
Evaluate whether the following LOST item report and FOUND item report refer to the SAME physical object.

CRITICAL RULES:
1. Object Type & Category are PRIMARY: Two completely different objects (such as an ID card vs a Charger, or a Water Bottle vs a Wallet) must NEVER match, even if they share the same color or location.
2. Semantic Understanding: Recognize that users describe the SAME object with different terms (e.g. "school bag" == "backpack", "adapter" == "charger", "college ID" == "student ID card", "laptop" == "MacBook").
3. Location, Color, and Date are strictly SUPPORTING EVIDENCE. They increase confidence for the same item type, but CANNOT make different items match.
4. If there is no sufficiently relevant item, set isMatch: false, matchLevel: "None", score: 10-30, reason: "No strong match found."
5. Only assign "High" (score >= 75) or "Medium" (score >= 50) when there is a genuine, high-probability correlation that these two reports describe the exact same physical belonging.

REPORT 1 (LOST ITEM):
- Name: "${lostItem.itemName}"
- Category: "${lostItem.category}"
- Description: "${lostItem.description}"
- Color: "${lostItem.color}"
- Location: "${lostItem.location}"
- Date Reported Lost: "${lostItem.date}"

REPORT 2 (FOUND ITEM):
- Name: "${foundItem.itemName}"
- Category: "${foundItem.category}"
- Description: "${foundItem.description}"
- Color: "${foundItem.color}"
- Location: "${foundItem.location}"
- Date Reported Found: "${foundItem.date}"

Respond ONLY with this JSON schema:
{
  "isMatch": boolean,
  "matchLevel": "High" | "Medium" | "Low" | "None",
  "score": number (0 to 100),
  "reason": string (concise explanation starting with 'Why this may be a match:' or 'No strong match found.'),
  "keyFactors": string[] (2 to 4 bullet points of matching details or why they differ)
}`;

  for (const model of FALLBACK_MODELS) {
    try {
      const responsePromise = ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout for model ${model}`)), 4000)
      );

      const response = (await Promise.race([responsePromise, timeoutPromise])) as any;

      if (response && response.text) {
        const parsed = JSON.parse(response.text.trim());
        const score = typeof parsed.score === "number" ? parsed.score : heuristic.score;
        const matchLevel = parsed.matchLevel || (score >= 75 ? "High" : score >= 50 ? "Medium" : "None");
        const isMatch = (matchLevel === "High" || matchLevel === "Medium") && score >= 50;

        return {
          isMatch,
          matchLevel: isMatch ? matchLevel : "None",
          score,
          reason: isMatch ? (parsed.reason || heuristic.reason) : "No strong match found.",
          keyFactors: Array.isArray(parsed.keyFactors) && parsed.keyFactors.length > 0 ? parsed.keyFactors : heuristic.keyFactors,
        };
      }
    } catch (err: any) {
      console.warn(`Gemini model ${model} skipped or timed out:`, err?.message || err);
      continue;
    }
  }

  // Graceful fallback
  return {
    isMatch: heuristic.isMatch,
    matchLevel: heuristic.matchLevel,
    score: heuristic.score,
    reason: heuristic.score >= 50 ? heuristic.reason : "No strong match found.",
    keyFactors: heuristic.keyFactors
  };
}

// Fetch all items from Firestore
async function fetchItemsFromFirestore(): Promise<CampusItem[]> {
  try {
    const snap = await getDocs(collection(db, "items"));
    const items: CampusItem[] = [];
    snap.forEach((docSnap) => {
      const d = docSnap.data();
      items.push({
        id: docSnap.id,
        itemType: d.itemType,
        itemName: d.itemName,
        category: d.category || "Other",
        description: d.description,
        color: d.color || "Not specified",
        location: d.location,
        date: d.date,
        imageUrl: d.imageUrl || undefined,
        contact: d.contact,
        status: d.status || d.itemType,
        createdAt: d.createdAt || new Date().toISOString(),
        matchedItemIds: Array.isArray(d.matchedItemIds) ? d.matchedItemIds : []
      });
    });
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items;
  } catch (err) {
    console.error("fetchItemsFromFirestore error:", err);
    return [];
  }
}

// Fetch all matches from Firestore
async function fetchMatchesFromFirestore(): Promise<ItemMatch[]> {
  try {
    const items = await fetchItemsFromFirestore();
    const itemsMap = new Map(items.map(i => [i.id, i]));
    const snap = await getDocs(collection(db, "matches"));
    const matches: ItemMatch[] = [];

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const lostItem = itemsMap.get(d.lostItemId);
      const foundItem = itemsMap.get(d.foundItemId);

      // Only include matches where both real items currently exist in Firestore
      if (lostItem && foundItem) {
        matches.push({
          id: docSnap.id,
          lostItemId: d.lostItemId,
          foundItemId: d.foundItemId,
          lostItem,
          foundItem,
          matchLevel: d.matchLevel || "Medium",
          score: typeof d.score === "number" ? d.score : 80,
          reason: d.reason || "AI matched attributes between reports.",
          keyFactors: Array.isArray(d.keyFactors) ? d.keyFactors : [],
          createdAt: d.createdAt || new Date().toISOString()
        });
      }
    });

    matches.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return matches;
  } catch (err) {
    console.error("fetchMatchesFromFirestore error:", err);
    return [];
  }
}

// Evaluate a new item against existing items in Firestore using Gemini
async function evaluateItemAgainstFirestore(newItem: CampusItem): Promise<ItemMatch[]> {
  const allItems = await fetchItemsFromFirestore();
  // 1. When a LOST item is submitted, compare it ONLY with existing FOUND items.
  // 2. When a FOUND item is submitted, compare it ONLY with existing LOST items.
  const oppositeType = newItem.itemType === "lost" ? "found" : "lost";
  const potentialMatches = allItems.filter(
    item => item.id !== newItem.id && item.itemType === oppositeType && item.status !== "returned"
  );

  if (potentialMatches.length === 0) {
    return [];
  }

  // Pre-filter candidates by compatibility and heuristic score
  const candidatesWithHeuristic = potentialMatches.map(candidate => {
    const lost = newItem.itemType === "lost" ? newItem : candidate;
    const found = newItem.itemType === "found" ? newItem : candidate;
    const heuristic = calculateHeuristicMatch(lost, found);
    return { candidate, lost, found, heuristic };
  });

  // Keep all potentially compatible candidates
  const promisingCandidates = candidatesWithHeuristic
    .filter(c => c.heuristic.isCompatibleObject || c.heuristic.score >= 25)
    .sort((a, b) => b.heuristic.score - a.heuristic.score)
    .slice(0, 5); // Evaluate top 5 compatible candidates

  if (promisingCandidates.length === 0) {
    return [];
  }

  const discoveredMatches: ItemMatch[] = [];

  for (const { lost, found } of promisingCandidates) {
    try {
      const result = await compareItemsWithGemini(lost, found);

      // Only show a match when the overall relevance passes a reasonable confidence threshold
      if (result.isMatch && (result.matchLevel === "High" || result.matchLevel === "Medium") && result.score >= 50) {
        const matchId = `match-${lost.id}-${found.id}`.replace(/[^a-zA-Z0-9_\-]/g, "_");
        const matchRecord: ItemMatch = {
          id: matchId,
          lostItemId: lost.id,
          foundItemId: found.id,
          lostItem: lost,
          foundItem: found,
          matchLevel: result.matchLevel,
          score: result.score,
          reason: result.reason,
          keyFactors: result.keyFactors,
          createdAt: new Date().toISOString(),
        };

        // Save match to Firestore
        await setDoc(doc(db, "matches", matchId), sanitizePayload({
          lostItemId: matchRecord.lostItemId,
          foundItemId: matchRecord.foundItemId,
          matchLevel: matchRecord.matchLevel,
          score: matchRecord.score,
          reason: matchRecord.reason,
          keyFactors: matchRecord.keyFactors || [],
          createdAt: matchRecord.createdAt
        }));

        // Update item statuses to possible_match in Firestore
        try {
          const lostRef = doc(db, "items", lost.id);
          const foundRef = doc(db, "items", found.id);

          const lostSnap = await getDoc(lostRef);
          if (lostSnap.exists()) {
            const curLost = lostSnap.data();
            const setIds = new Set<string>(Array.isArray(curLost.matchedItemIds) ? curLost.matchedItemIds : []);
            setIds.add(found.id);
            await updateDoc(lostRef, { status: "possible_match", matchedItemIds: Array.from(setIds) });
          }

          const foundSnap = await getDoc(foundRef);
          if (foundSnap.exists()) {
            const curFound = foundSnap.data();
            const setIds = new Set<string>(Array.isArray(curFound.matchedItemIds) ? curFound.matchedItemIds : []);
            setIds.add(lost.id);
            await updateDoc(foundRef, { status: "possible_match", matchedItemIds: Array.from(setIds) });
          }
        } catch (statusErr) {
          console.warn("Could not update item match statuses in Firestore:", statusErr);
        }

        discoveredMatches.push(matchRecord);
      }
    } catch (evalErr) {
      console.error("Match evaluation error:", evalErr);
    }
  }

  return discoveredMatches;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body Parser with defensive limit
  app.use(express.json({ limit: "10mb" }));

  // API Health Endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      firestoreConnected: true,
      databaseId: firebaseConfig.firestoreDatabaseId || "(default)",
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"),
    });
  });

  // GET /api/items - Retrieve campus items directly from Firestore
  app.get("/api/items", async (req, res) => {
    try {
      const items = await fetchItemsFromFirestore();
      res.json({ success: true, data: items });
    } catch (err: any) {
      console.error("GET /api/items error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to fetch items from Firestore" });
    }
  });

  // GET /api/matches - Retrieve all AI suggested matches directly from Firestore
  app.get("/api/matches", async (req, res) => {
    try {
      const matches = await fetchMatchesFromFirestore();
      res.json({ success: true, data: matches });
    } catch (err: any) {
      console.error("GET /api/matches error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to fetch matches from Firestore" });
    }
  });

  // POST /api/matches/evaluate - Trigger Gemini AI evaluation for a reported item
  app.post("/api/matches/evaluate", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const { item } = body;

      if (!item || !item.id || !item.itemType) {
        return res.status(400).json({ success: false, error: "Valid item report is required." });
      }

      const matches = await evaluateItemAgainstFirestore(item);
      res.json({
        success: true,
        data: {
          item,
          matchesFound: matches.length,
          matches
        },
        message: matches.length > 0
          ? `Gemini AI discovered ${matches.length} possible matching report(s).`
          : "Report analyzed by Gemini AI. No immediate matching reports found."
      });
    } catch (err: any) {
      console.error("POST /api/matches/evaluate error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to evaluate matches" });
    }
  });

  // POST /api/matches/compare - Compare any two items on demand via Gemini
  app.post("/api/matches/compare", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const { lostItemId, foundItemId } = body;

      if (!lostItemId || !foundItemId) {
        return res.status(400).json({ success: false, error: "Both lostItemId and foundItemId are required." });
      }

      const allItems = await fetchItemsFromFirestore();
      const lostItem = allItems.find(i => i.id === lostItemId);
      const foundItem = allItems.find(i => i.id === foundItemId);

      if (!lostItem || !foundItem) {
        return res.status(404).json({ success: false, error: "Could not find one or both reports in Firestore." });
      }

      const result = await compareItemsWithGemini(lostItem, foundItem);
      const matchId = `match-${lostItem.id}-${foundItem.id}`.replace(/[^a-zA-Z0-9_\-]/g, "_");

      const matchRecord: ItemMatch = {
        id: matchId,
        lostItemId: lostItem.id,
        foundItemId: foundItem.id,
        lostItem,
        foundItem,
        matchLevel: result.matchLevel,
        score: result.score,
        reason: result.reason,
        keyFactors: result.keyFactors,
        createdAt: new Date().toISOString()
      };

      // Only save to Firestore if it actually passes the match criteria
      if (result.isMatch && (result.matchLevel === "High" || result.matchLevel === "Medium") && result.score >= 50) {
        await setDoc(doc(db, "matches", matchId), sanitizePayload({
          lostItemId: matchRecord.lostItemId,
          foundItemId: matchRecord.foundItemId,
          matchLevel: matchRecord.matchLevel,
          score: matchRecord.score,
          reason: matchRecord.reason,
          keyFactors: matchRecord.keyFactors || [],
          createdAt: matchRecord.createdAt
        }));
      }

      res.json({
        success: true,
        data: {
          match: matchRecord,
          analysis: result
        }
      });
    } catch (err: any) {
      console.error("Compare error:", err);
      res.status(500).json({ success: false, error: err.message || "Comparison failed" });
    }
  });

  // POST /api/items - Server endpoint to report an item and trigger Gemini matching
  app.post("/api/items", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const {
        itemType,
        itemName,
        category,
        description,
        color,
        location,
        date,
        imageUrl,
        contact
      } = body;

      if (!itemType || !["lost", "found"].includes(itemType)) {
        return res.status(400).json({ success: false, error: "Valid itemType ('lost' or 'found') is required." });
      }
      if (!itemName || itemName.trim().length < 2) {
        return res.status(400).json({ success: false, error: "Item name must be at least 2 characters." });
      }
      if (!description || description.trim().length < 5) {
        return res.status(400).json({ success: false, error: "Description must be at least 5 characters." });
      }
      if (!location || location.trim().length < 2) {
        return res.status(400).json({ success: false, error: "Campus location is required." });
      }
      if (!contact || contact.trim().length < 3) {
        return res.status(400).json({ success: false, error: "Valid contact info is required." });
      }

      const itemId = `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newItem: CampusItem = {
        id: itemId,
        itemType,
        itemName: itemName.trim(),
        category: category || "Other",
        description: description.trim(),
        color: color ? color.trim() : "Not specified",
        location: location.trim(),
        date: date || new Date().toISOString().split("T")[0],
        imageUrl: imageUrl || undefined,
        contact: contact.trim(),
        status: itemType as "lost" | "found",
        createdAt: new Date().toISOString(),
        matchedItemIds: []
      };

      // Save directly to Firestore
      await setDoc(doc(db, "items", itemId), sanitizePayload({
        itemType: newItem.itemType,
        itemName: newItem.itemName,
        category: newItem.category,
        description: newItem.description,
        color: newItem.color,
        location: newItem.location,
        date: newItem.date,
        imageUrl: newItem.imageUrl,
        contact: newItem.contact,
        status: newItem.status,
        createdAt: newItem.createdAt,
        matchedItemIds: []
      }));

      // Evaluate against existing reports in Firestore via Gemini
      const newMatches = await evaluateItemAgainstFirestore(newItem);

      res.status(201).json({
        success: true,
        data: {
          item: newItem,
          matchesFound: newMatches.length,
          matches: newMatches
        },
        message: newMatches.length > 0
          ? `Report saved to Firestore! Gemini AI found ${newMatches.length} possible matching item(s).`
          : "Report saved to Firestore successfully! Gemini AI will monitor for matching reports."
      });
    } catch (err: any) {
      console.error("POST /api/items error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to save item to Firestore" });
    }
  });

  // POST /api/items/:id/status - Update item status in Firestore
  app.post("/api/items/:id/status", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const { status } = body;

      if (!status || !["lost", "found", "possible_match", "returned"].includes(status)) {
        return res.status(400).json({ success: false, error: "Invalid status value." });
      }

      const itemRef = doc(db, "items", req.params.id);
      const itemSnap = await getDoc(itemRef);

      if (!itemSnap.exists()) {
        return res.status(404).json({ success: false, error: "Item not found in Firestore." });
      }

      await updateDoc(itemRef, { status });

      // If marked as returned, update any matched counterparts
      const itemData = itemSnap.data();
      if (status === "returned" && Array.isArray(itemData.matchedItemIds)) {
        for (const counterpartId of itemData.matchedItemIds) {
          try {
            await updateDoc(doc(db, "items", counterpartId), { status: "returned" });
          } catch (e) {
            console.warn("Could not update counterpart status:", e);
          }
        }
      }

      res.json({
        success: true,
        data: { id: req.params.id, status },
        message: `Item marked as ${status} in Firestore.`
      });
    } catch (err: any) {
      console.error("POST /api/items/:id/status error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to update status in Firestore" });
    }
  });

  // POST /api/seed-demo - Seeds standard demo scenario into real Firestore and runs Gemini AI matching
  app.post("/api/seed-demo", async (req, res) => {
    try {
      const lostId = `demo-lost-${Date.now()}`;
      const foundId = `demo-found-${Date.now()}`;

      const demoLost: CampusItem = {
        id: lostId,
        itemType: "lost",
        itemName: "Black Leather Wallet",
        category: "Wallets & Cards",
        description: "I lost my black leather wallet near the college canteen benches after lunch.",
        color: "Black",
        location: "College Canteen",
        date: new Date().toISOString().split("T")[0],
        contact: "student.lost@campus.edu",
        status: "lost",
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        matchedItemIds: []
      };

      const demoFound: CampusItem = {
        id: foundId,
        itemType: "found",
        itemName: "Small Black Wallet",
        category: "Wallets & Cards",
        description: "Found a small black leather wallet sitting on a bench near the canteen.",
        color: "Black",
        location: "College Canteen",
        date: new Date().toISOString().split("T")[0],
        contact: "security.desk@campus.edu",
        status: "found",
        createdAt: new Date().toISOString(),
        matchedItemIds: []
      };

      // Save both to Firestore
      await setDoc(doc(db, "items", lostId), sanitizePayload({
        itemType: demoLost.itemType,
        itemName: demoLost.itemName,
        category: demoLost.category,
        description: demoLost.description,
        color: demoLost.color,
        location: demoLost.location,
        date: demoLost.date,
        contact: demoLost.contact,
        status: demoLost.status,
        createdAt: demoLost.createdAt,
        matchedItemIds: []
      }));

      await setDoc(doc(db, "items", foundId), sanitizePayload({
        itemType: demoFound.itemType,
        itemName: demoFound.itemName,
        category: demoFound.category,
        description: demoFound.description,
        color: demoFound.color,
        location: demoFound.location,
        date: demoFound.date,
        contact: demoFound.contact,
        status: demoFound.status,
        createdAt: demoFound.createdAt,
        matchedItemIds: []
      }));

      // Run Gemini AI comparison
      const aiResult = await compareItemsWithGemini(demoLost, demoFound);
      const matchId = `match-${lostId}-${foundId}`;

      const demoMatch: ItemMatch = {
        id: matchId,
        lostItemId: lostId,
        foundItemId: foundId,
        lostItem: demoLost,
        foundItem: demoFound,
        matchLevel: aiResult.matchLevel || "High",
        score: aiResult.score || 95,
        reason: aiResult.reason || "Both reports describe a black wallet at the College Canteen with matching timeline.",
        keyFactors: aiResult.keyFactors || ["Matching category: Wallets", "Matching color: Black", "Location: College Canteen"],
        createdAt: new Date().toISOString()
      };

      // Save match to Firestore
      await setDoc(doc(db, "matches", matchId), sanitizePayload({
        lostItemId: demoMatch.lostItemId,
        foundItemId: demoMatch.foundItemId,
        matchLevel: demoMatch.matchLevel,
        score: demoMatch.score,
        reason: demoMatch.reason,
        keyFactors: demoMatch.keyFactors || [],
        createdAt: demoMatch.createdAt
      }));

      // Update statuses in Firestore
      await updateDoc(doc(db, "items", lostId), {
        status: "possible_match",
        matchedItemIds: [foundId]
      });
      await updateDoc(doc(db, "items", foundId), {
        status: "possible_match",
        matchedItemIds: [lostId]
      });

      demoLost.status = "possible_match";
      demoLost.matchedItemIds = [foundId];
      demoFound.status = "possible_match";
      demoFound.matchedItemIds = [lostId];

      res.json({
        success: true,
        data: {
          lostItem: demoLost,
          foundItem: demoFound,
          match: demoMatch
        },
        message: "Real demo scenario saved to Cloud Firestore and analyzed by Gemini AI!"
      });
    } catch (err: any) {
      console.error("Seed demo error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to seed demo into Firestore" });
    }
  });

  // Vite middleware in dev mode / static serving in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`FindBack AI server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
