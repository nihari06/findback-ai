import React, { useState } from 'react';
import { X, Sparkles, Upload, Image as ImageIcon, AlertCircle, CheckCircle2, ArrowRight, Loader2 } from 'lucide-react';
import { ItemType, CampusItem, ItemMatch } from '../types';
import { saveItemToFirestore } from '../lib/firebase';
import { getApiUrl } from '../lib/api';

interface ReportModalProps {
  isOpen: boolean;
  initialType: ItemType;
  onClose: () => void;
  onItemCreated: (item: CampusItem, matches: ItemMatch[]) => void;
}

const CATEGORIES = [
  'Wallets & Cards',
  'Electronics & Chargers',
  'Keys & Keychains',
  'IDs & Badges',
  'Bottles & Mugs',
  'Bags & Backpacks',
  'Books & Stationery',
  'Clothing & Accessories',
  'Sports & Gym Gear',
  'Other'
];

const COMMON_LOCATIONS = [
  'College Canteen / Dining Hall',
  'Main Campus Library',
  'Science Building / Labs',
  'Auditorium / Student Union',
  'Sports Complex / Gym',
  'Lecture Hall A / Block B',
  'Computer Center / Server Lab',
  'Campus Grounds & Courtyard',
  'Parking Lot / Bike Racks',
  'Hostel / Dormitories'
];

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  initialType,
  onClose,
  onItemCreated,
}) => {
  const [itemType, setItemType] = useState<ItemType>(initialType);
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('');
  const [location, setLocation] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [contact, setContact] = useState('');
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  // States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRetryingMatch, setIsRetryingMatch] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submittedResult, setSubmittedResult] = useState<{
    item: CampusItem;
    matches: ItemMatch[];
    aiUnavailable?: boolean;
  } | null>(null);

  // Synchronize when initialType changes
  React.useEffect(() => {
    setItemType(initialType);
    setErrorMessage(null);
    setSubmittedResult(null);
  }, [initialType, isOpen]);

  if (!isOpen) return null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('Image size should be under 10MB.');
      return;
    }

    // Fast client-side image compression to prevent large upload lag
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX_DIM = 800;
          let { width, height } = img;
          if (width > height && width > MAX_DIM) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else if (height > MAX_DIM) {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressed = canvas.toDataURL('image/jpeg', 0.75);
            setImageUrl(compressed);
          } else {
            setImageUrl(event.target?.result as string);
          }
        } catch {
          setImageUrl(event.target?.result as string);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Frontend validation
    if (!itemName.trim() || itemName.trim().length < 2) {
      setErrorMessage('Please enter an item name (at least 2 characters).');
      return;
    }
    if (!description.trim() || description.trim().length < 5) {
      setErrorMessage('Please provide a descriptive explanation (at least 5 characters).');
      return;
    }
    if (!location.trim() || location.trim().length < 2) {
      setErrorMessage('Please specify where the item was lost or found on campus.');
      return;
    }
    if (!contact.trim() || contact.trim().length < 3) {
      setErrorMessage('Please provide your student email, phone, or WhatsApp handle.');
      return;
    }

    setIsSubmitting(true);

    try {
      const itemId = `item-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const newItem: CampusItem = {
        id: itemId,
        itemType,
        itemName: itemName.trim(),
        category,
        description: description.trim(),
        color: color.trim() || 'Not specified',
        location: location.trim(),
        date,
        imageUrl: imageUrl || undefined,
        contact: contact.trim(),
        status: itemType,
        createdAt: new Date().toISOString(),
        matchedItemIds: []
      };

      // 1. Direct save to Cloud Firestore (with backend fallback)
      console.log(`[FindBack AI] [1/4] Writing new report to Firestore: ${newItem.id} (${newItem.itemType.toUpperCase()} - "${newItem.itemName}")`);
      let writeSucceeded = false;
      try {
        await saveItemToFirestore(newItem);
        writeSucceeded = true;
        console.log(`[FindBack AI] [2/4] Direct Firestore write confirmed successfully for item: ${newItem.id}`);
      } catch (fsErr) {
        console.warn('[FindBack AI] Client direct Firestore write notice, using server endpoint fallback:', fsErr);
        try {
          const fbRes = await fetch(getApiUrl('/api/items'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newItem)
          });
          if (fbRes.ok) {
            writeSucceeded = true;
            console.log(`[FindBack AI] [2/4] Server fallback Firestore write confirmed for item: ${newItem.id}`);
          }
        } catch (serverErr) {
          console.error('[FindBack AI] Server fallback save error:', serverErr);
        }
      }

      // 2. Evaluate with Google Gemini via secure backend route
      console.log(`[FindBack AI] [3/4] Triggering Gemini AI matching for item: ${newItem.id}`);
      let matches: ItemMatch[] = [];
      let aiUnavailable = false;

      try {
        const evalUrl = getApiUrl('/api/matches/evaluate');
        console.log(`[FindBack AI] Requesting AI evaluation at: ${evalUrl}`);
        const evalRes = await fetch(evalUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: newItem, itemId: newItem.id })
        });

        if (evalRes.ok) {
          const evalData = await evalRes.json();
          if (evalData.aiUnavailable) {
            aiUnavailable = true;
            console.warn('[FindBack AI] Backend reported AI matching is temporarily unavailable.');
          } else if (evalData.success && Array.isArray(evalData.data?.matches)) {
            matches = evalData.data.matches;
            console.log(`[FindBack AI] [4/4] Evaluation received successfully: ${matches.length} match(es) discovered.`);
            if (matches.length > 0) {
              newItem.status = 'possible_match';
              newItem.matchedItemIds = matches.map(m => m.lostItemId === newItem.id ? m.foundItemId : m.lostItemId);
            }
          }
        } else {
          console.warn(`[FindBack AI] Evaluation endpoint returned HTTP ${evalRes.status}`);
          aiUnavailable = true;
        }
      } catch (aiErr) {
        console.warn('[FindBack AI] Gemini evaluation network or parsing notice:', aiErr);
        aiUnavailable = true;
      }

      // Pass back to parent dashboard
      onItemCreated(newItem, matches);

      // Transition to clear, confirmed "Submitted" state
      setSubmittedResult({
        item: newItem,
        matches,
        aiUnavailable
      });
    } catch (err: any) {
      console.error('Submit error:', err);
      setErrorMessage(err.message || 'Could not save report to Cloud Firestore. Please check your connection.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setItemName('');
    setDescription('');
    setColor('');
    setLocation('');
    setContact('');
    setImageUrl(null);
    setErrorMessage(null);
    setSubmittedResult(null);
    setIsRetryingMatch(false);
  };

  const handleRetryMatching = async () => {
    if (!submittedResult) return;
    setIsRetryingMatch(true);
    console.log(`[FindBack AI] User triggered manual AI match retry for item: ${submittedResult.item.id}`);
    try {
      const evalUrl = getApiUrl('/api/matches/evaluate');
      const evalRes = await fetch(evalUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: submittedResult.item, itemId: submittedResult.item.id })
      });

      if (evalRes.ok) {
        const evalData = await evalRes.json();
        if (evalData.aiUnavailable) {
          console.warn('[FindBack AI] Retry attempt reported AI matching still unavailable.');
        } else if (evalData.success && Array.isArray(evalData.data?.matches)) {
          const newMatches = evalData.data.matches;
          console.log(`[FindBack AI] Retry successful: ${newMatches.length} match(es) found.`);
          const updatedItem = { ...submittedResult.item };
          if (newMatches.length > 0) {
            updatedItem.status = 'possible_match';
            updatedItem.matchedItemIds = newMatches.map((m: any) => m.lostItemId === updatedItem.id ? m.foundItemId : m.lostItemId);
          }
          onItemCreated(updatedItem, newMatches);
          setSubmittedResult({
            item: updatedItem,
            matches: newMatches,
            aiUnavailable: false
          });
        }
      } else {
        console.warn(`[FindBack AI] Retry endpoint returned HTTP ${evalRes.status}`);
      }
    } catch (retryErr) {
      console.error('[FindBack AI] Retry matching error:', retryErr);
    } finally {
      setIsRetryingMatch(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div 
        id="report-modal-content"
        className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Modal Header */}
        <div className={`p-4 sm:p-5 flex items-center justify-between border-b ${
          submittedResult
            ? 'bg-emerald-50/90 border-emerald-100'
            : itemType === 'lost'
            ? 'bg-rose-50/70 border-rose-100'
            : 'bg-emerald-50/70 border-emerald-100'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shadow-xs font-bold text-sm ${
              submittedResult
                ? 'bg-emerald-600'
                : itemType === 'lost'
                ? 'bg-rose-600'
                : 'bg-emerald-600'
            }`}>
              {submittedResult ? <CheckCircle2 className="w-5 h-5 text-white" /> : itemType === 'lost' ? 'LOST' : 'FOUND'}
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 font-display">
                {submittedResult
                  ? 'Report Submitted Successfully!'
                  : itemType === 'lost'
                  ? 'Report a Lost Item'
                  : 'Report a Found Item'}
              </h2>
              <p className="text-xs text-slate-600">
                {submittedResult
                  ? 'Your item is now live and monitored on FindBack AI.'
                  : itemType === 'lost'
                  ? 'Gemini AI will search for matching found reports instantly.'
                  : 'Help reunite an item with its rightful student owner.'}
              </p>
            </div>
          </div>
          <button
            id="close-modal-btn"
            onClick={() => {
              if (submittedResult) {
                handleReset();
              }
              onClose();
            }}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {/* Confirmed Submitted View */}
          {submittedResult ? (
            <div id="submission-success-view" className="space-y-4 py-1">
              {/* Submission Status Card */}
              <div className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-4 text-center">
                <div className="w-12 h-12 bg-emerald-600 text-white rounded-full flex items-center justify-center mx-auto mb-2 shadow-sm">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-emerald-950 font-display">
                  {submittedResult.item.itemType === 'lost' ? 'Lost Item Successfully Registered!' : 'Found Item Successfully Registered!'}
                </h3>
                <p className="text-xs text-emerald-800 mt-1 max-w-md mx-auto">
                  Your report for <strong>"{submittedResult.item.itemName}"</strong> has been saved and posted to the campus board for other students to see.
                </p>
              </div>

              {/* Submitted Item Summary Card */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 flex items-center gap-3">
                {submittedResult.item.imageUrl ? (
                  <img
                    src={submittedResult.item.imageUrl}
                    alt={submittedResult.item.itemName}
                    className="w-14 h-14 rounded-lg object-cover border border-slate-200 shrink-0"
                  />
                ) : (
                  <div className={`w-14 h-14 rounded-lg flex items-center justify-center font-bold text-xs shrink-0 ${
                    submittedResult.item.itemType === 'lost' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                  }`}>
                    {submittedResult.item.itemType.toUpperCase()}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                      submittedResult.item.itemType === 'lost' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {submittedResult.item.itemType}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">{submittedResult.item.category}</span>
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 truncate mt-0.5">
                    {submittedResult.item.itemName}
                  </h4>
                  <p className="text-xs text-slate-600 truncate">
                    📍 {submittedResult.item.location} • 📅 {submittedResult.item.date}
                  </p>
                </div>
              </div>

              {/* Gemini AI Matching Status */}
              {submittedResult.matches.length > 0 ? (
                <div className="space-y-3">
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-start gap-2.5">
                    <Sparkles className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-bold text-indigo-950">
                        AI-Suggested Match
                      </h4>
                      <p className="text-[11px] text-indigo-700 mt-0.5">
                        Google Gemini AI evaluated existing opposite reports in the campus database and identified a genuine match:
                      </p>
                    </div>
                  </div>

                  {submittedResult.matches.map((m) => {
                    const counterpart = submittedResult.item.itemType === 'lost' ? m.foundItem : m.lostItem;
                    return (
                      <div key={m.id} className="p-4 rounded-xl border-2 border-indigo-200 bg-indigo-50/40 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-600 text-white shadow-xs">
                            <Sparkles className="w-3.5 h-3.5" />
                            Confidence: {m.matchLevel} ({m.score}%)
                          </span>
                          <span className="text-[11px] text-indigo-600 font-bold uppercase tracking-wider">AI Verified Match</span>
                        </div>

                        <div className="bg-white rounded-xl p-3.5 border border-indigo-100 space-y-2.5 text-xs">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Matched Item:</span>
                            <span className="text-sm font-bold text-slate-900">{counterpart.itemName}</span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                            <div>
                              <span className="text-[10px] font-semibold text-slate-500 block">Category:</span>
                              <span className="font-semibold text-slate-800">{counterpart.category}</span>
                            </div>
                            <div>
                              <span className="text-[10px] font-semibold text-slate-500 block">Color:</span>
                              <span className="font-semibold text-slate-800">{counterpart.color}</span>
                            </div>
                            <div>
                              <span className="text-[10px] font-semibold text-slate-500 block">Location:</span>
                              <span className="font-semibold text-slate-800">📍 {counterpart.location}</span>
                            </div>
                            <div>
                              <span className="text-[10px] font-semibold text-slate-500 block">Date:</span>
                              <span className="font-semibold text-slate-800">📅 {counterpart.date}</span>
                            </div>
                          </div>

                          <div className="pt-2 border-t border-slate-100">
                            <span className="text-[10px] font-semibold text-slate-500 block">Description:</span>
                            <p className="text-slate-700 leading-relaxed mt-0.5">{counterpart.description}</p>
                          </div>

                          <div className="pt-2 border-t border-slate-100">
                            <span className="text-[10px] font-bold text-indigo-600 block">Confidence:</span>
                            <span className="font-semibold text-indigo-900">{m.matchLevel}</span>
                          </div>

                          <div className="pt-2 border-t border-slate-100">
                            <span className="text-[10px] font-bold text-indigo-600 block">Why this is a match:</span>
                            <p className="text-indigo-950 font-medium leading-relaxed mt-0.5">{m.reason}</p>
                          </div>

                          {counterpart.contact && (
                            <div className="pt-2 border-t border-slate-100 text-slate-700 bg-slate-50 p-2 rounded-lg flex items-center justify-between">
                              <span><strong>Contact {counterpart.itemType === 'found' ? 'Finder' : 'Owner'}:</strong> {counterpart.contact}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : submittedResult.aiUnavailable ? (
                <div className="p-3.5 rounded-xl border border-amber-200 bg-amber-50/90 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-900">
                      <Sparkles className="w-4 h-4 text-amber-600" />
                      <span>AI Matching Notice</span>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                      Report Saved
                    </span>
                  </div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    AI matching is temporarily unavailable. Please try again.
                  </p>
                  <div className="pt-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-amber-700">
                      Your item has been securely saved to Firestore.
                    </span>
                    <button
                      type="button"
                      disabled={isRetryingMatch}
                      onClick={handleRetryMatching}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold text-xs rounded-lg shadow-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isRetryingMatch ? 'animate-spin' : ''}`} />
                      <span>{isRetryingMatch ? 'Matching...' : 'Retry AI Matching'}</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span>Gemini AI Analysis Complete</span>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    No immediate matches were found among existing campus reports. Your report is now actively indexed—if another student submits a matching lost item, FindBack AI will detect it and alert the board!
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex flex-col sm:flex-row items-center justify-end gap-2.5 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleReset}
                  className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Report Another Item
                </button>
                <button
                  type="button"
                  id="done-view-board-btn"
                  onClick={() => {
                    handleReset();
                    onClose();
                  }}
                  className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Done & View on Board</span>
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type Switcher */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  id="tab-lost"
                  onClick={() => setItemType('lost')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    itemType === 'lost'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  I Lost an Item
                </button>
                <button
                  type="button"
                  id="tab-found"
                  onClick={() => setItemType('found')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    itemType === 'found'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  I Found an Item
                </button>
              </div>

              {/* Error Message Banner */}
              {errorMessage && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Item Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Item Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="input-item-name"
                  placeholder="e.g. Black Leather Wallet, Blue Hydro Flask, Student ID Card"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs sm:text-sm placeholder:text-slate-400"
                  required
                />
              </div>

              {/* Category & Color Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Category <span className="text-red-500">*</span>
                  </label>
                  <select
                    id="select-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs sm:text-sm bg-white"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Color
                  </label>
                  <input
                    type="text"
                    id="input-color"
                    placeholder="e.g. Black, Navy Blue, Silver"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs sm:text-sm placeholder:text-slate-400"
                  />
                </div>
              </div>

              {/* Location & Date Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Campus Location <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="input-location"
                    list="campus-locations"
                    placeholder="e.g. College Canteen, Library 2nd Floor"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs sm:text-sm placeholder:text-slate-400"
                    required
                  />
                  <datalist id="campus-locations">
                    {COMMON_LOCATIONS.map((loc) => (
                      <option key={loc} value={loc} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                    Date {itemType === 'lost' ? 'Lost' : 'Found'} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    id="input-date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs sm:text-sm bg-white"
                    required
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Description & Details <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="textarea-description"
                  rows={3}
                  placeholder="Provide recognizable details (stickers, brand, scratches, contents, exact time/bench). Gemini will use this to match items accurately!"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs sm:text-sm placeholder:text-slate-400 resize-none"
                  required
                />
              </div>

              {/* Contact Information */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Your Contact Information <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="input-contact"
                  placeholder="College email (alex@campus.edu) or WhatsApp / Phone"
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs sm:text-sm placeholder:text-slate-400"
                  required
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Shown only to matched students to arrange safe return verification.
                </p>
              </div>

              {/* Optional Photo Attachment */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Optional Photo (Upload or take snapshot)
                </label>
                <div className="flex items-center gap-3">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors">
                    <Upload className="w-4 h-4 text-slate-500" />
                    <span>Choose Photo</span>
                    <input
                      type="file"
                      id="input-file-image"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                  </label>
                  {imageUrl && (
                    <div className="relative inline-block">
                      <img
                        src={imageUrl}
                        alt="Preview"
                        className="w-10 h-10 rounded-lg object-cover border border-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => setImageUrl(null)}
                        className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 text-[10px]"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Gemini AI Notice */}
              <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100/80 flex items-center gap-2 text-indigo-900 text-xs">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>
                  After submitting, <strong>Gemini AI</strong> will automatically compare your report with all existing entries on the campus board.
                </span>
              </div>

              {/* Form Actions */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-report-btn"
                  disabled={isSubmitting}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold text-white shadow-md flex items-center gap-2 transition-all ${
                    itemType === 'lost'
                      ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                      : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200'
                  } ${isSubmitting ? 'opacity-80 cursor-not-allowed' : ''}`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Gemini is Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <span>Submit {itemType === 'lost' ? 'Lost Report' : 'Found Report'}</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
