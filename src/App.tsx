import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, 
  Search, 
  PlusCircle, 
  Compass, 
  CheckCircle2, 
  AlertCircle, 
  MapPin, 
  Calendar, 
  Filter, 
  ArrowRight, 
  Layers, 
  ShieldCheck, 
  HelpCircle,
  Mail,
  Phone,
  X,
  RefreshCw,
  SlidersHorizontal,
  Bot
} from 'lucide-react';

import { Navbar } from './components/Navbar';
import { ReportModal } from './components/ReportModal';
import { MatchModal } from './components/MatchModal';
import { ItemCard } from './components/ItemCard';
import { DemoScenarioBanner } from './components/DemoScenarioBanner';
import { CampusItem, ItemMatch, ItemType, ItemStatus } from './types';

export default function App() {
  // Navigation
  const [currentView, setCurrentView] = useState<'home' | 'dashboard' | 'matches'>('home');

  // Application Data State
  const [items, setItems] = useState<CampusItem[]>([]);
  const [matches, setMatches] = useState<ItemMatch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportModalType, setReportModalType] = useState<ItemType>('lost');
  const [selectedMatch, setSelectedMatch] = useState<ItemMatch | null>(null);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [contactItem, setContactItem] = useState<CampusItem | null>(null);

  // Filters for Dashboard
  const [filterType, setFilterType] = useState<string>('all'); // 'all', 'lost', 'found', 'matches', 'returned'
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [locationFilter, setLocationFilter] = useState('all');

  // Fetch Items and Matches from Backend
  const fetchData = async () => {
    try {
      setErrorMessage(null);
      const [itemsRes, matchesRes] = await Promise.all([
        fetch('/api/items'),
        fetch('/api/matches')
      ]);

      const itemsJson = await itemsRes.json();
      const matchesJson = await matchesRes.json();

      if (itemsJson.success && Array.isArray(itemsJson.data)) {
        setItems(itemsJson.data);
      }
      if (matchesJson.success && Array.isArray(matchesJson.data)) {
        setMatches(matchesJson.data);
      }
    } catch (err: any) {
      console.error('Fetch error:', err);
      setErrorMessage('Could not connect to the campus server. Please check your connection.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchData();
  };

  // Open Report Modal
  const handleOpenReport = (type: ItemType) => {
    setReportModalType(type);
    setIsReportModalOpen(true);
  };

  // Handler when a new item is created
  const handleItemCreated = (newItem: CampusItem, newMatches: ItemMatch[]) => {
    setItems(prev => [newItem, ...prev]);
    if (newMatches.length > 0) {
      setMatches(prev => [...newMatches, ...prev]);
    }
  };

  // Mark an item as Returned
  const handleMarkReturned = async (itemId: string) => {
    try {
      const response = await fetch(`/api/items/${itemId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'returned' })
      });
      const data = await response.json();
      if (data.success) {
        setItems(prev => prev.map(item => {
          if (item.id === itemId) return { ...item, status: 'returned' };
          if (item.matchedItemIds?.includes(itemId)) return { ...item, status: 'returned' };
          return item;
        }));
      }
    } catch (err) {
      console.error('Update status error:', err);
    }
  };

  // Trigger Demo Scenario
  const handleTriggerDemo = async () => {
    try {
      const response = await fetch('/api/seed-demo', { method: 'POST' });
      const data = await response.json();
      if (data.success) {
        await fetchData();
        if (data.data?.match) {
          setSelectedMatch(data.data.match);
        }
      }
    } catch (err) {
      console.error('Demo error:', err);
    }
  };

  // View Match from an Item
  const handleViewMatchForItem = (itemId: string) => {
    const foundMatch = matches.find(m => m.lostItemId === itemId || m.foundItemId === itemId);
    if (foundMatch) {
      setSelectedMatch(foundMatch);
      setIsMatchModalOpen(true);
    } else {
      setCurrentView('matches');
    }
  };

  // Filtered Items Calculation
  const categoriesList = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => set.add(i.category));
    return Array.from(set);
  }, [items]);

  const locationsList = useMemo(() => {
    const set = new Set<string>();
    items.forEach(i => set.add(i.location));
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    return items.filter(item => {
      // Type filter
      if (filterType === 'lost' && item.itemType !== 'lost') return false;
      if (filterType === 'found' && item.itemType !== 'found') return false;
      if (filterType === 'returned' && item.status !== 'returned') return false;
      if (filterType === 'matches' && item.status !== 'possible_match') return false;

      // Category filter
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;

      // Location filter
      if (locationFilter !== 'all' && item.location !== locationFilter) return false;

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSearch = 
          item.itemName.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.location.toLowerCase().includes(q) ||
          item.color.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q);
        if (!matchesSearch) return false;
      }

      return true;
    });
  }, [items, filterType, categoryFilter, locationFilter, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const total = items.length;
    const lostCount = items.filter(i => i.itemType === 'lost').length;
    const foundCount = items.filter(i => i.itemType === 'found').length;
    const matchesCount = matches.length;
    const returnedCount = items.filter(i => i.status === 'returned').length;
    return { total, lostCount, foundCount, matchesCount, returnedCount };
  }, [items, matches]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans">
      {/* Navbar */}
      <Navbar
        currentView={currentView}
        onNavigate={setCurrentView}
        onOpenReport={handleOpenReport}
        matchesCount={matches.length}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-8">
        {/* Error Banner if any */}
        {errorMessage && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button
              onClick={handleRefresh}
              className="font-bold underline ml-4 hover:text-red-900"
            >
              Retry
            </button>
          </div>
        )}

        {/* 1. HOME VIEW */}
        {currentView === 'home' && (
          <div className="space-y-10 animate-in fade-in duration-300">
            {/* Hero Section */}
            <section id="hero-section" className="relative rounded-3xl bg-gradient-to-b from-indigo-950 via-slate-900 to-slate-950 text-white p-6 sm:p-12 overflow-hidden shadow-xl border border-indigo-900/40">
              <div className="absolute -right-16 -top-16 w-80 h-80 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none"></div>
              <div className="absolute -left-16 -bottom-16 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none"></div>

              <div className="relative z-10 max-w-3xl space-y-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 text-xs font-semibold">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Powered by Google Gemini AI & Firebase</span>
                </div>

                <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight font-display leading-tight text-white">
                  Find your lost items faster with <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-sky-300 to-blue-400">AI</span>.
                </h1>

                <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed">
                  Lost an ID card, wallet, keys, or water bottle on campus? Instead of asking across noisy chat groups, FindBack AI uses Gemini to analyze descriptions and instantly match lost and found reports.
                </p>

                {/* Primary Action Buttons */}
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <button
                    id="btn-report-lost-hero"
                    onClick={() => handleOpenReport('lost')}
                    className="px-5 py-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-rose-900/40 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                    <span>Report Lost Item</span>
                  </button>

                  <button
                    id="btn-report-found-hero"
                    onClick={() => handleOpenReport('found')}
                    className="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs sm:text-sm shadow-lg shadow-emerald-900/40 flex items-center gap-2 transition-all cursor-pointer"
                  >
                    <PlusCircle className="w-4 h-4" />
                    <span>Report Found Item</span>
                  </button>

                  <button
                    id="btn-view-board-hero"
                    onClick={() => setCurrentView('dashboard')}
                    className="px-5 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs sm:text-sm flex items-center gap-2 transition-colors cursor-pointer"
                  >
                    <Compass className="w-4 h-4" />
                    <span>View Lost & Found Items</span>
                  </button>
                </div>
              </div>

              {/* Stat Chips in Hero */}
              <div className="mt-8 pt-8 border-t border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                  <div className="text-xl sm:text-2xl font-black text-white font-display">{stats.total}</div>
                  <div className="text-[11px] text-slate-400 font-medium">Campus Reports</div>
                </div>
                <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                  <div className="text-xl sm:text-2xl font-black text-indigo-400 font-display">{stats.matchesCount}</div>
                  <div className="text-[11px] text-slate-400 font-medium">AI Matches Discovered</div>
                </div>
                <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                  <div className="text-xl sm:text-2xl font-black text-rose-400 font-display">{stats.lostCount}</div>
                  <div className="text-[11px] text-slate-400 font-medium">Items Reported Lost</div>
                </div>
                <div className="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                  <div className="text-xl sm:text-2xl font-black text-emerald-400 font-display">{stats.returnedCount}</div>
                  <div className="text-[11px] text-slate-400 font-medium">Items Returned</div>
                </div>
              </div>
            </section>

            {/* Official Demo Scenario Section */}
            <DemoScenarioBanner
              onTriggerDemo={handleTriggerDemo}
              onOpenMatch={() => {
                if (matches.length > 0) {
                  setSelectedMatch(matches[0]);
                  setIsMatchModalOpen(true);
                } else {
                  setCurrentView('matches');
                }
              }}
            />

            {/* Recent Items Preview Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg sm:text-xl font-bold font-display text-slate-900">
                    Recent Campus Reports
                  </h2>
                  <p className="text-xs text-slate-500">
                    Latest items reported by students across campus
                  </p>
                </div>
                <button
                  id="view-all-items-link"
                  onClick={() => setCurrentView('dashboard')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 transition-colors"
                >
                  <span>Explore All Items</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {isLoading ? (
                <div className="p-12 text-center text-slate-400">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-600" />
                  <p className="text-xs font-medium">Loading campus board...</p>
                </div>
              ) : items.length === 0 ? (
                <div className="p-8 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
                  <p className="text-sm font-semibold text-slate-700">No items reported yet.</p>
                  <button
                    onClick={() => handleOpenReport('lost')}
                    className="px-4 py-2 bg-indigo-600 text-white font-bold text-xs rounded-xl"
                  >
                    Report First Item
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {items.slice(0, 6).map(item => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onViewMatch={handleViewMatchForItem}
                      onMarkReturned={handleMarkReturned}
                      onQuickContact={setContactItem}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* How Gemini AI Works Section */}
            <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-indigo-700">
                <Bot className="w-4 h-4 text-indigo-600" />
                <span>How FindBack AI Works</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                    1
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">Natural Language Reports</h4>
                  <p className="text-slate-600 leading-relaxed">
                    Students submit normal conversational descriptions like "Blue water bottle left near the 2nd floor library reading desk".
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                    2
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">Gemini Multimodal Analysis</h4>
                  <p className="text-slate-600 leading-relaxed">
                    Google Gemini compares item type, brand, colors, campus locations, timeline, and contextual identifiers to discover matches.
                  </p>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white font-bold flex items-center justify-center text-xs">
                    3
                  </div>
                  <h4 className="font-bold text-slate-900 text-sm">Verified Reconnection</h4>
                  <p className="text-slate-600 leading-relaxed">
                    Students review the AI match reasoning, securely connect to verify ownership, and update status to Returned.
                  </p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* 2. DASHBOARD VIEW (Lost & Found Items) */}
        {currentView === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header & Filter Controls */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h1 className="text-2xl font-extrabold text-slate-900 font-display tracking-tight">
                    Lost & Found Dashboard
                  </h1>
                  <p className="text-xs text-slate-500">
                    Search and filter all items reported on campus
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenReport('lost')}
                    className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs transition-colors"
                  >
                    + Report Lost
                  </button>
                  <button
                    onClick={() => handleOpenReport('found')}
                    className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-xs transition-colors"
                  >
                    + Report Found
                  </button>
                </div>
              </div>

              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                {[
                  { id: 'all', label: 'All Items', count: stats.total },
                  { id: 'lost', label: 'Lost Items', count: stats.lostCount },
                  { id: 'found', label: 'Found Items', count: stats.foundCount },
                  { id: 'matches', label: 'Possible Matches', count: items.filter(i => i.status === 'possible_match').length },
                  { id: 'returned', label: 'Returned', count: stats.returnedCount },
                ].map(tab => (
                  <button
                    key={tab.id}
                    id={`filter-tab-${tab.id}`}
                    onClick={() => setFilterType(tab.id)}
                    className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 whitespace-nowrap transition-all ${
                      filterType === tab.id
                        ? 'bg-slate-900 text-white shadow-xs'
                        : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{tab.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      filterType === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {tab.count}
                    </span>
                  </button>
                ))}
              </div>

              {/* Search Bar & Dropdowns */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs grid grid-cols-1 sm:grid-cols-12 gap-3">
                {/* Search Bar */}
                <div className="sm:col-span-6 relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    id="search-input"
                    placeholder="Search by keyword, item name, color, or location..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-9 pr-3.5 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-xs sm:text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Category Filter */}
                <div className="sm:col-span-3">
                  <select
                    id="filter-category"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="all">All Categories</option>
                    {categoriesList.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                {/* Location Filter */}
                <div className="sm:col-span-3">
                  <select
                    id="filter-location"
                    value={locationFilter}
                    onChange={(e) => setLocationFilter(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs sm:text-sm bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="all">All Locations</option>
                    {locationsList.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Results Grid */}
            {filteredItems.length === 0 ? (
              <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
                <Compass className="w-8 h-8 text-slate-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-700">No items match your criteria</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Try clearing your search query or filters to see all campus items.
                </p>
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setCategoryFilter('all');
                    setLocationFilter('all');
                    setFilterType('all');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors"
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredItems.map(item => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onViewMatch={handleViewMatchForItem}
                    onMarkReturned={handleMarkReturned}
                    onQuickContact={setContactItem}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* 3. AI MATCHES VIEW */}
        {currentView === 'matches' && (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-extrabold text-slate-900 font-display tracking-tight">
                  AI Suggested Matches
                </h1>
                <span className="bg-indigo-100 text-indigo-800 text-xs font-extrabold px-2.5 py-0.5 rounded-full border border-indigo-200">
                  {matches.length} Discovered
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Evaluated by Google Gemini AI by comparing item attributes, descriptions, and campus locations.
              </p>
            </div>

            {matches.length === 0 ? (
              <div className="p-12 bg-white rounded-2xl border border-slate-200 text-center space-y-3">
                <Sparkles className="w-8 h-8 text-indigo-300 mx-auto" />
                <h4 className="text-sm font-bold text-slate-700">No AI Matches Found Yet</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  When students report lost and found items, Gemini automatically analyzes the records and creates intelligent suggestions here.
                </p>
                <button
                  onClick={handleTriggerDemo}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs"
                >
                  Load Demo Canteen Wallet Match
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4">
                {matches.map(m => (
                  <div
                    key={m.id}
                    id={`match-card-${m.id}`}
                    onClick={() => {
                      setSelectedMatch(m);
                      setIsMatchModalOpen(true);
                    }}
                    className="bg-white rounded-2xl border border-indigo-200/80 p-5 shadow-xs hover:shadow-md transition-all cursor-pointer space-y-4 hover:border-indigo-400 group"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 text-xs font-extrabold px-3 py-1 rounded-full bg-indigo-600 text-white shadow-xs">
                          <Sparkles className="w-3.5 h-3.5" />
                          Possible Match – {m.matchLevel} ({m.score}%)
                        </span>
                        <span className="text-[11px] text-slate-400">• AI Suggested</span>
                      </div>
                      <span className="text-xs text-indigo-600 font-bold group-hover:translate-x-1 transition-transform flex items-center gap-1">
                        <span>View Full Comparison & Contact</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>

                    {/* Gemini Explanation */}
                    <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-100 text-xs text-indigo-950 font-medium">
                      <span className="font-bold text-indigo-800">Why Gemini suggests this match: </span>
                      "{m.reason}"
                    </div>

                    {/* Side-by-Side Summary */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-3 bg-rose-50/50 rounded-xl border border-rose-100 space-y-1">
                        <span className="text-[10px] font-extrabold text-rose-700 uppercase">Lost Report</span>
                        <p className="font-bold text-slate-900">{m.lostItem.itemName}</p>
                        <p className="text-slate-600 line-clamp-1">{m.lostItem.description}</p>
                        <p className="text-slate-500 text-[11px] flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3 text-rose-500" />
                          {m.lostItem.location} • {m.lostItem.date}
                        </p>
                      </div>

                      <div className="p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 space-y-1">
                        <span className="text-[10px] font-extrabold text-emerald-700 uppercase">Found Report</span>
                        <p className="font-bold text-slate-900">{m.foundItem.itemName}</p>
                        <p className="text-slate-600 line-clamp-1">{m.foundItem.description}</p>
                        <p className="text-slate-500 text-[11px] flex items-center gap-1 mt-1">
                          <MapPin className="w-3 h-3 text-emerald-500" />
                          {m.foundItem.location} • {m.foundItem.date}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="font-semibold text-slate-700">
            FindBack AI – Smart Campus Lost & Found
          </p>
          <p className="text-[11px] text-slate-400">
            Built with React, Google Gemini AI, and Firebase Firestore • Designed for safe college campus item reunions.
          </p>
        </div>
      </footer>

      {/* Report Modal */}
      <ReportModal
        isOpen={isReportModalOpen}
        initialType={reportModalType}
        onClose={() => setIsReportModalOpen(false)}
        onItemCreated={handleItemCreated}
      />

      {/* AI Match Comparison Modal */}
      <MatchModal
        match={selectedMatch}
        isOpen={isMatchModalOpen}
        onClose={() => {
          setIsMatchModalOpen(false);
          setSelectedMatch(null);
        }}
        onMarkReturned={handleMarkReturned}
      />

      {/* Quick Contact Modal */}
      {contactItem && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-sm text-slate-900">Student Contact Details</h3>
              </div>
              <button
                onClick={() => setContactItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <p className="text-slate-600">
                You are inquiring about: <span className="font-bold text-slate-900">{contactItem.itemName}</span> ({contactItem.itemType.toUpperCase()})
              </p>
              <div className="bg-indigo-50/70 p-3 rounded-xl border border-indigo-100 space-y-1">
                <p className="text-slate-500 font-medium">Reported by contact:</p>
                <p className="text-sm font-bold text-indigo-900 select-all">{contactItem.contact}</p>
                <a
                  href={`mailto:${contactItem.contact}?subject=FindBack AI: Campus Item Inquiry (${contactItem.itemName})`}
                  className="inline-block text-xs text-indigo-600 font-semibold underline mt-1"
                >
                  Open Email in Mail Client
                </a>
              </div>
            </div>

            <div className="p-2.5 bg-amber-50 rounded-lg text-[11px] text-amber-800">
              💡 Always verify unique characteristics (lock code, specific sticker, brand) before meeting in an open campus area.
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setContactItem(null)}
                className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
