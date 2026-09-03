/**
 * FindBack AI – Data types and schemas
 */

export type ItemType = 'lost' | 'found';

export type ItemStatus = 'lost' | 'found' | 'possible_match' | 'returned';

export type MatchLevel = 'High' | 'Medium' | 'Low' | 'None';

export interface CampusItem {
  id: string;
  itemType: ItemType;
  itemName: string;
  category: string;
  description: string;
  color: string;
  location: string;
  date: string;
  imageUrl?: string;
  contact: string;
  status: ItemStatus;
  createdAt: string;
  matchedItemIds?: string[];
}

export interface ItemMatch {
  id: string;
  lostItemId: string;
  foundItemId: string;
  lostItem: CampusItem;
  foundItem: CampusItem;
  matchLevel: MatchLevel;
  score: number; // 0 to 100
  reason: string;
  keyFactors?: string[];
  createdAt: string;
}

export interface ReportFormData {
  itemType: ItemType;
  itemName: string;
  category: string;
  description: string;
  color: string;
  location: string;
  date: string;
  imageUrl?: string;
  contact: string;
}

export interface AiMatchAnalysisResponse {
  isMatch: boolean;
  matchLevel: MatchLevel;
  score: number;
  reason: string;
  keyFactors?: string[];
  targetItemId?: string;
  matchDetails?: {
    itemTypeSimilarity: string;
    locationProximity: string;
    colorMatch: string;
    timelineMatch: string;
  };
}

export interface MatchResultWithItem {
  targetItem: CampusItem;
  analysis: AiMatchAnalysisResponse;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
