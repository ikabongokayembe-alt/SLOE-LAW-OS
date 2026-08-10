import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { DemoBanner } from './DemoBanner';
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ShortcutsModal } from './ShortcutsModal';

export function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close the mobile drawer automatically on navigation, so tapping a link
  // doesn't leave the overlay sitting open behind the new screen.
  useEffect(() => { setMobileNavOpen(false); }, [location.pathname]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // command + 1-8 navigation
      if (e.metaKey || e.ctrlKey) {
        if (e.key === '1') { e.preventDefault(); navigate('/'); }
        if (e.key === '2') { e.preventDefault(); navigate('/matters'); }
        if (e.key === '3') { e.preventDefault(); navigate('/deadlines'); }
        if (e.key === '4') { e.preventDefault(); navigate('/parties'); }
        if (e.key === '8') { e.preventDefault(); navigate('/analyst'); }
        if (e.key === '9') { e.preventDefault(); navigate('/operator'); }
        if (e.key === '/') { e.preventDefault(); setShortcutsOpen(true); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [navigate]);

  return (
    <div className="flex h-screen w-full bg-primary text-primary overflow-hidden">
      {/* Desktop: sidebar sits inline. Mobile: it's an overlay drawer,
          hidden by default and toggled from TopBar's hamburger button. */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      {mobileNavOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileNavOpen(false)} />
          <div className="absolute inset-y-0 left-0 animate-in slide-in-from-left duration-200">
            <Sidebar onNavigate={() => setMobileNavOpen(false)} />
          </div>
        </div>
      )}
      <div className="flex flex-col flex-1 min-w-0">
        <DemoBanner />
        <TopBar onMenuClick={() => setMobileNavOpen(v => !v)} />
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1440px] mx-auto px-4 md:px-8 py-6">
            <Outlet />
          </div>
        </main>
      </div>
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}
