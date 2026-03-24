import { titleCase } from './community';

export function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export function fromSlug(slug: string): string {
  // Validate: only lowercase alpha, digits, and hyphens; max 100 chars
  const safe = slug.slice(0, 100).replace(/[^a-z0-9-]/g, '');
  return titleCase(safe.replace(/-/g, ' '));
}
