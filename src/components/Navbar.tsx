import React from 'react';
import { Sparkles, PlusCircle, Search, Compass, ShieldCheck, RefreshCw } from 'lucide-react';

interface NavbarProps {
  currentView: 'home' | 'dashboard' | 'matches';
  onNavigate: (view: 'home' | 'dashboard' | 'matches') => void;
  onOpenReport: (type: 'lost' | 'found') => void;
  matchesCount: number;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentView,
  onNavigate,
  onOpenReport,
  matchesCount,
  onRefresh,
  isRefreshing = false
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo */}
          <div 
            id="brand-logo"
            onClick={() => onNavigate('home')}
            className="flex items-center gap-3 cursor-pointer group select-none"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-700 to-blue-500 flex items-center justify-center text-white shadow-md shadow-indigo-200 group-hover:scale-105 transition-transform duration-200">
              <Sparkles className="w-5 h-5 text-indigo-100" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-lg sm:text-xl tracking-tight text-slate-900 font-display">
                  FindBack<span className="text-indigo-600">AI</span>
                </span>
                <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider border border-indigo-200">
                  Campus
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium hidden sm:block">Smart Lost & Found</p>
            </div>
          </div>

          {/* Center Navigation Links */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 p-1 rounded-xl border border-slate-200/60">
            <button
              id="nav-home-btn"
              onClick={() => onNavigate('home')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                currentView === 'home'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              Home
            </button>
            <button
              id="nav-dashboard-btn"
              onClick={() => onNavigate('dashboard')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all ${
                currentView === 'dashboard'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Lost & Found Board</span>
            </button>
            <button
              id="nav-matches-btn"
              onClick={() => onNavigate('matches')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all relative ${
                currentView === 'matches'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>AI Matches</span>
              {matchesCount > 0 && (
                <span className="ml-0.5 bg-indigo-600 text-white text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-4 text-center">
                  {matchesCount}
                </span>
              )}
            </button>
          </nav>

          {/* Right Actions */}
          <div className="flex items-center gap-2">
            <button
              id="refresh-btn"
              onClick={onRefresh}
              disabled={isRefreshing}
              title="Refresh campus board"
              className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            </button>

            <button
              id="btn-report-lost-nav"
              onClick={() => onOpenReport('lost')}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold rounded-lg text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              <span>Report Lost</span>
            </button>

            <button
              id="btn-report-found-nav"
              onClick={() => onOpenReport('found')}
              className="px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold rounded-lg text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors flex items-center gap-1.5 shadow-2xs"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              <span>Report Found</span>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Sub-Bar */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-100 text-xs font-medium text-slate-600">
          <button
            onClick={() => onNavigate('home')}
            className={`py-1 px-2.5 rounded-md ${currentView === 'home' ? 'text-indigo-600 font-bold bg-indigo-50' : ''}`}
          >
            Home
          </button>
          <button
            onClick={() => onNavigate('dashboard')}
            className={`py-1 px-2.5 rounded-md ${currentView === 'dashboard' ? 'text-indigo-600 font-bold bg-indigo-50' : ''}`}
          >
            All Items
          </button>
          <button
            onClick={() => onNavigate('matches')}
            className={`py-1 px-2.5 rounded-md flex items-center gap-1 ${currentView === 'matches' ? 'text-indigo-600 font-bold bg-indigo-50' : ''}`}
          >
            <span>AI Matches</span>
            {matchesCount > 0 && (
              <span className="bg-indigo-600 text-white text-[10px] font-bold px-1.5 rounded-full">
                {matchesCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
