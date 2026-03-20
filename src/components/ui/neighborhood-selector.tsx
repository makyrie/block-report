export { COMMUNITIES } from '../../types/communities';

interface NeighborhoodSelectorProps {
  value: string;
  onChange: (community: string) => void;
}

export default function NeighborhoodSelector({ value, onChange }: NeighborhoodSelectorProps) {
  return (
    <div className="w-full">
      <label htmlFor="neighborhood-select" className="sr-only">
        Select a neighborhood
      </label>
      <select
        id="neighborhood-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <option value="">Select a neighborhood...</option>
        {COMMUNITIES.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </select>
    </div>
  );
}
