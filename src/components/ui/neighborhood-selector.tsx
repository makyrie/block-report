const COMMUNITIES = [
  'Balboa Park',
  'Barrio Logan',
  'Bay Ho',
  'Bay Park',
  'Carmel Mountain Ranch',
  'Chollas View',
  'City Heights',
  'Clairemont Mesa',
  'College Area',
  'Del Cerro',
  'East Village',
  'Encanto',
  'Gaslamp Quarter',
  'Hillcrest',
  'Kearny Mesa',
  'La Jolla',
  'Linda Vista',
  'Little Italy',
  'Logan Heights',
  'Midway',
  'Mira Mesa',
  'Mission Bay',
  'Mission Hills',
  'Mission Valley',
  'Navajo',
  'Normal Heights',
  'North Park',
  'Ocean Beach',
  'Old Town',
  'Otay Mesa',
  'Pacific Beach',
  'Point Loma',
  'Rancho Bernardo',
  'Rancho Penasquitos',
  'San Ysidro',
  'Scripps Ranch',
  'Serra Mesa',
  'Skyline',
  'Southeastern',
  'Tierrasanta',
  'University City',
  'Valencia Park',
] as const;

interface NeighborhoodSelectorProps {
  value: string;
  onChange: (community: string) => void;
}

export default function NeighborhoodSelector({ value, onChange }: NeighborhoodSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
    >
      <option value="">Select a neighborhood...</option>
      {COMMUNITIES.map((name) => (
        <option key={name} value={name}>
          {name}
        </option>
      ))}
    </select>
  );
}
