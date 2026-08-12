import { NavLink } from 'react-router'
import { MapPin, List, DotsThreeCircle } from '@phosphor-icons/react'
import '../styles/components/bottom-nav.css'

const tabs = [
  { to: '/',       label: 'Karte',  Icon: MapPin },
  { to: '/liste',  label: 'Liste',  Icon: List },
  { to: '/touren', label: 'Touren', Icon: DotsThreeCircle },
]

export default function BottomNav() {
  return (
    <nav className="bottom-nav">
      {tabs.map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end
          className={({ isActive }) =>
            'bottom-nav__btn' + (isActive ? ' active' : '')
          }
        >
          <Icon weight="fill" size={18} />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}
