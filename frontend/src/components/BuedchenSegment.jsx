import { Link } from 'react-router'
import { Star } from '@phosphor-icons/react'
import { getSegmentColor, isLargeSegment } from '../utils/segmentColor'
import '../styles/components/buedchen-segment.css'

export default function BuedchenSegment({ buedchen, index }) {
  const hasEditorial = buedchen.editorial_badges?.length > 0
  const color        = getSegmentColor(index, hasEditorial)
  const large        = isLargeSegment(index, hasEditorial)
  const displayNum   = hasEditorial ? 'Empfohlen' : String(index + 1).padStart(2, '0')

  const features = [
    buedchen.feature_seating && 'Außen',
    buedchen.feature_coffee  && 'Kaffee',
  ].filter(Boolean).join(' · ')

  return (
    <Link
      to={`/buedchen/${buedchen.id}`}
      className={`seg seg--${color}`}
    >
      <div className="seg__top">
        <span>{buedchen.veedel ?? '—'}</span>
        <span>{displayNum}</span>
      </div>
      <div className={`seg__name${large ? ' seg__name--lg' : ''}`}>
        {buedchen.name}
      </div>
      <div className="seg__bot">
        {buedchen.google_rating != null && (
          <span className="seg__rating">
            <Star weight="fill" size={12} />
            {buedchen.google_rating.toFixed(1)}
            {buedchen.google_review_count != null && (
              <span style={{ fontWeight: 400, opacity: .7 }}>
                &nbsp;· {buedchen.google_review_count}
              </span>
            )}
          </span>
        )}
        {features && <span className="seg__feat">{features}</span>}
      </div>
    </Link>
  )
}
