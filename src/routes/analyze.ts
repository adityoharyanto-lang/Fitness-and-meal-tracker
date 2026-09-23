import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { requireUser } from '../middleware/auth';
import { analyzeRateLimiter } from '../middleware/rateLimit';
import { imageUpload } from '../middleware/upload';
import { saveAnalysis } from '../services/analysisStore';
import { detectFoodItems } from '../services/visionService';
import { AnalysisResult } from '../types';

export const analyzeRouter = Router();

analyzeRouter.post('/v1/meals/analyze', requireUser, analyzeRateLimiter, imageUpload, async (req, res) => {
  const file = req.file!;

  // detectFoodItems never throws; failures and empty detections both yield []
  const detections = await detectFoodItems(file.buffer, file.mimetype);

  const result: AnalysisResult = {
    analysis_id: uuidv4(),
    items: detections.map((d) => ({ item_id: uuidv4(), ...d })),
    detected_at: new Date().toISOString(),
  };

  saveAnalysis({
    userId: req.userId!,
    image: { buffer: file.buffer, mimeType: file.mimetype, size: file.size },
    result,
  });

  res.status(200).json(result);
});
