'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const tournaments = [
    { code: 'WC', name: '2026 World Cup' },
  ];

  const isActive = (path: string) => pathname === path;

  return (
    <>
      {/* Mobile Header */}
      <header className="lg:hidden flex items-center justify-between px-6 py-4 bg-slate-900 border-b border-slate-800 sticky top-0 z-40">
        <Link href="/" className="flex items-center gap-3 font-extrabold text-lg text-slate-100">
          <span className="text-2xl">⚽</span> Soccer Predictor
        </Link>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="text-slate-400 hover:text-slate-200 focus:outline-none"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </header>

      {/* Sidebar Container */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-900 border-r border-slate-800 p-6 flex flex-col justify-between transition-transform duration-300 transform lg:translate-x-0 ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:fixed lg:inset-y-0 lg:flex lg:flex-col`}
      >
        <div className="space-y-8 overflow-y-auto">
          {/* Logo */}
          <div className="hidden lg:flex items-center gap-3">
            <span className="text-3xl">⚽</span>
            <Link href="/" className="font-black text-xl text-slate-500 tracking-wider">
              SOCCER <span className="bg-gradient-to-r from-indigo-400 to-emerald-400 bg-clip-text text-transparent">PREDICTOR</span>
            </Link>
          </div>

          {/* Navigation */}
          <nav className="space-y-6">
            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3">
                Ratings & Rankings
              </h3>
              <Link
                href="/"
                onClick={() => setIsOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                  isActive('/')
                    ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                }`}
              >
                <span>🏆</span> Global ELO Rankings
              </Link>
            </div>

            <div className="space-y-2">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-3">
                Tournaments
              </h3>
              <div className="space-y-1 max-h-[350px] overflow-y-auto pr-1">
                {tournaments.map((t) => {
                  const path = `/tournament/${t.code}`;
                  return (
                    <Link
                      key={t.code}
                      href={path}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition ${
                        isActive(path)
                          ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                      }`}
                    >
                      <span className="text-xs">⚡</span>
                      <span className="truncate">{t.name}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </nav>
        </div>

        {/* Footer info */}
        <div className="border-t border-slate-800/60 pt-4 mt-6">
          <p className="text-[10px] text-slate-500 font-mono text-center">
            Soccer Predictor v1.0.0<br />
            Data updated daily
          </p>
        </div>
      </div>

      {/* Backdrop for mobile */}
      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
        />
      )}
    </>
  );
}
