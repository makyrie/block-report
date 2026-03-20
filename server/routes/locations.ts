import { Router } from 'express';
import { prisma } from '../services/db.js';
import { Prisma } from '@prisma/client';
import { logger } from '../logger.js';

const router = Router();

// In-memory cache for the community plan GeoJSON (~4 MB, fetched once)
const NEIGHBORHOODS_URL =
  'https://seshat.datasd.org/gis_community_planning_districts/cmty_plan_datasd.geojson';
const NEIGHBORHOODS_TTL = 24 * 60 * 60 * 1000;
let neighborhoodsCache: Record<string, unknown> | null = null;
let neighborhoodsCachedAt = 0;

router.get('/libraries', async (_req, res) => {
  try {
    const data = await prisma.library.findMany();
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch libraries', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/rec-centers', async (_req, res) => {
  try {
    const data = await prisma.recCenter.findMany();
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch rec centers', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/transit-stops', async (_req, res) => {
  try {
    const data = await prisma.transitStop.findMany({
      select: { objectid: true, stop_name: true, lat: true, lng: true },
    });
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch transit stops', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/permits', async (req, res) => {
  try {
    const community = req.query.community as string | undefined;

    // Validate community parameter (consistent with /api/311 endpoint)
    if (community !== undefined) {
      const cleaned = community.replace(/[%_]/g, '');
      if (cleaned.length === 0 || cleaned.length > 100) {
        res.status(400).json({ error: 'Invalid community name' });
        return;
      }
    }

    const where: Prisma.PermitWhereInput = {
      lat: { not: null },
      lng: { not: null },
      ...(community ? { community: community.replace(/[%_]/g, '') } : {}),
    };

    const data = await prisma.permit.findMany({
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
  const now = Date.now();
  if (neighborhoodsCache && now - neighborhoodsCachedAt < NEIGHBORHOODS_TTL) {
    res.json(neighborhoodsCache);
    return;
  }
  try {
    const response = await fetch(NEIGHBORHOODS_URL);
    if (!response.ok) throw new Error(`Upstream error: ${response.status}`);
    const data = await response.json();
    neighborhoodsCache = data;
    neighborhoodsCachedAt = now;
    res.json(data);
  } catch (err) {
    logger.error('Failed to fetch neighborhoods', { error: (err as Error).message });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
