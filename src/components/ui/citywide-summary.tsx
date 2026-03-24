import { Fragment } from 'react';
import type { ReactNode } from 'react';
import { useLanguage } from '../../i18n/context';

interface CitywideSummaryProps {
  total: number;
  withGaps: number;
}

// Token-based interpolation: splits a template with {key} placeholders and
// replaces them with ReactNode values. Safe regardless of numeric collisions.
function interpolateJSX(
  template: string,
  vars: Record<string, ReactNode>,
): ReactNode[] {
  const parts = template.split(/(\{[^}]+\})/g);
  return parts.map((part, i) => {
    const match = part.match(/^\{(.+)\}$/);
    if (match && match[1] in vars) {
      return <Fragment key={i}>{vars[match[1]]}</Fragment>;
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function CitywideSummary({ total, withGaps }: CitywideSummaryProps) {
  const { t } = useLanguage();

  // Get the raw template with {total} and {withGaps} placeholders intact
  const template = t('citywide.summary');

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-4 py-3">
      <p className="text-sm text-gray-700 text-center">
        {interpolateJSX(template, {
          total: <strong className="text-gray-900">{total}</strong>,
          withGaps: <strong className="text-red-700">{withGaps}</strong>,
        })}
      </p>
    </div>
  );
}
