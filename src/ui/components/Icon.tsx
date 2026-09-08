/**
 * UI iconography, authored here as plain stroked paths.
 *
 * These are interface illustrations only. They are deliberately NOT emoji
 * glyphs and never stand in for emoji artwork from the source catalog
 * (AGENTS.md, SRC-02): the two asset kinds must not be swapped for each other.
 */
import type { SVGProps } from 'react'

const PATHS = {
  image: 'M3 5.5h18v13H3zM3 15l5-5 4 4 3-3 6 6',
  cube: 'M12 2.8l8.2 4.6v9.2L12 21.2 3.8 16.6V7.4zM3.8 7.4L12 12l8.2-4.6M12 12v9.2',
  layers: 'M12 3l8.5 4.5L12 12 3.5 7.5zM4 12l8 4.2 8-4.2M4 16.3l8 4.2 8-4.2',
  sliders: 'M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0M16 5.2v3.6M10 10.2v3.6M18 15.2v3.6',
  download: 'M12 3.5v11M7.5 10.5L12 15l4.5-4.5M4 17.5v3h16v-3',
  library: 'M4 4h5v16H4zM11 4h4v16h-4zM17.4 5l3.1 14.4',
  brush: 'M6 18c2.4 0 3-1.6 3-3l7.6-7.6a2 2 0 013 3L12 18c-1.2 1.2-3.6 2-6 0z',
  line: 'M4 19L20 5M4 19h2M18 5h2',
  curve: 'M3.5 18C8 18 8 6 12.5 6S17 15 21 15M3.5 18h0M21 15h0',
  eraser: 'M8 20h11M4.7 16.3l7-7 5 5-6 6H7zM11.7 9.3l3.6-3.6a1.6 1.6 0 012.3 0l2.7 2.7a1.6 1.6 0 010 2.3l-3.6 3.6',
  scissors: 'M6.5 5l11 12M17.5 5l-11 12M7 20a2.4 2.4 0 100-4.8A2.4 2.4 0 007 20zM17 20a2.4 2.4 0 100-4.8A2.4 2.4 0 0017 20z',
  crop: 'M6.5 2.5v15h15M2.5 6.5h15v15',
  patch: 'M12 3.5l8.5 8.5-8.5 8.5L3.5 12zM9 12h6M12 9v6',
  fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5M9 9h6v6H9z',
  grid: 'M3.5 3.5h17v17h-17zM9.2 3.5v17M14.8 3.5v17M3.5 9.2h17M3.5 14.8h17',
  top: 'M12 3.5l8 4.6-8 4.6-8-4.6zM4 8.1v7.5l8 4.6 8-4.6V8.1',
  iso: 'M12 3.5l8 4.6v8l-8 4.6-8-4.6v-8zM12 12.7l8-4.6M12 12.7v8.6M12 12.7L4 8.1',
  front: 'M5 5.5h14v13H5zM5 10h14M9.5 10v8.5',
  center: 'M12 4v16M4 12h16M12 8.6a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8z',
  ruler: 'M3 14.5L14.5 3l6.5 6.5L9.5 21zM7 10.5l2 2M10 7.5l2 2M13 4.5l2 2',
  explode: 'M12 2.5v6M12 15.5v6M4.3 7l5.2 3M14.5 14l5.2 3M19.7 7l-5.2 3M9.5 14l-5.2 3',
  undo: 'M9 6.5L4.5 11 9 15.5M4.5 11h9.8a5.2 5.2 0 010 10.4H8',
  redo: 'M15 6.5L19.5 11 15 15.5M19.5 11H9.7a5.2 5.2 0 000 10.4H16',
  search: 'M10.6 3.5a7.1 7.1 0 100 14.2 7.1 7.1 0 000-14.2zM15.8 15.8L21 21',
  close: 'M5.5 5.5l13 13M18.5 5.5l-13 13',
  chevronLeft: 'M14.5 5l-7 7 7 7',
  chevronRight: 'M9.5 5l7 7-7 7',
  chevronDown: 'M5 9.5l7 7 7-7',
  chevronUp: 'M5 14.5l7-7 7 7',
  plus: 'M12 4.5v15M4.5 12h15',
  minus: 'M4.5 12h15',
  check: 'M4.5 12.5l5 5 10-11',
  warning: 'M12 3.2L21.5 20H2.5zM12 9.5v5M12 17.2v.2',
  error: 'M12 3.4a8.6 8.6 0 100 17.2 8.6 8.6 0 000-17.2zM8.6 8.6l6.8 6.8M15.4 8.6l-6.8 6.8',
  info: 'M12 3.4a8.6 8.6 0 100 17.2 8.6 8.6 0 000-17.2zM12 10.6v6M12 7.4v.2',
  user: 'M12 3.6a4 4 0 100 8 4 4 0 000-8zM4.5 20.4c0-3.6 3.4-5.6 7.5-5.6s7.5 2 7.5 5.6',
  users: 'M9 4.2a3.4 3.4 0 100 6.8 3.4 3.4 0 000-6.8zM2.8 19.6c0-3.1 2.8-4.8 6.2-4.8s6.2 1.7 6.2 4.8M16 5.1a3 3 0 010 5.8M17.4 15.2c2.3.5 3.8 1.9 3.8 4.4',
  gear: 'M12 8.7a3.3 3.3 0 100 6.6 3.3 3.3 0 000-6.6zM12 2.8l1 2.6 2.7-.7 1.4 2.4-1.9 2 1.9 2-1.4 2.4-2.7-.7-1 2.6h-2l-1-2.6-2.7.7-1.4-2.4 1.9-2-1.9-2 1.4-2.4 2.7.7 1-2.6z',
  key: 'M15.4 3.6a5.4 5.4 0 11-4.9 7.7L3.5 18.3v2.2h3.2v-2h2v-2h2l1.8-1.8a5.4 5.4 0 002.9-11.1zM16.6 7.9v.2',
  coin: 'M12 4.2c4.4 0 8 1.4 8 3.1s-3.6 3.1-8 3.1-8-1.4-8-3.1 3.6-3.1 8-3.1zM4 7.3v9.4c0 1.7 3.6 3.1 8 3.1s8-1.4 8-3.1V7.3M4 12c0 1.7 3.6 3.1 8 3.1s8-1.4 8-3.1',
  shield: 'M12 3l7.5 3v6c0 4.4-3.1 7.6-7.5 9.2C7.6 19.6 4.5 16.4 4.5 12V6z',
  help: 'M12 3.4a8.6 8.6 0 100 17.2 8.6 8.6 0 000-17.2zM9.4 9.6a2.7 2.7 0 015.2.9c0 1.9-2.6 2.1-2.6 4M12 17.4v.2',
  folder: 'M3.5 6.4h6l2 2.4h9v11.2h-17z',
  save: 'M4.5 4.5h12l3.5 3.5v11.5h-15.5zM8 4.5v5h7v-5M8 19.5v-6h8v6',
  trash: 'M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 13.5h9l1-13.5M10.2 10v6.5M13.8 10v6.5',
  star: 'M12 3.6l2.6 5.5 5.9.8-4.3 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.5 9.9l5.9-.8z',
  upload: 'M12 20.5V9M7.5 13L12 8.5l4.5 4.5M4 6V3.5h16V6',
  cancel: 'M12 3.4a8.6 8.6 0 100 17.2 8.6 8.6 0 000-17.2zM6.5 6.5l11 11',
  play: 'M7.5 4.6l12 7.4-12 7.4z',
  offline: 'M3 4l18 16M5.6 9.2A11 11 0 019 7.2M2.5 6.4a15 15 0 014-2.4M12 20.2v.2M8.4 15.6a6 6 0 013-1.5M19 7.5a15 15 0 012.5 1.6',
  online: 'M2.5 8.4a15 15 0 0119 0M5.8 12a10.5 10.5 0 0112.4 0M9.2 15.5a5.5 5.5 0 015.6 0M12 19.4v.2',
  text: 'M4.5 5.5V4h15v1.5M12 4v16M8.5 20h7',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z',
  dots: 'M6 12v.2M12 12v.2M18 12v.2',
  refresh: 'M20 12a8 8 0 11-2.4-5.7M20 3.5V9h-5.5',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5.5H4.5V6H10',
  drag: 'M9 6v.2M15 6v.2M9 12v.2M15 12v.2M9 18v.2M15 18v.2',
  filter: 'M3.5 5.5h17l-6.6 7.6v6.4l-3.8-2v-4.4z',
  eye: 'M2.6 12S6.3 5.8 12 5.8 21.4 12 21.4 12 17.7 18.2 12 18.2 2.6 12 2.6 12zM12 9.2a2.8 2.8 0 100 5.6 2.8 2.8 0 000-5.6z',
  lock: 'M6.5 10.5h11v10h-11zM8.8 10.5V7.8a3.2 3.2 0 016.4 0v2.7',
  clock: 'M12 3.4a8.6 8.6 0 100 17.2 8.6 8.6 0 000-17.2zM12 7.2V12l3.4 2',
  paste: 'M9 4.5h6v2.5H9zM6.5 6h-2v14.5h15V6h-2M8.5 11h7M8.5 15h5',
} as const

export type IconName = keyof typeof PATHS

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName
  size?: number
}

export function Icon({ name, size = 18, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
