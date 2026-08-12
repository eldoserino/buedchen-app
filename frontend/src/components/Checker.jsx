import '../styles/components/checker.css'

export default function Checker({ small = false, style }) {
  return (
    <div
      className={small ? 'checker checker--sm' : 'checker'}
      style={style}
    />
  )
}
