import React, { useState } from 'react';
import { Sparkles, ArrowRight, Play, CheckCircle2, RefreshCw, Layers } from 'lucide-react';

interface DemoScenarioBannerProps {
  onTriggerDemo: () => Promise<void>;
  onOpenMatch: () => void;
}

export const DemoScenarioBanner: React.FC<DemoScenarioBannerProps> = ({
  onTriggerDemo,
  onOpenMatch,
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [demoCompleted, setDemoCompleted] = useState(false);

  const handleRun = async () => {
    setIsRunning(true);
    try {
      await onTriggerDemo();
      setDemoCompleted(true);
    } catch (err) {
      console.error('Demo error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div 
      id="demo-scenario-container"
      className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-indigo-500/20 shadow-lg relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 -mt-4 -mr-4 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none"></div>

      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1.5 max-w-2xl">
          <div className="flex items-center gap-2">
            <span className="bg-indigo-500/30 text-indigo-300 text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border border-indigo-400/30 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              Official Demo Scenario
            </span>
            <span className="text-[11px] text-slate-400">College Canteen Wallet Case</span>
          </div>
          <h3 className="text-base sm:text-lg font-bold font-display tracking-tight text-white">
            Simulate Lost & Found AI Matching Workflow
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            1. Student reports lost black wallet near canteen &rarr; 2. Finder reports small black wallet &rarr; 3. Gemini evaluates match score (<span className="text-emerald-300 font-semibold">High Match</span>) &rarr; 4. Reunited as <span className="text-emerald-300 font-semibold">Returned</span>.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            id="run-demo-btn"
            onClick={handleRun}
            disabled={isRunning}
            className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-md shadow-indigo-950 flex items-center gap-2 transition-all disabled:opacity-75 cursor-pointer"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Running Gemini AI...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{demoCompleted ? 'Re-Run Demo' : 'Load Demo Scenario'}</span>
              </>
            )}
          </button>

          {demoCompleted && (
            <button
              type="button"
              id="view-demo-match-btn"
              onClick={onOpenMatch}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>View Match</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
