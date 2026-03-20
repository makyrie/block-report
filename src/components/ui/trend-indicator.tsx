import type { TrendSummary } from '../../types';
import Sparkline from './sparkline';

interface TrendIndicatorProps {
  direction: TrendSummary['direction'];
  label: string;
  sparklineData?: number[];
}

export default function TrendIndicator({ direction, label, sparklineData }: TrendIndicatorProps) {
  const config = {
    improving: { arrow: '\u2191', color: 'text-green-600', bg: 'bg-green-50', sparkColor: '#16a34a' },
    declining: { arrow: '\u2193', color: 'text-red-600', bg: 'bg-red-50', sparkColor: '#dc2626' },
    stable:    { arrow: '\u2192', color: 'text-gray-600', bg: 'bg-gray-50', sparkColor: '#6b7280' },
  };
  const c = config[direction];

  return (
    <div className={`flex items-center gap-2 rounded px-2 py-1 ${c.bg}`}>
      <span className={`text-sm font-medium ${c.color}`}>{c.arrow}</span>
      {sparklineData && <Sparkline data={sparklineData} color={c.sparkColor} />}
      <span className="text-xs text-gray-600">{label}: <span className={c.color}>{direction}</span></span>
    </div>
  );
}
