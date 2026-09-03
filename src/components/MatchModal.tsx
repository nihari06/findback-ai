import React, { useState } from 'react';
import { X, Sparkles, CheckCircle2, Phone, Mail, MapPin, Calendar, Tag, ShieldCheck, ArrowRight, Share2, Info } from 'lucide-react';
import { ItemMatch } from '../types';

interface MatchModalProps {
  match: ItemMatch | null;
  isOpen: boolean;
  onClose: () => void;
  onMarkReturned: (itemId: string) => Promise<void>;
}

export const MatchModal: React.FC<MatchModalProps> = ({
  match,
  isOpen,
  onClose,
  onMarkReturned,
}) => {
  const [showContactDetails, setShowContactDetails] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isConfirmedReturned, setIsConfirmedReturned] = useState(false);

  if (!isOpen || !match) return null;

  const getMatchBadgeStyle = (level: string) => {
    switch (level) {
      case 'High':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'Medium':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  const handleReturnAction = async () => {
    setIsUpdating(true);
    try {
      await onMarkReturned(match.lostItemId);
      setIsConfirmedReturned(true);
    } catch (err) {
      console.error('Error marking returned:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const isAlreadyReturned = match.lostItem.status === 'returned' || match.foundItem.status === 'returned' || isConfirmedReturned;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div 
        id="ai-match-modal-container"
        className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-indigo-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold tracking-tight">
                  Possible Match Found
                </h3>
                <span className={`text-[11px] font-extrabold px-2.5 py-0.5 rounded-full border ${getMatchBadgeStyle(match.matchLevel)}`}>
                  {match.matchLevel} Match ({match.score}%)
                </span>
              </div>
              <p className="text-[11px] text-indigo-200 font-medium">
                Identified by Google Gemini AI • AI-Suggested Match
              </p>
            </div>
          </div>
          <button
            id="close-match-modal-btn"
            onClick={onClose}
            className="p-1.5 text-indigo-200 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5">
          {/* AI Explanation Banner */}
          <div className="bg-indigo-50/80 border border-indigo-200/80 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 uppercase tracking-wider">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>AI Match Analysis</span>
            </div>
            <p className="text-xs sm:text-sm text-slate-800 font-medium leading-relaxed">
              <span className="font-bold text-indigo-900">Why these items match: </span>
              "{match.reason}"
            </p>

            {match.keyFactors && match.keyFactors.length > 0 && (
              <div className="pt-2 flex flex-wrap gap-1.5">
                {match.keyFactors.map((factor, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1 text-[11px] bg-white border border-indigo-200/70 text-indigo-800 px-2 py-0.5 rounded-md font-medium shadow-2xs"
                  >
                    <CheckCircle2 className="w-3 h-3 text-indigo-600" />
                    {factor}
                  </span>
                ))}
              </div>
            )}

            <div className="pt-1 flex items-center gap-1 text-[11px] text-indigo-700/80 italic">
              <Info className="w-3 h-3 shrink-0" />
              <span>AI results are suggestions to assist discovery. Always verify item ownership safely before handover.</span>
            </div>
          </div>

          {/* Side-by-Side Comparison */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Lost Item Card */}
            <div className="bg-rose-50/40 rounded-xl border border-rose-200/70 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-rose-100 pb-2">
                <span className="text-[11px] font-bold text-rose-700 bg-rose-100/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Lost Item
                </span>
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {match.lostItem.date}
                </span>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900">{match.lostItem.itemName}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                    {match.lostItem.category}
                  </span>
                  {match.lostItem.color && (
                    <span className="text-[11px] text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      Color: {match.lostItem.color}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-xs text-slate-700 bg-white/70 p-2.5 rounded-lg border border-rose-100/60 leading-relaxed">
                {match.lostItem.description}
              </div>

              <div className="text-xs text-slate-600 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                <span className="font-medium">Lost at: {match.lostItem.location}</span>
              </div>

              {match.lostItem.imageUrl && (
                <div className="mt-2">
                  <img
                    src={match.lostItem.imageUrl}
                    alt={match.lostItem.itemName}
                    className="w-full h-32 object-cover rounded-lg border border-rose-200"
                  />
                </div>
              )}
            </div>

            {/* Found Item Card */}
            <div className="bg-emerald-50/40 rounded-xl border border-emerald-200/70 p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-100 pb-2">
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-md uppercase tracking-wider">
                  Found Item
                </span>
                <span className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {match.foundItem.date}
                </span>
              </div>

              <div>
                <h4 className="text-sm font-bold text-slate-900">{match.foundItem.itemName}</h4>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[11px] text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                    {match.foundItem.category}
                  </span>
                  {match.foundItem.color && (
                    <span className="text-[11px] text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                      Color: {match.foundItem.color}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-xs text-slate-700 bg-white/70 p-2.5 rounded-lg border border-emerald-100/60 leading-relaxed">
                {match.foundItem.description}
              </div>

              <div className="text-xs text-slate-600 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="font-medium">Found at: {match.foundItem.location}</span>
              </div>

              {match.foundItem.imageUrl && (
                <div className="mt-2">
                  <img
                    src={match.foundItem.imageUrl}
                    alt={match.foundItem.itemName}
                    className="w-full h-32 object-cover rounded-lg border border-emerald-200"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Contact Details Drawer */}
          {showContactDetails ? (
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-3 animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  Contact & Verification Details
                </h5>
                <span className="text-[11px] text-slate-500">Student Safety First</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                  <p className="font-bold text-slate-900">Finder's Contact:</p>
                  <p className="text-indigo-600 font-semibold">{match.foundItem.contact}</p>
                  <a
                    href={`mailto:${match.foundItem.contact}?subject=FindBack AI: Lost Item Claim (${match.lostItem.itemName})`}
                    className="inline-block text-[11px] text-indigo-600 underline font-medium mt-1"
                  >
                    Send Email via Mail App
                  </a>
                </div>

                <div className="p-3 bg-white rounded-lg border border-slate-200 space-y-1">
                  <p className="font-bold text-slate-900">Owner's Contact:</p>
                  <p className="text-rose-600 font-semibold">{match.lostItem.contact}</p>
                  <a
                    href={`mailto:${match.lostItem.contact}?subject=FindBack AI: Found Item Match (${match.foundItem.itemName})`}
                    className="inline-block text-[11px] text-rose-600 underline font-medium mt-1"
                  >
                    Send Email via Mail App
                  </a>
                </div>
              </div>

              <div className="text-[11px] text-slate-600 bg-amber-50 border border-amber-200 p-2.5 rounded-lg">
                💡 <strong>Safety Tip:</strong> Meet in a public campus area (e.g. Library Desk or Canteen Entrance) and ask for distinguishing confirmation (contents, lock code, or student ID verification) before handing over the item.
              </div>
            </div>
          ) : null}

          {/* Return Status Banner */}
          {isAlreadyReturned && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-emerald-900 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>This item has been confirmed as reunited and marked as <strong>Returned</strong>! 🎉</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
            <button
              id="toggle-contact-btn"
              type="button"
              onClick={() => setShowContactDetails(!showContactDetails)}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-indigo-300 text-indigo-700 bg-indigo-50/60 hover:bg-indigo-100 text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-2xs"
            >
              <Mail className="w-3.5 h-3.5" />
              <span>{showContactDetails ? 'Hide Contact Details' : 'Contact / Claim Item'}</span>
            </button>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {!isAlreadyReturned ? (
                <button
                  id="confirm-returned-btn"
                  type="button"
                  onClick={handleReturnAction}
                  disabled={isUpdating}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md shadow-emerald-200 flex items-center justify-center gap-2 transition-all disabled:opacity-75"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isUpdating ? 'Updating Status...' : 'Confirm & Mark as Returned'}</span>
                </button>
              ) : (
                <span className="px-4 py-2 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  Status: Returned
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
