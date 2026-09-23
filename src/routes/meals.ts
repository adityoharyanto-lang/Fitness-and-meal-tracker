import { NextFunction, Request, Response, Router } from 'express';
import { requireUser } from '../middleware/auth';
import { createMealSchema } from '../schemas/meal';
import { confirmMeal } from '../services/mealService';

export const mealsRouter = Router();

mealsRouter.post('/v1/meals', requireUser, async (req: Request, res: Response, next: NextFunction) => {
  const parsed = createMealSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'validation_error',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  try {
    const meal = await confirmMeal(req.userId!, parsed.data);
    res.status(201).json(meal);
  } catch (err) {
    next(err);
  }
});
