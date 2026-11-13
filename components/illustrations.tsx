import type { ReactNode } from "react";

// Simple onboarding illustrations: a blue blob with a few stacked sticky notes in the note colors.

const BLUE = "#2F5BEA";
const INK = "#111111";
const BLOB_PATH =
  "M154 20C206 14 258 44 271 98C284 152 254 206 200 222C146 238 82 226 50 186C18 146 22 86 58 52C82 30 120 24 154 20Z";

interface StickyProps {
  x: number;
  y: number;
  size: number;
  color: string;
  rotate?: number;
  children?: ReactNode;
}

function Sticky({ x, y, size, color, rotate = 0, children }: StickyProps) {
  const fold = Math.round(size * 0.24);
  const r = 4;
  const body = `M${r} 0H${size - r}A${r} ${r} 0 0 1 ${size} ${r}V${size - fold}L${size - fold} ${size}H${r}A${r} ${r} 0 0 1 0 ${size - r}V${r}A${r} ${r} 0 0 1 ${r} 0Z`;
  const flap = `M${size} ${size - fold}L${size - fold} ${size}V${size - fold + r}A${r} ${r} 0 0 1 ${size - fold + r} ${size - fold}Z`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate} ${size / 2} ${size / 2})`}>
      <path d={body} transform="translate(3 5)" fill="#0B1E6B" opacity="0.2" />
      <path d={body} fill={color} />
      <path d={flap} fill="#000000" opacity="0.16" />
      {children}
    </g>
  );
}

function Lines({ x, y, widths, color = INK }: { x: number; y: number; widths: number[]; color?: string }) {
  return (
    <>
      {widths.map((width, index) => (
        <rect key={index} x={x} y={y + index * 12} width={width} height={6} rx={3} fill={color} opacity={0.72} />
      ))}
    </>
  );
}

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 300 240" className={className} aria-hidden="true" focusable="false">
      <path d={BLOB_PATH} fill={BLUE} />
      <circle cx="262" cy="196" r="10" fill="#FFD43B" />
      <circle cx="38" cy="64" r="6" fill="#FF9A3C" />
      {children}
    </svg>
  );
}

/** Slide 1: a stack of notes, the top one holding a saved link. */
export function SaveLinksArt({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <Sticky x={62} y={86} size={92} color="#2ECC71" rotate={-12}>
        <Lines x={12} y={16} widths={[52, 36]} />
      </Sticky>
      <Sticky x={104} y={50} size={98} color="#FFD43B" rotate={8}>
        <Lines x={12} y={16} widths={[58, 40]} />
      </Sticky>
      <Sticky x={128} y={96} size={106} color="#FF9A3C" rotate={-3}>
        <rect x={12} y={16} width={70} height={24} rx={12} fill="#FFFFFF" />
        <circle cx={25} cy={28} r={6} fill={BLUE} />
        <rect x={36} y={25} width={36} height={6} rx={3} fill={INK} opacity={0.72} />
        <Lines x={12} y={52} widths={[64, 44]} />
      </Sticky>
      <circle cx="238" cy="70" r="18" fill="#FFFFFF" />
      <path d="M238 61v18M229 70h18" stroke="#FF9A3C" strokeWidth="4" strokeLinecap="round" />
    </Frame>
  );
}

/** Slide 2: the same notes on a laptop and a phone. */
export function AnyDeviceArt({ className }: { className?: string }) {
  return (
    <Frame className={className}>
      <rect x="52" y="58" width="156" height="104" rx="9" fill={INK} />
      <rect x="58" y="64" width="144" height="92" rx="4" fill="#F5F5F2" />
      <Sticky x={68} y={76} size={38} color="#FFD43B">
        <Lines x={6} y={8} widths={[20]} />
      </Sticky>
      <Sticky x={111} y={76} size={38} color="#EF4B4B">
        <Lines x={6} y={8} widths={[20]} />
      </Sticky>
      <Sticky x={154} y={76} size={38} color="#8B5CF6">
        <Lines x={6} y={8} widths={[20]} />
      </Sticky>
      <path d="M38 162H222L232 174H28Z" fill="#D9D8D3" />
      <rect x="196" y="94" width="64" height="116" rx="13" fill={INK} />
      <rect x="201" y="101" width="54" height="102" rx="9" fill="#F5F5F2" />
      <Sticky x={208} y={110} size={40} color="#FFD43B">
        <Lines x={6} y={8} widths={[22]} />
      </Sticky>
      <Sticky x={208} y={156} size={40} color="#2ECC71">
        <Lines x={6} y={8} widths={[22]} />
      </Sticky>
    </Frame>
  );
}

/** Slide 3: the app icon on a phone's home screen. */
export function HomeScreenArt({ className }: { className?: string }) {
  const cells: Array<[number, number]> = [];
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if (!(row === 1 && col === 1)) cells.push([118 + col * 23, 52 + row * 26]);
    }
  }
  return (
    <Frame className={className}>
      <Sticky x={34} y={128} size={58} color="#FFD43B" rotate={-10}>
        <Lines x={9} y={12} widths={[30, 20]} />
      </Sticky>
      <Sticky x={214} y={44} size={50} color="#2ECC71" rotate={10}>
        <Lines x={8} y={10} widths={[26]} />
      </Sticky>
      <rect x="102" y="26" width="96" height="190" rx="18" fill={INK} />
      <rect x="108" y="34" width="84" height="174" rx="13" fill="#F5F5F2" />
      {cells.map(([cx, cy]) => (
        <rect key={`${cx}-${cy}`} x={cx} y={cy} width="18" height="18" rx="5" fill="#DAD9D4" />
      ))}
      <circle cx="150" cy="87" r="19" fill="none" stroke="#FF9A3C" strokeWidth="3" opacity="0.45" />
      <rect x="140" y="77" width="20" height="20" rx="5" fill="#FF9A3C" />
      <path d="M144.5 81H155.5V89L151.5 93H144.5Z" fill="#FFFFFF" />
    </Frame>
  );
}
