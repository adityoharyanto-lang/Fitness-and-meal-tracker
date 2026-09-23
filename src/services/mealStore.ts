import { Meal } from '../types';

// Stub persistence layer. Swap for a real repository backed by a database.
const meals: Meal[] = [];

export async function insertMeal(meal: Meal): Promise<Meal> {
  // TODO: replace with a real DB insert, e.g.
  //   await db.insert(mealsTable).values(meal).returning();
  meals.push(meal);
  return meal;
}
