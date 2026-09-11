import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { initializeApp, getApps, getApp } from "firebase/app";
import rawFirebaseConfig from "./firebase-applet-config.json";
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

// Load Firebase configuration with robust fallback defaults for production deployment
const rawConfig = (rawFirebaseConfig && typeof rawFirebaseConfig === "object") ? rawFirebaseConfig : ({} as any);

const firebaseConfig: any = {
  projectId:
    process.env.FIREBASE_PROJECT_ID ||
    process.env.VITE_FIREBASE_PROJECT_ID ||
    rawConfig.projectId ||
    "glass-chemist-495106-k6",
  apiKey:
    process.env.FIREBASE_API_KEY ||
    process.env.VITE_FIREBASE_API_KEY ||
    rawConfig.apiKey ||
    "AIzaSyBmqEbX3SPXYtkFRkELJkJjxOE3nsE0XzM",
  authDomain:
    process.env.FIREBASE_AUTH_DOMAIN ||
    process.env.VITE_FIREBASE_AUTH_DOMAIN ||
    rawConfig.authDomain ||
    "glass-chemist-495106-k6.firebaseapp.com",
  storageBucket:
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.VITE_FIREBASE_STORAGE_BUCKET ||
    rawConfig.storageBucket,
  messagingSenderId:
    process.env.FIREBASE_MESSAGING_SENDER_ID ||
    process.env.VITE_FIREBASE_MESSAGING_SENDER_ID ||
    rawConfig.messagingSenderId ||
    "399901690863",
  appId:
    process.env.FIREBASE_APP_ID ||
    process.env.VITE_FIREBASE_APP_ID ||
    rawConfig.appId ||
    "1:399901690863:web:288c71876d42521f44041a",
  firestoreDatabaseId:
    process.env.FIRESTORE_DATABASE_ID ||
    process.env.FIREBASE_DATABASE_ID ||
    process.env.FIREBASE_FIRESTORE_DATABASE_ID ||
    process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID ||
    rawConfig.firestoreDatabaseId ||
    "ai-studio-remixfindbackais-9a55e96f-c9c6-4ca2-9b5d-95a56c55acfd"
};

// Initialize Firebase SDK
const fbApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const db: Firestore = getFirestore(fbApp, firebaseConfig.firestoreDatabaseId);

console.log(`[FindBack AI Server] Initialized Firebase Firestore connection: Project "${firebaseConfig.projectId}", Database "${firebaseConfig.firestoreDatabaseId}"`);

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
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GENAI_API_KEY;

  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    console.warn("[FindBack AI Server] Gemini API key not found in process.env (checked GEMINI_API_KEY, GOOGLE_API_KEY, GENAI_API_KEY)");
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
  aiError?: boolean;
}> {
  // First evaluate deterministic rules
  const heuristic = calculateHeuristicMatch(lostItem, foundItem);

  // If the items are completely incompatible objects, do NOT consider them a match
  if (!heuristic.isCompatibleObject) {
    console.log(`[FindBack AI] Candidate comparison [${lostItem.itemName} vs ${foundItem.itemName}]: Incompatible object types.`);
    return {
      isMatch: false,
      matchLevel: "None",
      score: Math.min(15, heuristic.score),
      reason: "No strong match found. The reports describe completely different types of items.",
      keyFactors: ["Different item categories and physical object types"],
      aiError: false
    };
  }

  const ai = getGeminiClient();
  if (!ai) {
    console.warn(`[FindBack AI] Gemini Client is unavailable (missing API key).`);
    return {
      isMatch: heuristic.isMatch,
      matchLevel: heuristic.matchLevel,
      score: heuristic.score,
      reason: heuristic.score >= 50 ? heuristic.reason : "No strong match found.",
      keyFactors: heuristic.keyFactors,
      aiError: true
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

  console.log(`[FindBack AI] [Gemini Request] Comparing Lost "${lostItem.itemName}" (#${lostItem.id}) with Found "${foundItem.itemName}" (#${foundItem.id})`);

  for (const model of FALLBACK_MODELS) {
    try {
      console.log(`[FindBack AI] Invoking Gemini model: ${model}`);
      const responsePromise = ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      // 12-second timeout to prevent premature aborts on cold starts or network latency
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout for model ${model}`)), 12000)
      );

      const response = (await Promise.race([responsePromise, timeoutPromise])) as any;

      if (response && response.text) {
        const parsed = JSON.parse(response.text.trim());
        const score = typeof parsed.score === "number" ? parsed.score : heuristic.score;
        const matchLevel = parsed.matchLevel || (score >= 75 ? "High" : score >= 50 ? "Medium" : "None");
        const isMatch = (matchLevel === "High" || matchLevel === "Medium") && score >= 50;

        console.log(`[FindBack AI] [Gemini Response] Successfully evaluated with ${model}. isMatch: ${isMatch}, matchLevel: ${matchLevel}, score: ${score}`);

        return {
          isMatch,
          matchLevel: isMatch ? matchLevel : "None",
          score,
          reason: isMatch ? (parsed.reason || heuristic.reason) : "No strong match found.",
          keyFactors: Array.isArray(parsed.keyFactors) && parsed.keyFactors.length > 0 ? parsed.keyFactors : heuristic.keyFactors,
          aiError: false
        };
      }
    } catch (err: any) {
      console.warn(`[FindBack AI] Gemini model ${model} skipped or timed out:`, err?.message || err);
      continue;
    }
  }

  console.warn("[FindBack AI] All Gemini models in fallback ladder failed or timed out.");
  return {
    isMatch: heuristic.isMatch,
    matchLevel: heuristic.matchLevel,
    score: heuristic.score,
    reason: heuristic.score >= 50 ? heuristic.reason : "No strong match found.",
    keyFactors: heuristic.keyFactors,
    aiError: true
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

// Evaluate a new item against existing items in Firestore using Gemini in ONE immediate evaluation
async function evaluateItemAgainstFirestore(newItem: CampusItem): Promise<{
  matches: ItemMatch[];
  aiUnavailable?: boolean;
}> {
  console.log(`[FindBack AI] [Matching Trigger] Starting ONE immediate AI matching evaluation for item: ${newItem.id} (${newItem.itemType.toUpperCase()} - "${newItem.itemName}")`);

  const allItems = await fetchItemsFromFirestore();
  console.log(`[FindBack AI] [Firestore Query] Retrieved ${allItems.length} total items from database.`);

  // 1. When a LOST item is submitted, compare it ONLY with existing FOUND items.
  // 2. When a FOUND item is submitted, compare it ONLY with existing LOST items.
  const oppositeType = newItem.itemType === "lost" ? "found" : "lost";
  const potentialMatches = allItems.filter(
    item => item.id !== newItem.id && item.itemType === oppositeType && item.status !== "returned"
  );

  console.log(`[FindBack AI] [Candidate Filter] Found ${potentialMatches.length} candidate opposite-type (${oppositeType}) items.`);

  if (potentialMatches.length === 0) {
    console.log(`[FindBack AI] No potential candidate items found for matching.`);
    return { matches: [] };
  }

  const matches: ItemMatch[] = [];
  let aiUnavailable = false;

  for (const candidate of potentialMatches) {
    const lostItem = newItem.itemType === "lost" ? newItem : candidate;
    const foundItem = newItem.itemType === "found" ? newItem : candidate;

    const res = await compareItemsWithGemini(lostItem, foundItem);
    if (res.aiError) {
      aiUnavailable = true;
    }

    if (res.isMatch) {
      const matchId = `match_${lostItem.id}_${foundItem.id}`;
      const matchObj: ItemMatch = {
        id: matchId,
        lostItemId: lostItem.id,
        foundItemId: foundItem.id,
        lostItem,
        foundItem,
        matchLevel: res.matchLevel,
        score: res.score,
        reason: res.reason,
        keyFactors: res.keyFactors,
        createdAt: new Date().toISOString()
      };

      try {
        await setDoc(doc(db, "matches", matchId), sanitizePayload({
          lostItemId: lostItem.id,
          foundItemId: foundItem.id,
          matchLevel: res.matchLevel,
          score: res.score,
          reason: res.reason,
          keyFactors: res.keyFactors,
          createdAt: matchObj.createdAt
        }));

        const updateItemStatus = async (item: CampusItem, matchedWithId: string) => {
          const matchedItemIds = Array.from(new Set([...(item.matchedItemIds || []), matchedWithId]));
          await updateDoc(doc(db, "items", item.id), sanitizePayload({
            status: item.status === "returned" ? "returned" : "possible_match",
            matchedItemIds
          }));
        };

        await updateItemStatus(lostItem, foundItem.id);
        await updateItemStatus(foundItem, lostItem.id);

        matches.push(matchObj);
      } catch (err) {
        console.error("Error saving match:", err);
      }
    }
  }

  return { matches, aiUnavailable };
}

async function createServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: "10mb" }));

  // API Routes
  app.get("/api/items", async (_req, res) => {
    try {
      const items = await fetchItemsFromFirestore();
      res.json(items);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch items" });
    }
  });

  app.post("/api/items", async (req, res) => {
    try {
      const body = req.body;
      const itemId = body.id || `item_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newItem: CampusItem = {
        id: itemId,
        itemType: body.itemType,
        itemName: body.itemName,
        category: body.category || "Other",
        description: body.description || "",
        color: body.color || "Not specified",
        location: body.location || "",
        date: body.date || new Date().toISOString().split("T")[0],
        imageUrl: body.imageUrl || undefined,
        contact: body.contact || "",
        status: body.status || body.itemType,
        createdAt: new Date().toISOString(),
        matchedItemIds: []
      };

      await setDoc(doc(db, "items", itemId), sanitizePayload(newItem));
      const evalResult = await evaluateItemAgainstFirestore(newItem);

      res.status(201).json({
        item: newItem,
        matches: evalResult.matches,
        aiUnavailable: evalResult.aiUnavailable
      });
    } catch (err: any) {
      console.error("Error creating item:", err);
      res.status(500).json({ error: err.message || "Failed to create item" });
    }
  });

  app.get("/api/matches", async (_req, res) => {
    try {
      const matches = await fetchMatchesFromFirestore();
      res.json(matches);
    } catch (err) {
      res.status(500).json({ error: "Failed to fetch matches" });
    }
  });

  app.patch("/api/items/:id/status", async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;
      await updateDoc(doc(db, "items", id), sanitizePayload({ status }));
      res.json({ success: true, id, status });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to update item status" });
    }
  });

  // Vite development or static file serving
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "custom",
    });
    app.use(vite.middlewares);
    app.use("*", async (req, res, next) => {
      const url = req.originalUrl;
      try {
        let template = fs.readFileSync(path.resolve(".", "index.html"), "utf-8");
        template = await vite.transformIndexHtml(url, template);
        res.status(200).set({ "Content-Type": "text/html" }).end(template);
      } catch (e: any) {
        vite.ssrFixStacktrace(e);
        next(e);
      }
    });
  } else {
    const distPath = path.resolve(".", "dist");
    app.use(express.static(distPath));
    app.use("*", (_req, res) => {
      res.sendFile(path.resolve(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[FindBack AI Server] Running on http://localhost:${PORT}`);
  });
}

createServer();