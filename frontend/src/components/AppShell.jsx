import { Outlet, useLocation } from 'react-router'
import BottomNav from './BottomNav'
import FilterPanel from './FilterPanel'
import { useFilter } from '../context/FilterContext'

export default function AppShell() {
  const { filterOpen } = useFilter()
  const location       = useLocation()
  const isDetail       = location.pathname.startsWith('/buedchen/')

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      <Outlet />
      {!isDetail && filterOpen && <FilterPanel />}
      <BottomNav />
    </div>
  )
}
