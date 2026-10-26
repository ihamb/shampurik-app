const LIMITS = Object.freeze({ ingredients: 200, dishes: 100, recipe: 100 });
const MAX_PRICE = 1_000_000;
const MAX_SALES = 1_000_000;
const MAX_QUANTITY = 1_000;
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const isText = (value, maxLength) => typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
const isId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(value);
const isNumber = (value, max) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max;
const isPrice = value => isNumber(value, MAX_PRICE) && Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
const money = value => {
  const rounded = Math.round((Math.abs(value) + 1e-9) * 100) / 100 * Math.sign(value);
  return Object.is(rounded, -0) ? 0 : rounded;
};

/** Validate the small, explicit report schema without changing the supplied data. */
export function validateData(data) {
  if (!isObject(data)) return ['Данные отчёта должны быть объектом.'];
  const errors = [];
  if (!isText(data.name, 160)) errors.push('Укажите название заведения: от 1 до 160 символов.');
  if (!isText(data.period, 120)) errors.push('Укажите период отчёта: от 1 до 120 символов.');
  const ingredientIds = new Set();
  const dishIds = new Set();

  if (!Array.isArray(data.ingredients) || data.ingredients.length < 1 || data.ingredients.length > LIMITS.ingredients) {
    errors.push(`Ингредиенты: нужен список от 1 до ${LIMITS.ingredients} позиций.`);
  } else {
    data.ingredients.forEach((ingredient, index) => {
      const label = `Ингредиент ${index + 1}`;
      if (!isObject(ingredient)) { errors.push(`${label}: ожидается объект.`); return; }
      if (!isId(ingredient.id)) errors.push(`${label}: id должен содержать 1–64 латинские буквы, цифры, «_» или «-».`);
      else if (ingredientIds.has(ingredient.id)) errors.push(`${label}: id «${ingredient.id}» уже используется.`);
      else ingredientIds.add(ingredient.id);
      if (!isText(ingredient.name, 160)) errors.push(`${label}: укажите название до 160 символов.`);
      if (!isText(ingredient.unit, 20)) errors.push(`${label}: укажите единицу измерения до 20 символов.`);
      if (!isPrice(ingredient.previousPrice)) errors.push(`${label}: прежняя цена должна быть числом от 0 до ${MAX_PRICE} с точностью до копейки.`);
      if (!isPrice(ingredient.currentPrice)) errors.push(`${label}: текущая цена должна быть числом от 0 до ${MAX_PRICE} с точностью до копейки.`);
    });
  }

  if (!Array.isArray(data.dishes) || data.dishes.length < 1 || data.dishes.length > LIMITS.dishes) {
    errors.push(`Блюда: нужен список от 1 до ${LIMITS.dishes} позиций.`);
  } else {
    data.dishes.forEach((dish, index) => {
      const label = `Блюдо ${index + 1}`;
      if (!isObject(dish)) { errors.push(`${label}: ожидается объект.`); return; }
      if (!isId(dish.id)) errors.push(`${label}: id должен содержать 1–64 латинские буквы, цифры, «_» или «-».`);
      else if (dishIds.has(dish.id)) errors.push(`${label}: id «${dish.id}» уже используется.`);
      else dishIds.add(dish.id);
      if (!isText(dish.name, 160)) errors.push(`${label}: укажите название до 160 символов.`);
      if (!isText(dish.category, 80)) errors.push(`${label}: укажите категорию до 80 символов.`);
      if (!isPrice(dish.price) || dish.price === 0) errors.push(`${label}: цена продажи должна быть больше 0 и не больше ${MAX_PRICE}, с точностью до копейки.`);
      if (!isNumber(dish.sales, MAX_SALES) || !Number.isInteger(dish.sales)) errors.push(`${label}: продажи должны быть целым числом от 0 до ${MAX_SALES}.`);
      if (!Array.isArray(dish.recipe) || dish.recipe.length < 1 || dish.recipe.length > LIMITS.recipe) {
        errors.push(`${label}: рецепт должен содержать от 1 до ${LIMITS.recipe} ингредиентов.`);
        return;
      }
      const usedIngredients = new Set();
      dish.recipe.forEach((entry, recipeIndex) => {
        const recipeLabel = `${label}, строка рецепта ${recipeIndex + 1}`;
        if (!isObject(entry)) { errors.push(`${recipeLabel}: ожидается объект.`); return; }
        if (!isId(entry.ingredientId) || !ingredientIds.has(entry.ingredientId)) errors.push(`${recipeLabel}: ингредиент не найден в справочнике.`);
        else if (usedIngredients.has(entry.ingredientId)) errors.push(`${recipeLabel}: ингредиент повторяется, объедините количество в одной строке.`);
        else usedIngredients.add(entry.ingredientId);
        if (!isNumber(entry.quantity, MAX_QUANTITY)) errors.push(`${recipeLabel}: количество должно быть числом от 0 до ${MAX_QUANTITY}.`);
      });
    });
  }
  return errors;
}

/** Ingredient contribution only: excludes labour, rent, taxes and other overhead. */
export function calculateReport(data, { targetFoodCost = 35 } = {}) {
  const errors = validateData(data);
  if (typeof targetFoodCost !== 'number' || !Number.isFinite(targetFoodCost) || targetFoodCost < 1 || targetFoodCost > 100) {
    errors.push('Целевой food cost должен быть числом от 1 до 100 процентов.');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  const ingredients = new Map(data.ingredients.map(ingredient => [ingredient.id, ingredient]));

  const dishes = data.dishes.map(dish => {
    const previousCost = money(dish.recipe.reduce((sum, entry) => sum + ingredients.get(entry.ingredientId).previousPrice * entry.quantity, 0));
    const currentCost = money(dish.recipe.reduce((sum, entry) => sum + ingredients.get(entry.ingredientId).currentPrice * entry.quantity, 0));
    const foodCostRaw = currentCost / dish.price * 100;
    const contributionPerUnit = money(dish.price - currentCost);
    const targetPrice = currentCost / (targetFoodCost / 100);
    const recommendedPrice = Math.max(0, Math.ceil((targetPrice - 1e-9) / 10) * 10);
    return {
      ...dish,
      recipe: dish.recipe.map(entry => ({ ...entry })),
      previousCost,
      currentCost,
      costIncrease: money(currentCost - previousCost),
      foodCostPercent: money(foodCostRaw),
      contributionPerUnit,
      contributionTotal: money(contributionPerUnit * dish.sales),
      recommendedPrice,
      projectedRecovery: money(Math.max(0, recommendedPrice - dish.price) * dish.sales),
      status: foodCostRaw > 45 ? 'critical' : foodCostRaw > targetFoodCost ? 'warning' : 'healthy',
    };
  });
  const totalRevenue = money(dishes.reduce((sum, dish) => sum + dish.price * dish.sales, 0));
  const totalIngredientCost = money(dishes.reduce((sum, dish) => sum + dish.currentCost * dish.sales, 0));
  const previousIngredientCost = money(dishes.reduce((sum, dish) => sum + dish.previousCost * dish.sales, 0));
  const totalContributionMargin = money(totalRevenue - totalIngredientCost);
  return {
    totalRevenue,
    totalIngredientCost,
    previousIngredientCost,
    totalContributionMargin,
    contributionMarginPercent: totalRevenue ? money(totalContributionMargin / totalRevenue * 100) : 0,
    ingredientCostIncrease: money(totalIngredientCost - previousIngredientCost),
    projectedRecovery: money(dishes.reduce((sum, dish) => sum + dish.projectedRecovery, 0)),
    targetFoodCost,
    dishes,
  };
}
