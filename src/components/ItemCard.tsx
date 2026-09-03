import React from 'react';
import { MapPin, Calendar, Sparkles, CheckCircle2, Mail, Tag, Eye } from 'lucide-react';
import { CampusItem } from '../types';

interface ItemCardProps {
  item: CampusItem;
  onViewMatch?: (itemId: string) => void;
  onMarkReturned: (itemId: string) => void;
  onQuickContact: (item: CampusItem) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({
  item,
  onViewMatch,
  onMarkReturned,
  onQuickContact,
}) => {
  const isLost = item.itemType === 'lost';
  const hasMatch = item.status === 'possible_match' || (item.matchedItemIds && item.matchedItemIds.length > 0);
  const isReturned = item.status === 'returned';

  const getStatusBadge = () => {
    switch (item.status) {
      case 'returned':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
            <CheckCircle2 className="w-3 h-3 text-slate-500" />
            Returned
          </span>
        );
      case 'possible_match':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 border border-indigo-300 animate-pulse">
            <Sparkles className="w-3 h-3 text-indigo-600" />
            Possible Match
          </span>
        );
      case 'lost':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
            Lost
          </span>
        );
      case 'found':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
            Found
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div 
      id={`item-card-${item.id}`}
      className={`bg-white rounded-2xl border transition-all duration-200 flex flex-col justify-between overflow-hidden hover:shadow-md ${
        hasMatch && !isReturned
          ? 'border-indigo-300 ring-1 ring-indigo-200 shadow-xs'
          : 'border-slate-200 shadow-2xs hover:border-slate-300'
      }`}
    >
      {/* Top Banner & Badges */}
      <div className="p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md tracking-wider ${
                isLost ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              }`}
            >
              {isLost ? 'Lost Item' : 'Found Item'}
            </span>
            {getStatusBadge()}
          </div>
          <span className="text-[11px] text-slate-600 flex items-center gap-1 shrink-0">
            <Calendar className="w-3 h-3" />
            {item.date}
          </span>
        </div>

        {/* Title and Category */}
        <div>
          <h3 className="text-base font-bold text-slate-900 tracking-tight line-clamp-1">
            {item.itemName}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
              {item.category}
            </span>
            {item.color && item.color !== 'Not specified' && (
              <span className="text-[11px] font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                Color: {item.color}
              </span>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
          {item.description}
        </p>

        {/* Location Tag */}
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="line-clamp-1">{item.location}</span>
        </div>

        {/* Image preview if present */}
        {item.imageUrl && (
          <div className="mt-2 h-32 w-full overflow-hidden rounded-xl border border-slate-100">
            <img
              src={item.imageUrl}
              alt={item.itemName}
              className="w-full h-full object-cover"
            />
          </div>
        )}
      </div>

      {/* Card Footer Actions */}
      <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-100 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => onQuickContact(item)}
          className="text-xs font-semibold text-slate-600 hover:text-slate-900 flex items-center gap-1 transition-colors"
        >
          <Mail className="w-3.5 h-3.5 text-slate-500" />
          <span>Contact</span>
        </button>

        <div className="flex items-center gap-1.5">
          {hasMatch && onViewMatch && (
            <button
              type="button"
              id={`view-match-btn-${item.id}`}
              onClick={() => onViewMatch(item.id)}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs flex items-center gap-1 transition-all"
            >
              <Sparkles className="w-3 h-3" />
              <span>View AI Match</span>
            </button>
          )}

          {!isReturned ? (
            <button
              type="button"
              id={`mark-returned-btn-${item.id}`}
              onClick={() => onMarkReturned(item.id)}
              title="Mark item as returned to rightful owner"
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 text-xs font-semibold transition-colors"
            >
              Mark Returned
            </button>
          ) : (
            <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              Returned
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
