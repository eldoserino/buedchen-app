import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router'
import { FilterProvider } from './context/FilterContext'
import AppShell from './components/AppShell'
import MapPage from './pages/MapPage'
import ListPage from './pages/ListPage'
import DetailPage from './pages/DetailPage'
import ToursPage from './pages/ToursPage'
import TourDetailPage from './pages/TourDetailPage'
import AdminPage from './pages/AdminPage'
import './styles/global.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FilterProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<MapPage />} />
            <Route path="/liste" element={<ListPage />} />
            <Route path="/buedchen/:id" element={<DetailPage />} />
            <Route path="/touren" element={<ToursPage />} />
            <Route path="/touren/:slug" element={<TourDetailPage />} />
          </Route>
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </BrowserRouter>
    </FilterProvider>
  </StrictMode>
)
