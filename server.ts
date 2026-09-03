import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

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

// Data persistence storage with disk synchronization for robust local testing
const DATA_DIR = path.join(process.cwd(), ".data");
const ITEMS_FILE = path.join(DATA_DIR, "items.json");
const MATCHES_FILE = path.join(DATA_DIR, "matches.json");

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadItems(): CampusItem[] {
  try {
    ensureStorage();
    if (fs.existsSync(ITEMS_FILE)) {
      const content = fs.readFileSync(ITEMS_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Error reading items file:", err);
  }
  return [];
}

function saveItems(items: CampusItem[]) {
  try {
    ensureStorage();
    fs.writeFileSync(ITEMS_FILE, JSON.stringify(items, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing items file:", err);
  }
}

function loadMatches(): ItemMatch[] {
  try {
    ensureStorage();
    if (fs.existsSync(MATCHES_FILE)) {
      const content = fs.readFileSync(MATCHES_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (err) {
    console.error("Error reading matches file:", err);
  }
  return [];
}

function saveMatches(matches: ItemMatch[]) {
  try {
    ensureStorage();
    fs.writeFileSync(MATCHES_FILE, JSON.stringify(matches, null, 2), "utf-8");
  } catch (err) {
    console.error("Error writing matches file:", err);
  }
}

// Initialize storage state
let itemsStore: CampusItem[] = loadItems();
let matchesStore: ItemMatch[] = loadMatches();

// Seed initial campus items if empty to provide an immediate working experience
if (itemsStore.length === 0) {
  const sampleItems: CampusItem[] = [
    {
      id: "demo-lost-1",
      itemType: "lost",
      itemName: "Black Leather Wallet",
      category: "Wallets & Cards",
      description: "I lost a black wallet near the college canteen. It has my college student ID card and bus pass.",
      color: "Black",
      location: "College Canteen",
      date: "2026-09-02",
      contact: "alex.kumar@campus.edu",
      status: "possible_match",
      createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
      matchedItemIds: ["demo-found-1"]
    },
    {
      id: "demo-found-1",
      itemType: "found",
      itemName: "Small Black Wallet",
      category: "Wallets & Cards",
      description: "I found a small black wallet near the canteen benches after lunch time.",
      color: "Black",
      location: "College Canteen (Outer Benches)",
      date: "2026-09-02",
      contact: "sarah.finder@campus.edu",
      status: "possible_match",
      createdAt: new Date(Date.now() - 3600000 * 20).toISOString(),
      matchedItemIds: ["demo-lost-1"]
    },
    {
      id: "demo-lost-2",
      itemType: "lost",
      itemName: "Hydro Flask Water Bottle",
      category: "Bottles & Mugs",
      description: "Blue water bottle lost near the college library 2nd floor reading area.",
      color: "Blue",
      location: "Library (2nd Floor)",
      date: "2026-09-01",
      contact: "david.m@campus.edu",
      status: "possible_match",
      createdAt: new Date(Date.now() - 3600000 * 48).toISOString(),
      matchedItemIds: ["demo-found-2"]
    },
    {
      id: "demo-found-2",
      itemType: "found",
      itemName: "Blue Metal Bottle",
      category: "Bottles & Mugs",
      description: "Found a blue water bottle outside the library entrance near the bicycle racks.",
      color: "Blue",
      location: "Library Entrance",
      date: "2026-09-01",
      contact: "security.desk@campus.edu",
      status: "possible_match",
      createdAt: new Date(Date.now() - 3600000 * 40).toISOString(),
      matchedItemIds: ["demo-lost-2"]
    },
    {
      id: "demo-lost-3",
      itemType: "lost",
      itemName: "AirPods Pro Case",
      category: "Electronics",
      description: "White charging case with a small red scratch on the top lid.",
      color: "White",
      location: "Science Building Room 304",
      date: "2026-09-03",
      contact: "priya.t@campus.edu",
      status: "lost",
      createdAt: new Date(Date.now() - 3600000 * 5).toISOString()
    }
  ];

  const sampleMatches: ItemMatch[] = [
    {
      id: "match-demo-1",
      lostItemId: "demo-lost-1",
      foundItemId: "demo-found-1",
      lostItem: sampleItems[0],
      foundItem: sampleItems[1],
      matchLevel: "High",
      score: 95,
      reason: "Both reports describe a black wallet and mention the college canteen location.",
      keyFactors: ["Item Type: Wallet", "Color: Black", "Location: College Canteen", "Date: Matching timeline"],
      createdAt: new Date(Date.now() - 3600000 * 19).toISOString()
    },
    {
      id: "match-demo-2",
      lostItemId: "demo-lost-2",
      foundItemId: "demo-found-2",
      lostItem: sampleItems[2],
      foundItem: sampleItems[3],
      matchLevel: "High",
      score: 90,
      reason: "Both reports describe a blue water bottle and mention the library area.",
      keyFactors: ["Item Type: Water bottle", "Color: Blue", "Location: Library & entrance"],
      createdAt: new Date(Date.now() - 3600000 * 39).toISOString()
    }
  ];

  itemsStore = sampleItems;
  matchesStore = sampleMatches;
  saveItems(itemsStore);
  saveMatches(matchesStore);
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

// Strips undefined fields before persisting
function sanitizePayload<T>(data: T): T {
  return JSON.parse(JSON.stringify(data));
}

// Resilient Heuristic Matcher & Pre-Scorer (Runs instantly to pre-filter items and provide instant fallback)
function calculateHeuristicMatch(lostItem: CampusItem, foundItem: CampusItem): {
  isMatch: boolean;
  matchLevel: "High" | "Medium" | "Low" | "None";
  score: number;
  reason: string;
  keyFactors: string[];
} {
  const name1 = (lostItem.itemName + " " + lostItem.description).toLowerCase();
  const name2 = (foundItem.itemName + " " + foundItem.description).toLowerCase();
  const color1 = (lostItem.color || "").toLowerCase();
  const color2 = (foundItem.color || "").toLowerCase();
  const loc1 = (lostItem.location || "").toLowerCase();
  const loc2 = (foundItem.location || "").toLowerCase();
  const catMatch = (lostItem.category || "").toLowerCase() === (foundItem.category || "").toLowerCase();

  let score = 0;
  const factors: string[] = [];

  if (catMatch) {
    score += 30;
    factors.push(`Same Category: ${lostItem.category}`);
  }

  // Color check
  if (color1 && color2 && color1 !== "not specified" && color2 !== "not specified") {
    if (color1.includes(color2) || color2.includes(color1)) {
      score += 25;
      factors.push(`Matching color: ${lostItem.color}`);
    }
  }

  // Location check (e.g. canteen, library, lab, gym)
  const locKeywords = ["canteen", "library", "cafeteria", "audi", "hall", "lab", "gym", "hostel", "ground", "parking", "gate"];
  let locationMatched = false;
  for (const kw of locKeywords) {
    if (loc1.includes(kw) && loc2.includes(kw)) {
      locationMatched = true;
      score += 25;
      factors.push(`Shared area: ${kw.charAt(0).toUpperCase() + kw.slice(1)}`);
      break;
    }
  }
  if (!locationMatched && (loc1.includes(loc2) || loc2.includes(loc1))) {
    score += 20;
    factors.push(`Proximity: ${lostItem.location}`);
  }

  // Name keyword check
  const words1 = lostItem.itemName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const words2 = foundItem.itemName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const commonWords = words1.filter(w => words2.includes(w));
  if (commonWords.length > 0) {
    score += 25;
    factors.push(`Common item keywords: ${commonWords.join(", ")}`);
  }

  score = Math.min(100, Math.max(10, score));

  let matchLevel: "High" | "Medium" | "Low" | "None" = "None";
  let reason = "The reports differ in item type, color, or campus location.";

  if (score >= 75) {
    matchLevel = "High";
    reason = `Both reports describe a ${lostItem.color || ""} ${lostItem.itemName.toLowerCase()} in the ${lostItem.location} area.`;
  } else if (score >= 50) {
    matchLevel = "Medium";
    reason = `Similar ${lostItem.category} item reported with matching attributes or nearby campus location.`;
  } else if (score >= 30) {
    matchLevel = "Low";
    reason = `Some partial overlap in item category or general campus area.`;
  }

  return {
    isMatch: score >= 50,
    matchLevel,
    score,
    reason,
    keyFactors: factors.length > 0 ? factors : ["Category comparison"],
  };
}

// AI Matching Function with tight per-model timeout
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
  const heuristic = calculateHeuristicMatch(lostItem, foundItem);
  const ai = getGeminiClient();

  if (!ai) {
    return heuristic;
  }

  const prompt = `You are the AI engine for 'FindBack AI - Smart Campus Lost & Found'.
Compare these two campus reports to determine if they could represent the SAME item.

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

Instructions:
1. Analyze item type, description, color, campus location proximity, dates, and distinguishing features.
2. Produce an objective, friendly explanation clearly labeled as an AI-suggested match.
3. Be realistic: If the items are completely different, matchLevel is "None" with score < 20.
4. If they match closely, matchLevel is "High" with score >= 80.

Respond ONLY with a JSON object adhering to this schema:
{
  "isMatch": boolean,
  "matchLevel": "High" | "Medium" | "Low" | "None",
  "score": number (0 to 100),
  "reason": string (1-2 sentences explaining why they may or may not match),
  "keyFactors": string[] (up to 4 bullet points of matching or contrasting factors)
}`;

  for (const model of FALLBACK_MODELS) {
    try {
      const responsePromise = ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      });

      // Enforce 2200ms timeout per model attempt to guarantee non-blocking execution
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout for model ${model}`)), 2200)
      );

      const response = (await Promise.race([responsePromise, timeoutPromise])) as any;

      if (response && response.text) {
        const parsed = JSON.parse(response.text.trim());
        return {
          isMatch: Boolean(parsed.isMatch || parsed.matchLevel === "High" || parsed.matchLevel === "Medium"),
          matchLevel: parsed.matchLevel || (heuristic.score >= 50 ? "Medium" : "Low"),
          score: typeof parsed.score === "number" ? parsed.score : heuristic.score,
          reason: parsed.reason || heuristic.reason,
          keyFactors: Array.isArray(parsed.keyFactors) && parsed.keyFactors.length > 0 ? parsed.keyFactors : heuristic.keyFactors,
        };
      }
    } catch (err: any) {
      console.warn(`Gemini model ${model} skipped or timed out:`, err?.message || err);
      continue; // Try next model in ladder
    }
  }

  // Gracefully return heuristic calculation
  return heuristic;
}

// Find matches for a newly reported item
async function evaluateItemAgainstExisting(newItem: CampusItem): Promise<ItemMatch[]> {
  const oppositeType = newItem.itemType === "lost" ? "found" : "lost";
  const potentialMatches = itemsStore.filter(
    item => item.itemType === oppositeType && item.status !== "returned"
  );

  if (potentialMatches.length === 0) {
    return [];
  }

  // Pre-filter candidates by heuristic score so we only evaluate promising matches
  const candidatesWithHeuristic = potentialMatches.map(candidate => {
    const lost = newItem.itemType === "lost" ? newItem : candidate;
    const found = newItem.itemType === "found" ? newItem : candidate;
    const heuristic = calculateHeuristicMatch(lost, found);
    return { candidate, lost, found, heuristic };
  });

  // Only take items that have at least some relevance (heuristic score >= 25)
  const promisingCandidates = candidatesWithHeuristic
    .filter(c => c.heuristic.score >= 25)
    .sort((a, b) => b.heuristic.score - a.heuristic.score)
    .slice(0, 3); // Limit to top 3 to keep response time fast

  if (promisingCandidates.length === 0) {
    return [];
  }

  const discoveredMatches: ItemMatch[] = [];

  // Evaluate candidate matches concurrently with safety
  const evaluationPromises = promisingCandidates.map(async ({ candidate, lost, found, heuristic }) => {
    try {
      const result = await compareItemsWithGemini(lost, found);

      if (result.matchLevel === "High" || result.matchLevel === "Medium") {
        const matchRecord: ItemMatch = {
          id: `match-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
        return { matchRecord, lost, found };
      }
    } catch (err) {
      console.error("Match evaluation error for candidate", candidate.id, err);
    }
    return null;
  });

  const results = await Promise.all(evaluationPromises);

  for (const item of results) {
    if (item) {
      discoveredMatches.push(item.matchRecord);
      item.lost.status = "possible_match";
      item.found.status = "possible_match";
      item.lost.matchedItemIds = Array.from(new Set([...(item.lost.matchedItemIds || []), item.found.id]));
      item.found.matchedItemIds = Array.from(new Set([...(item.found.matchedItemIds || []), item.lost.id]));
    }
  }

  if (discoveredMatches.length > 0) {
    matchesStore = [...discoveredMatches, ...matchesStore];
    saveMatches(matchesStore);
    saveItems(itemsStore);
  }

  return discoveredMatches;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body Parser with defensive configuration
  app.use(express.json({ limit: "10mb" }));

  // API Health Endpoint
  app.get("/api/health", (req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "MY_GEMINI_API_KEY"),
      itemsCount: itemsStore.length,
      matchesCount: matchesStore.length,
    });
  });

  // GET /api/items - Retrieve campus items with optional filters
  app.get("/api/items", (req, res) => {
    try {
      const { type, status, category, location, search } = req.query;
      let filtered = [...itemsStore];

      if (type && type !== "all") {
        filtered = filtered.filter(item => item.itemType === type);
      }

      if (status && status !== "all") {
        filtered = filtered.filter(item => item.status === status);
      }

      if (category && category !== "all") {
        filtered = filtered.filter(item => item.category.toLowerCase() === String(category).toLowerCase());
      }

      if (location && location !== "all") {
        filtered = filtered.filter(item =>
          item.location.toLowerCase().includes(String(location).toLowerCase())
        );
      }

      if (search && String(search).trim()) {
        const q = String(search).toLowerCase().trim();
        filtered = filtered.filter(
          item =>
            item.itemName.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q) ||
            item.location.toLowerCase().includes(q) ||
            item.color.toLowerCase().includes(q)
        );
      }

      // Sort newest first
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({ success: true, data: filtered });
    } catch (err: any) {
      console.error("GET /api/items error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to fetch items" });
    }
  });

  // GET /api/items/:id - Retrieve specific item details
  app.get("/api/items/:id", (req, res) => {
    try {
      const item = itemsStore.find(i => i.id === req.params.id);
      if (!item) {
        return res.status(404).json({ success: false, error: "Item not found" });
      }

      // Find any matches involving this item
      const relatedMatches = matchesStore.filter(
        m => m.lostItemId === item.id || m.foundItemId === item.id
      );

      res.json({ success: true, data: { item, matches: relatedMatches } });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Failed to fetch item" });
    }
  });

  // POST /api/items - Report a lost or found item
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

      // Defensive validation
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
        return res.status(400).json({ success: false, error: "Valid contact information is required." });
      }

      const newItem: CampusItem = sanitizePayload({
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      });

      itemsStore.unshift(newItem);
      saveItems(itemsStore);

      // Trigger Gemini AI Matching with an enforced safety timeout
      let newMatches: ItemMatch[] = [];
      try {
        newMatches = await Promise.race([
          evaluateItemAgainstExisting(newItem),
          new Promise<ItemMatch[]>((resolve) => setTimeout(() => resolve([]), 3500))
        ]);
      } catch (matchErr) {
        console.warn("AI matching evaluation completed with fallback:", matchErr);
      }

      res.status(201).json({
        success: true,
        data: {
          item: newItem,
          matchesFound: newMatches.length,
          matches: newMatches
        },
        message: newMatches.length > 0
          ? `Report saved! Gemini AI found ${newMatches.length} possible matching item(s).`
          : "Report saved successfully! We will notify you if a matching item is reported."
      });
    } catch (err: any) {
      console.error("POST /api/items error:", err);
      res.status(500).json({ success: false, error: err.message || "Failed to submit report" });
    }
  });

  // POST /api/items/:id/status - Update item status (e.g. mark as 'returned')
  app.post("/api/items/:id/status", (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const { status } = body;

      if (!status || !["lost", "found", "possible_match", "returned"].includes(status)) {
        return res.status(400).json({ success: false, error: "Invalid status value." });
      }

      const item = itemsStore.find(i => i.id === req.params.id);
      if (!item) {
        return res.status(404).json({ success: false, error: "Item not found" });
      }

      item.status = status;

      // If marked as returned, also update matched item if confirmed
      if (status === "returned" && item.matchedItemIds && item.matchedItemIds.length > 0) {
        for (const matchedId of item.matchedItemIds) {
          const counterpart = itemsStore.find(i => i.id === matchedId);
          if (counterpart && counterpart.status === "possible_match") {
            counterpart.status = "returned";
          }
        }
      }

      saveItems(itemsStore);

      res.json({
        success: true,
        data: item,
        message: `Item marked as ${status}.`
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Failed to update item status" });
    }
  });

  // GET /api/matches - Retrieve all AI suggested matches
  app.get("/api/matches", (req, res) => {
    try {
      // Re-hydrate matches with latest item states
      const populated = matchesStore.map(m => {
        const lost = itemsStore.find(i => i.id === m.lostItemId) || m.lostItem;
        const found = itemsStore.find(i => i.id === m.foundItemId) || m.foundItem;
        return {
          ...m,
          lostItem: lost,
          foundItem: found
        };
      });

      populated.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      res.json({ success: true, data: populated });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Failed to fetch matches" });
    }
  });

  // POST /api/matches/compare - Compare any two items on demand via Gemini
  app.post("/api/matches/compare", async (req, res) => {
    try {
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const { lostItemId, foundItemId } = body;

      const lostItem = itemsStore.find(i => i.id === lostItemId);
      const foundItem = itemsStore.find(i => i.id === foundItemId);

      if (!lostItem || !foundItem) {
        return res.status(400).json({ success: false, error: "Both lostItem and foundItem must exist." });
      }

      const result = await compareItemsWithGemini(lostItem, foundItem);

      // Save match record if not exists
      let matchRecord = matchesStore.find(
        m => m.lostItemId === lostItem.id && m.foundItemId === foundItem.id
      );

      if (!matchRecord) {
        matchRecord = {
          id: `match-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
        matchesStore.unshift(matchRecord);
        saveMatches(matchesStore);
      } else {
        matchRecord.matchLevel = result.matchLevel;
        matchRecord.score = result.score;
        matchRecord.reason = result.reason;
        matchRecord.keyFactors = result.keyFactors;
        saveMatches(matchesStore);
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

  // POST /api/seed-demo - Re-seed standard demo scenario
  app.post("/api/seed-demo", (req, res) => {
    try {
      const demoLost: CampusItem = {
        id: `demo-lost-${Date.now()}`,
        itemType: "lost",
        itemName: "Black Leather Wallet",
        category: "Wallets & Cards",
        description: "I lost a black wallet near the college canteen.",
        color: "Black",
        location: "College Canteen",
        date: new Date().toISOString().split("T")[0],
        contact: "student.lost@campus.edu",
        status: "possible_match",
        createdAt: new Date().toISOString(),
        matchedItemIds: []
      };

      const demoFound: CampusItem = {
        id: `demo-found-${Date.now()}`,
        itemType: "found",
        itemName: "Small Black Wallet",
        category: "Wallets & Cards",
        description: "I found a small black wallet near the canteen.",
        color: "Black",
        location: "College Canteen",
        date: new Date().toISOString().split("T")[0],
        contact: "student.finder@campus.edu",
        status: "possible_match",
        createdAt: new Date().toISOString(),
        matchedItemIds: [demoLost.id]
      };

      demoLost.matchedItemIds = [demoFound.id];

      const demoMatch: ItemMatch = {
        id: `match-${Date.now()}`,
        lostItemId: demoLost.id,
        foundItemId: demoFound.id,
        lostItem: demoLost,
        foundItem: demoFound,
        matchLevel: "High",
        score: 95,
        reason: "Both reports describe a black wallet and the same canteen location.",
        keyFactors: [
          "Item category: Wallet",
          "Color match: Black",
          "Location match: College Canteen",
          "Close timeline"
        ],
        createdAt: new Date().toISOString()
      };

      itemsStore.unshift(demoLost, demoFound);
      matchesStore.unshift(demoMatch);
      saveItems(itemsStore);
      saveMatches(matchesStore);

      res.json({
        success: true,
        data: {
          lostItem: demoLost,
          foundItem: demoFound,
          match: demoMatch
        },
        message: "Demo scenario seeded successfully!"
      });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message || "Failed to seed demo" });
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
