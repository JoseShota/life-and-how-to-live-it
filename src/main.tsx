import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { Layout } from '@/components/Layout';
import { ToastProvider } from '@/lib/toast';
import { seedIfEmpty } from '@/db/seed';
import { applyShields, ensureTaxQuests } from '@/game/engine';
import { Today, Quests, Focus, Money, Rewards, Stats, SettingsPage, Review, preloadPages } from '@/pages';
import { bootSync, captureAuthRedirect } from '@/sync/status';

captureAuthRedirect(); // a sign-in link's tokens leave the address bar before anything renders

seedIfEmpty().then(() => ensureTaxQuests()).then(() => applyShields()).catch(() => undefined).then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<Today />} />
              <Route path="quests" element={<Quests />} />
              <Route path="focus" element={<Focus />} />
              <Route path="money" element={<Money />} />
              <Route path="rewards" element={<Rewards />} />
              <Route path="stats" element={<Stats />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="review" element={<Review />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </React.StrictMode>
  );
  preloadPages();
  void bootSync(); // linked devices start syncing; others load nothing
});
