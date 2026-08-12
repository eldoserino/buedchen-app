import { useNavigate } from 'react-router'
import { ArrowLeft } from '@phosphor-icons/react'
import '../styles/components/float-search.css'

export default function FloatBack() {
  const navigate = useNavigate()
  return (
    <button
      className="float-back"
      onClick={() => navigate(-1)}
      aria-label="Zurück"
    >
      <ArrowLeft weight="fill" size={17} />
    </button>
  )
}
