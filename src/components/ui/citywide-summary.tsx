import { useLanguage } from '../../i18n/context';

interface CitywideSummaryProps {
  total: number;
  withGaps: number;
}

export default function CitywideSummary({ total, withGaps }: CitywideSummaryProps) {
  const { t } = useLanguage();

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-blue-200 px-4 py-3">
      <p className="text-sm text-gray-700 text-center">
        {t('citywide.summary', {
          total: String(total),
          withGaps: String(withGaps),
        }).split(String(total)).map((part, i, arr) =>
          i < arr.length - 1 ? (
            <span key={`total-${i}`}>
              {part}
              <strong className="text-gray-900">{total}</strong>
            </span>
          ) : (
            <span key={`rest-${i}`}>
              {part.split(String(withGaps)).map((subPart, j, subArr) =>
                j < subArr.length - 1 ? (
                  <span key={`gaps-${j}`}>
                    {subPart}
                    <strong className="text-red-700">{withGaps}</strong>
                  </span>
                ) : (
                  <span key={`end-${j}`}>{subPart}</span>
                ),
              )}
            </span>
          ),
        )}
      </p>
    </div>
  );
}
