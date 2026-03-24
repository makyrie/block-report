import { Router } from 'express';
import { prisma } from '../services/db.js';
import { Prisma } from '@prisma/client';
import { logger } from '../logger.js';
import { sanitizeCommunity } from '../utils/validation.js';
import { fetchBoundaries } from '../services/boundaries.js';

const router = Router();

router.get('/libraries', async (_req, res) => {
  try {
    const data = await prisma.library.findMany({
      select: { objectid: true, name: true, address: true, lat: true, lng: true, phone: true, website: true },
    });
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch libraries', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/rec-centers', async (_req, res) => {
  try {
    const data = await prisma.recCenter.findMany({
      select: { objectid: true, park_name: true, address: true, lat: true, lng: true, neighborhd: true },
    });
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch rec centers', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/permits', async (req, res) => {
  try {
    const cleaned = sanitizeCommunity(req.query.community as string | undefined);
    if (cleaned === null) {
      res.status(400).json({ error: 'Invalid community name' });
      return;
    }

    const where: Prisma.PermitWhereInput = {
      lat: { not: null },
      lng: { not: null },
      ...(cleaned ? { community: { equals: cleaned, mode: 'insensitive' } } : {}),
    };

    const data = await prisma.permit.findMany({
      select: {
        id: true,
        permit_number: true,
        permit_type: true,
        description: true,
        date_issued: true,
        status: true,
        street_address: true,
        community: true,
        lat: true,
        lng: true,
      },
      where,
      orderBy: { date_issued: 'desc' },
      take: 5000,
    });
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch permits', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/neighborhoods', async (_req, res) => {
  try {
    const data = await fetchBoundaries();
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch neighborhoods', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/locations/communities — list valid community names (for agents and programmatic use)
router.get('/communities', async (_req, res) => {
  try {
    const data = await fetchBoundaries();
    const names: string[] = [];
    for (const feature of data.features) {
      const name = feature.properties?.cpname || feature.properties?.community || feature.properties?.name;
      if (name) names.push(name as string);
    }
    names.sort();
    res.set('Cache-Control', 'public, max-age=3600, stale-while-revalidate=86400');
    res.json({ communities: names });
  } catch (err) {
    logger.error('Failed to list communities', { error: err instanceof Error ? err.message : String(err) });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
