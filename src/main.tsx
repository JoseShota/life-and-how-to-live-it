import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { Layout } from '@/components/Layout';
import { ToastProvider } from '@/lib/toast';
import { seedIfEmpty } from '@/db/seed';
import { applyShields, ensureTaxQuests } from '@/game/engine';
import Today from '@/pages/Today';
import Quests from '@/pages/Quests';
import Focus from '@/pages/Focus';
import Money from '@/pages/Money';
import Rewards from '@/pages/Rewards';
import Stats from '@/pages/Stats';
import SettingsPage from '@/pages/Settings';

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
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </React.StrictMode>
  );
});
